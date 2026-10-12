import { promises as fs } from 'node:fs'
import path from 'node:path'
import type { Item } from '../../shared/inventory'
import { CLAUDE_DIR } from '../store'
import { readAgentFiles, readCommands } from './commands'
import { readPluginHooks } from './hooks'
import { readPluginMcp } from './mcp'
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

const readJson = async <T,>(file: string): Promise<T | null> => {
  try {
    return JSON.parse(await fs.readFile(file, 'utf8')) as T
  } catch {
    return null
  }
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

/** Plugins instalados e o que cada um traz (skills, comandos, agentes). */
export async function readPlugins(registered: { path: string }[], projectPath?: string | null): Promise<PluginScan> {
  const registry = await readJson<{ plugins?: Record<string, Installation[]> }>(
    path.join(CLAUDE_DIR, 'plugins', 'installed_plugins.json'),
  )
  const userLayers = await enabledIn(CLAUDE_DIR)
  const plugins: Item[] = []
  const contents: Item[] = []
  const seen = new Set<string>()

  for (const [key, installs] of Object.entries(registry?.plugins ?? {})) {
    for (const install of installs) {
      const installPath = install.installPath
      if (!installPath) continue
      const isProject = install.scope === 'project' && Boolean(install.projectPath)
      // Com um projeto selecionado, plugins de outros projetos ficam de fora.
      if (projectPath !== undefined && isProject && install.projectPath !== projectPath) continue

      const manifest = (await readJson<Manifest>(path.join(installPath, '.claude-plugin', 'plugin.json'))) ?? {}
      const [name, marketplace = ''] = key.split('@')
      const layers = isProject ? [...userLayers, ...(await enabledIn(path.join(install.projectPath!, '.claude')))] : userLayers
      const enabled = resolveEnabled(key, layers)
      const origin = isProject ? `${name} (${path.basename(install.projectPath!)})` : (name as string)
      const warnings = (await fs.access(installPath).then(() => true, () => false)) ? [] : ['Pasta de instalação não encontrada']

      const dirs = (field: 'skills' | 'commands' | 'agents') => {
        const declared = [manifest[field] ?? []].flat().filter((d): d is string => typeof d === 'string')
        return [...new Set([field, ...declared].map((d) => path.resolve(installPath, d)))].filter((d) => d.startsWith(installPath))
      }
      const roots = (field: 'skills' | 'commands' | 'agents') =>
        dirs(field).map((dir) => ({ dir, source: 'plugin' as const, origin, prefix: name }))
      const [skills, commands, agents, hooks, mcps] = await Promise.all([
        readSkills(roots('skills')),
        readCommands(roots('commands')),
        readAgentFiles(roots('agents')),
        readPluginHooks(installPath, manifest as Record<string, unknown>, origin, enabled),
        readPluginMcp(installPath, manifest as Record<string, unknown>, origin, enabled),
      ])

      plugins.push({
        id: itemId('plugin', install.scope ?? 'user', `${key}:${install.projectPath ?? ''}`),
        kind: 'plugin',
        name: name as string,
        description: manifest.description ?? '',
        source: 'plugin',
        origin: isProject ? `Projeto ${path.basename(install.projectPath!)}` : 'Global',
        path: installPath,
        enabled,
        ...(warnings.length ? { warnings } : {}),
        meta: {
          key,
          marketplace,
          scope: install.scope ?? 'user',
          projectPath: install.projectPath,
          version: manifest.version ?? install.version,
          author: manifest.author?.name,
          counts: { skills: skills.length, commands: commands.length, agents: agents.length, hooks: hooks.length, mcp: mcps.length },
        },
      })

      // O mesmo diretório instalado em dois escopos entra uma vez só.
      if (seen.has(installPath)) continue
      seen.add(installPath)
      for (const item of [...skills, ...commands, ...agents, ...hooks, ...mcps]) contents.push({ ...item, enabled, meta: { ...item.meta, plugin: key } })
    }
  }
  return { plugins, contents }
}
