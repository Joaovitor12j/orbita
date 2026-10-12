import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import type { Item } from '../../shared/inventory'
import { CLAUDE_DIR } from '../store'
import { HIDDEN, maskArgs, maskRecord, maskText, maskUrl } from './mask'
import { itemId } from './skills'

type Raw = Record<string, unknown>

export const readJson = async <T,>(file: string): Promise<T | null> => {
  try {
    return JSON.parse(await fs.readFile(file, 'utf8')) as T
  } catch {
    return null
  }
}

interface Origin {
  source: Item['source']
  origin: string
  file: string
  /** Escopo do Claude Code onde o servidor foi declarado. */
  scope: 'user' | 'local' | 'project' | 'plugin'
  enabled?: boolean
  warnings?: string[]
}

function toItem(name: string, raw: Raw, o: Origin): Item {
  const url = typeof raw.url === 'string' ? raw.url : ''
  const type = typeof raw.type === 'string' ? raw.type : url ? 'http' : 'stdio'
  const command = typeof raw.command === 'string' ? maskText(raw.command) : ''
  return {
    id: itemId('mcp', o.source, `${o.file}:${o.origin}:${name}`),
    kind: 'mcp',
    name,
    description: url ? maskUrl(url) : [command, ...maskArgs(raw.args)].filter(Boolean).join(' '),
    source: o.source,
    origin: o.origin,
    path: o.file,
    enabled: o.enabled ?? true,
    ...(o.warnings?.length ? { warnings: o.warnings } : {}),
    meta: {
      type,
      scope: o.scope,
      command,
      args: maskArgs(raw.args),
      url: maskUrl(url),
      // Só os nomes: os valores de env e headers não saem do servidor.
      env: maskRecord(raw.env),
      headers: maskRecord(raw.headers),
    },
  }
}

const servers = (value: unknown): [string, Raw][] =>
  value && typeof value === 'object' ? Object.entries(value as Record<string, Raw>).filter(([, v]) => v && typeof v === 'object') : []

interface ClaudeProject {
  mcpServers?: unknown
  disabledMcpServers?: string[] | null
  enabledMcpjsonServers?: string[] | null
  disabledMcpjsonServers?: string[] | null
}

/** MCPs do usuário, locais ao projeto (~/.claude.json) e compartilhados (.mcp.json). */
export async function readMcp(projects: { name: string; path: string }[], selectedPath?: string): Promise<Item[]> {
  const file = path.join(os.homedir(), '.claude.json')
  const config = await readJson<{ mcpServers?: unknown; projects?: Record<string, ClaudeProject> }>(file)
  const items: Item[] = []
  const selected = selectedPath ? config?.projects?.[selectedPath] : undefined
  const disabledHere = new Set(selected?.disabledMcpServers ?? [])

  for (const [name, raw] of servers(config?.mcpServers)) {
    items.push(toItem(name, raw, { source: 'user', origin: 'Global', file, scope: 'user', enabled: !disabledHere.has(name) }))
  }

  for (const project of projects) {
    const entry = config?.projects?.[project.path]
    for (const [name, raw] of servers(entry?.mcpServers)) {
      items.push(toItem(name, raw, { source: 'project', origin: project.name, file, scope: 'local', enabled: !(entry?.disabledMcpServers ?? []).includes(name) }))
    }

    const shared = path.join(project.path, '.mcp.json')
    const mcpjson = await readJson<{ mcpServers?: unknown }>(shared)
    for (const [name, raw] of servers(mcpjson?.mcpServers)) {
      // Servidores de .mcp.json precisam de aprovação do usuário antes de rodar.
      const approved = (entry?.enabledMcpjsonServers ?? []).includes(name)
      const rejected = (entry?.disabledMcpjsonServers ?? []).includes(name)
      items.push(
        toItem(name, raw, {
          source: 'project',
          origin: project.name,
          file: shared,
          scope: 'project',
          enabled: approved && !rejected,
          warnings: approved || rejected ? [] : ['Aguardando aprovação no Claude Code'],
        }),
      )
    }
  }
  return items
}

export interface McpContext {
  /** Nomes completos (`plugin:<plugin>:<servidor>`) que o Claude Code marcou como precisando de autenticação. */
  authPending: Set<string>
  /** Servidores desligados no projeto selecionado (`disabledMcpServers`). */
  disabled: Set<string>
}

