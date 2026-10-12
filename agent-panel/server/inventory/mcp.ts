import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import type { Item } from '../../shared/inventory'
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

/** MCPs que um plugin declara (.mcp.json ou `mcpServers` no manifesto). */
export async function readPluginMcp(installPath: string, manifest: Raw, origin: string, enabled: boolean): Promise<Item[]> {
  const file = path.join(installPath, '.mcp.json')
  const fromFile = await readJson<Raw>(file)
  const declared = fromFile && 'mcpServers' in fromFile ? fromFile.mcpServers : fromFile
  const list = [...servers(declared), ...servers(manifest.mcpServers)]
  return list.map(([name, raw]) => toItem(name, raw, { source: 'plugin', origin, file, scope: 'plugin', enabled }))
}

export { HIDDEN }
