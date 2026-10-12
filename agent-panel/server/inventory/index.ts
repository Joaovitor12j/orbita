import path from 'node:path'
import type { Inventory, Item } from '../../shared/inventory'
import { GLOBAL_SCOPE } from '../../shared/types'
import { CLAUDE_DIR, listAgents, listProjects } from '../store'
import { readCommands } from './commands'
import { readHooks } from './hooks'
import { readConnectors, readMcp, readMcpContext } from './mcp'
import { readRules } from './rules'
import { readPlugins, readSyncedPlugins } from './plugins'
import { itemId, readSkills, type SkillRoot } from './skills'

// Prioridade quando o mesmo nome existe em vários escopos: projeto > usuário > sincronizado > plugin.
const PRIORITY = { project: 0, user: 1, synced: 2, plugin: 3 } as const

function markShadowed(items: Item[]) {
  const winners = new Map<string, Item>()
  for (const item of [...items].filter((i) => i.source !== 'plugin' && i.kind !== 'plugin').sort((a, b) => PRIORITY[a.source] - PRIORITY[b.source])) {
    const key = `${item.kind}:${item.name}`
    const winner = winners.get(key)
    if (!winner) winners.set(key, item)
    else if (winner.source !== item.source || winner.path !== item.path) item.shadowedBy = winner.id
  }
}

/** Inventário completo; `projectId` filtra os itens de projeto (os globais sempre entram). */
export async function buildInventory(projectId?: string): Promise<Inventory> {
  const projects = await listProjects()
  const scoped = projectId ? projects.filter((p) => p.id === projectId) : projects

  const skillRoots: SkillRoot[] = [
    { dir: path.join(CLAUDE_DIR, 'skills'), source: 'user', origin: 'Global', skip: ['synced'] },
    { dir: path.join(CLAUDE_DIR, 'skills', 'synced'), source: 'synced', origin: 'Conta (sincronizadas)' },
    ...scoped.map((p) => ({ dir: path.join(p.path, '.claude', 'skills'), source: 'project' as const, origin: p.name })),
  ]

  const commandRoots = [
    { dir: path.join(CLAUDE_DIR, 'commands'), source: 'user' as const, origin: 'Global' },
    ...scoped.map((p) => ({ dir: path.join(p.path, '.claude', 'commands'), source: 'project' as const, origin: p.name })),
  ]
  // undefined = todos os projetos; null = só o escopo global.
  const selected = projectId ? (scoped[0]?.path ?? null) : undefined
  const ctx = await readMcpContext(selected ?? undefined)
  const [skills, commands, scan, synced, mcps, connectors, hooks, rules, agents] = await Promise.all([
    readSkills(skillRoots),
    readCommands(commandRoots),
    readPlugins(selected, ctx),
    readSyncedPlugins(ctx),
    readMcp(scoped, selected ?? undefined),
    readConnectors(),
    readHooks(scoped),
    readRules(scoped),
    listAgents(),
  ])
  const agentItems: Item[] = agents
    .filter((a) => a.scopeId === GLOBAL_SCOPE || scoped.some((p) => p.id === a.scopeId))
    .map((a) => ({
      id: itemId('agent', a.scopeId, a.path),
      kind: 'agent',
      name: a.name,
      description: a.description,
      source: a.scopeId === GLOBAL_SCOPE ? 'user' : 'project',
      origin: a.scopeLabel,
      path: a.path,
      enabled: a.enabled,
      meta: { tools: a.tools, model: a.model, color: a.color, body: a.prompt, agentId: a.id },
    }))
  const items = [...skills, ...commands, ...scan.plugins, ...scan.contents, ...synced.plugins, ...synced.contents, ...mcps, ...connectors, ...hooks, ...rules, ...agentItems]
  markShadowed(items)
  return { items: items.sort((a, b) => a.name.localeCompare(b.name)) }
}