export async function readMcpContext(selected?: string): Promise<McpContext> {
  const [needsAuth, config] = await Promise.all([
    readJson<Record<string, unknown>>(path.join(CLAUDE_DIR, 'mcp-needs-auth-cache.json')),
    readJson<{ projects?: Record<string, ClaudeProject> }>(path.join(os.homedir(), '.claude.json')),
  ])
  return {
    authPending: new Set(Object.keys(needsAuth ?? {})),
    disabled: new Set((selected ? config?.projects?.[selected]?.disabledMcpServers : null) ?? []),
  }
}

// `mcpServers` do manifesto pode ser um objeto, um caminho para .mcp.json ou uma lista deles.
async function declaredServers(installPath: string, manifest: Raw): Promise<[string, Raw, string][]> {
  const pointers = [manifest.mcpServers].flat().filter((v) => v !== undefined)
  const found: [string, Raw, string][] = []
  for (const pointer of pointers) {
    if (typeof pointer === 'string') {
      const file = path.resolve(installPath, pointer)
      if (!file.startsWith(installPath)) continue
      const json = await readJson<Raw>(file)
      found.push(...servers(json && 'mcpServers' in json ? json.mcpServers : json).map(([n, r]): [string, Raw, string] => [n, r, file]))
    } else found.push(...servers(pointer).map(([n, r]): [string, Raw, string] => [n, r, path.join(installPath, '.claude-plugin', 'plugin.json')]))
  }
  return found
}

/** MCPs que um plugin declara (.mcp.json ou `mcpServers` no manifesto). */
export async function readPluginMcp(
  installPath: string,
  manifest: Raw,
  plugin: string,
  origin: string,
  enabled: boolean,
  ctx: McpContext,
): Promise<Item[]> {
  const file = path.join(installPath, '.mcp.json')
  const fromFile = await readJson<Raw>(file)
  const list: [string, Raw, string][] = [
    ...servers(fromFile && 'mcpServers' in fromFile ? fromFile.mcpServers : fromFile).map(([n, r]): [string, Raw, string] => [n, r, file]),
    ...(await declaredServers(installPath, manifest)),
  ]
  const seen = new Set<string>()
  return list.flatMap(([name, raw, source]) => {
    if (seen.has(name)) return []
    seen.add(name)
    const fullName = `plugin:${plugin}:${name}`
    const item = toItem(name, raw, {
      source: 'plugin',
      origin,
      file: source,
      scope: 'plugin',
      enabled: enabled && !ctx.disabled.has(fullName),
      warnings: ctx.authPending.has(fullName) ? ['Requer autenticação (OAuth) no Claude Code'] : [],
    })
    item.meta = { ...item.meta, fullName, plugin }
    return [item]
  })
}

/** Conectores claude.ai já usados nesta conta (não ficam em arquivo; só o histórico é conhecido). */
export async function readConnectors(): Promise<Item[]> {
  const file = path.join(os.homedir(), '.claude.json')
  const config = await readJson<{ claudeAiMcpEverConnected?: string[] }>(file)
  return (config?.claudeAiMcpEverConnected ?? []).map((raw) => {
    const name = raw.replace(/^claude\.ai\s+/i, '')
    return {
      id: itemId('mcp', 'synced', `connector:${raw}`),
      kind: 'mcp',
      name,
      description: 'Conector da conta claude.ai (gerenciado em claude.ai/settings/connectors)',
      source: 'synced',
      origin: 'Conectores claude.ai',
      path: file,
      enabled: true,
      warnings: ['O Orbita só sabe que este conector já foi conectado, não o estado atual'],
      meta: { type: 'connector', scope: 'connector', fullName: raw },
    } satisfies Item
  })
}

export { HIDDEN }

const pick = (container: unknown, name: string): Raw | null => {
  const found = container && typeof container === 'object' ? (container as Record<string, unknown>)[name] : null
  return found && typeof found === 'object' ? (found as Raw) : null
}

/**
 * Definição completa (com env e headers reais) de um servidor, lida de volta do arquivo de origem.
 * Só o servidor usa isto, para gerar o mcp.json de um harness: nunca vai para o navegador.
 */
export async function readRawServer(item: Item, projectPaths: Map<string, string>): Promise<Raw | null> {
  const json = await readJson<Raw>(item.path)
  if (!json) return null
  if (item.meta.scope === 'local') {
    const dir = projectPaths.get(item.origin)
    return dir ? pick(pick((json.projects as Raw) ?? {}, dir)?.mcpServers, item.name) : null
  }
  return pick(json.mcpServers, item.name) ?? pick(json, item.name)
}
