import { promises as fs } from 'node:fs'
import path from 'node:path'
import type { Item } from '../../shared/inventory'
import { CLAUDE_DIR } from '../store'
import { readAgentFiles, readCommands } from './commands'
import { readPluginHooks } from './hooks'
import { readJson, readPluginMcp, type McpContext } from './mcp'
import { itemId, readSkills } from './skills'

interface Installation {
  scope?: string
  projectPath?: string
  installPath?: string
  version?: string
}

interface Manifest {
  name?: string
  description?: string
  version?: string
  author?: { name?: string }
  // Caminhos próprios (relativos à raiz do plugin), somados às pastas padrão.
  skills?: string | string[]
  commands?: string | string[]
  agents?: string | string[]
  hooks?: unknown
  mcpServers?: unknown
}

type EnabledMap = Record<string, boolean> | undefined

const enabledIn = async (dir: string) => {
  const layers = await Promise.all(
    ['settings.json', 'settings.local.json'].map((f) => readJson<{ enabledPlugins?: EnabledMap }>(path.join(dir, f))),
  )
  return layers.map((l) => l?.enabledPlugins)
}

// Prioridade: local do projeto > projeto > local do usuário > usuário; a última camada que citar o plugin vence.
function resolveEnabled(key: string, layers: EnabledMap[]) {
  let value: boolean | undefined
  for (const layer of layers) if (layer && key in layer) value = Boolean(layer[key])
  return value ?? false
}

export interface PluginScan {
  plugins: Item[]
  contents: Item[]
}

interface ScanArgs {
  id: string
  name: string
  installPath: string
  enabled: boolean
  /** Rótulo dos itens que o plugin traz (ex.: `caveman`, `caveman (projeto)`). */
  origin: string
  /** Rótulo do próprio plugin na lista (Global, Projeto X, Conta). */
  scopeLabel: string
  meta: Record<string, unknown>
  toggleable?: boolean
}

// Lê o que um plugin traz: skills, comandos, agentes, hooks e MCPs.
async function scanPlugin(a: ScanArgs, ctx: McpContext): Promise<{ plugin: Item; contents: Item[] }> {
  const manifest = (await readJson<Manifest>(path.join(a.installPath, '.claude-plugin', 'plugin.json'))) ?? {}
  const raw = manifest as Record<string, unknown>
  const warnings = (await fs.access(a.installPath).then(() => true, () => false)) ? [] : ['Pasta de instalação não encontrada']

  const dirs = (field: 'skills' | 'commands' | 'agents') => {
    const declared = [manifest[field] ?? []].flat().filter((d): d is string => typeof d === 'string')
    return [...new Set([field, ...declared].map((d) => path.resolve(a.installPath, d)))].filter((d) => d.startsWith(a.installPath))
  }
  const roots = (field: 'skills' | 'commands' | 'agents') =>
    dirs(field).map((dir) => ({ dir, source: 'plugin' as const, origin: a.origin, prefix: a.name }))

  const [skills, commands, agents, hooks, mcps] = await Promise.all([
    readSkills(roots('skills')),
    readCommands(roots('commands')),
    readAgentFiles(roots('agents')),
    readPluginHooks(a.installPath, raw, a.origin, a.enabled),
    readPluginMcp(a.installPath, raw, a.name, a.origin, a.enabled, ctx),
  ])

  const plugin: Item = {
    id: a.id,
    kind: 'plugin',
    name: a.name,
    description: manifest.description ?? '',
    source: 'plugin',
    origin: a.scopeLabel,
    path: a.installPath,
    enabled: a.enabled,
    ...(a.toggleable ? { toggleable: true } : {}),
    ...(warnings.length ? { warnings } : {}),
    meta: {
      ...a.meta,
      version: manifest.version ?? a.meta.version,
      author: manifest.author?.name,
      counts: { skills: skills.length, commands: commands.length, agents: agents.length, hooks: hooks.length, mcp: mcps.length },
    },
  }
  const contents = [...skills, ...commands, ...agents, ...hooks].map((item) => ({ ...item, enabled: a.enabled, meta: { ...item.meta, plugin: a.name } }))
  // Os MCPs já trazem o próprio estado (desligado no projeto, autenticação pendente).
  return { plugin, contents: [...contents, ...mcps] }
}

