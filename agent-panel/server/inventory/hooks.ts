import path from 'node:path'
import type { Item } from '../../shared/inventory'
import { CLAUDE_DIR } from '../store'
import { readJson } from './mcp'
import { maskText } from './mask'
import { itemId } from './skills'

interface HookCommand {
  type?: string
  command?: string
  url?: string
  prompt?: string
  timeout?: number
}
interface HookGroup {
  matcher?: string
  hooks?: HookCommand[]
}
type HookMap = Record<string, HookGroup[]>

interface Origin {
  source: Item['source']
  origin: string
  file: string
  enabled?: boolean
}

export function hookItems(map: unknown, o: Origin): Item[] {
  if (!map || typeof map !== 'object') return []
  const items: Item[] = []
  for (const [event, groups] of Object.entries(map as HookMap)) {
    if (!Array.isArray(groups)) continue
    for (const group of groups) {
      for (const hook of group.hooks ?? []) {
        const type = hook.type ?? 'command'
        const target = hook.command ?? hook.url ?? hook.prompt ?? ''
        const text = maskText(String(target)).replace(/\s+/g, ' ').trim()
        items.push({
          id: itemId('hook', o.source, `${o.file}:${event}:${group.matcher ?? ''}:${target}`),
          kind: 'hook',
          name: group.matcher ? `${event} · ${group.matcher}` : event,
          description: text,
          source: o.source,
          origin: o.origin,
          path: o.file,
          enabled: o.enabled ?? true,
          meta: { event, matcher: group.matcher ?? '', type, command: maskText(String(target)), timeout: hook.timeout },
        })
      }
    }
  }
  return items
}

const SETTINGS = ['settings.json', 'settings.local.json']

export async function readHooks(projects: { name: string; path: string }[]): Promise<Item[]> {
  const targets = [
    ...SETTINGS.map((f) => ({ file: path.join(CLAUDE_DIR, f), source: 'user' as const, origin: 'Global' })),
    ...projects.flatMap((p) =>
      SETTINGS.map((f) => ({ file: path.join(p.path, '.claude', f), source: 'project' as const, origin: p.name })),
    ),
  ]
  const groups = await Promise.all(
    targets.map(async (t) => hookItems((await readJson<{ hooks?: unknown }>(t.file))?.hooks, t)),
  )
  return groups.flat()
}

/** Hooks de um plugin: inline no manifesto ou em hooks/hooks.json. */
export async function readPluginHooks(installPath: string, manifest: Record<string, unknown>, origin: string, enabled: boolean) {
  const o = { source: 'plugin' as const, origin, enabled }
  const inline = typeof manifest.hooks === 'object' && manifest.hooks ? manifest.hooks : null
  const pointer = typeof manifest.hooks === 'string' ? path.resolve(installPath, manifest.hooks) : path.join(installPath, 'hooks', 'hooks.json')
  const file = pointer.startsWith(installPath) ? await readJson<{ hooks?: unknown }>(pointer) : null
  return [
    ...hookItems(inline, { ...o, file: path.join(installPath, '.claude-plugin', 'plugin.json') }),
    ...hookItems(file?.hooks ?? file, { ...o, file: pointer }),
  ]
}