/** Plugins instalados e o que cada um traz. */
export async function readPlugins(projectPath: string | null | undefined, ctx: McpContext): Promise<PluginScan> {
  const registry = await readJson<{ plugins?: Record<string, Installation[]> }>(
    path.join(CLAUDE_DIR, 'plugins', 'installed_plugins.json'),
  )
  const userLayers = await enabledIn(CLAUDE_DIR)
  const result: PluginScan = { plugins: [], contents: [] }
  const seen = new Set<string>()

  for (const [key, installs] of Object.entries(registry?.plugins ?? {})) {
    for (const install of installs) {
      const installPath = install.installPath
      if (!installPath) continue
      const isProject = install.scope === 'project' && Boolean(install.projectPath)
      // Com um projeto selecionado, plugins de outros projetos ficam de fora.
      if (projectPath !== undefined && isProject && install.projectPath !== projectPath) continue

      const [name, marketplace = ''] = key.split('@')
      const layers = isProject ? [...userLayers, ...(await enabledIn(path.join(install.projectPath!, '.claude')))] : userLayers
      const scanned = await scanPlugin(
        {
          id: itemId('plugin', install.scope ?? 'user', `${key}:${install.projectPath ?? ''}`),
          name: name as string,
          installPath,
          enabled: resolveEnabled(key, layers),
          origin: isProject ? `${name} (${path.basename(install.projectPath!)})` : (name as string),
          toggleable: true,
          scopeLabel: isProject ? `Projeto ${path.basename(install.projectPath!)}` : 'Global',
          meta: { key, marketplace, scope: install.scope ?? 'user', projectPath: install.projectPath, version: install.version },
        },
        ctx,
      )
      result.plugins.push(scanned.plugin)
      // O mesmo diretório instalado em dois escopos entra uma vez só.
      if (seen.has(installPath)) continue
      seen.add(installPath)
      result.contents.push(...scanned.contents)
    }
  }
  return result
}

interface SyncedManifest {
  plugins?: { pluginId?: string; version?: string }[]
}
interface SyncedMeta {
  server_plugin_id?: string
  marketplace_name?: string
  installation_preference?: string
}

/** Plugins que a conta claude.ai sincroniza para a máquina (~/.claude/plugins/synced/<org>_<conta>/<plugin>). */
export async function readSyncedPlugins(ctx: McpContext): Promise<PluginScan> {
  const base = path.join(CLAUDE_DIR, 'plugins', 'synced')
  const accounts = await fs.readdir(base, { withFileTypes: true }).catch(() => [])
  const result: PluginScan = { plugins: [], contents: [] }

  for (const account of accounts) {
    if (!account.isDirectory() || account.name.startsWith('.')) continue
    const root = path.join(base, account.name)
    const manifest = await readJson<SyncedManifest>(path.join(root, 'manifest.json'))
    const entries = await fs.readdir(root, { withFileTypes: true }).catch(() => [])

    for (const entry of entries) {
      if (!entry.isDirectory() || entry.name.startsWith('.')) continue
      const installPath = path.join(root, entry.name)
      const pluginJson = await readJson<Manifest>(path.join(installPath, '.claude-plugin', 'plugin.json'))
      if (!pluginJson) continue
      const meta = await readJson<SyncedMeta>(path.join(root, `${entry.name}.meta.json`))
      const name = pluginJson.name ?? entry.name
      const preference = meta?.installation_preference ?? ''
      const listed = manifest?.plugins?.find((p) => p.pluginId === meta?.server_plugin_id)

      const scanned = await scanPlugin(
        {
          id: itemId('plugin', 'account', installPath),
          name,
          installPath,
          enabled: preference !== 'not_available',
          origin: name,
          scopeLabel: 'Conta claude.ai',
          meta: { key: name, marketplace: meta?.marketplace_name, scope: 'account', installation: preference, version: listed?.version },
        },
        ctx,
      )
      result.plugins.push(scanned.plugin)
      result.contents.push(...scanned.contents)
    }
  }
  return result
}
