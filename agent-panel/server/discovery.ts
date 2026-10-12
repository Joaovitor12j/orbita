import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import type { DiscoveredProject } from '../shared/inventory'
import { readJson } from './inventory/mcp'
import { listProjects } from './store'

interface ClaudeProject {
  mcpServers?: Record<string, unknown>
  lastStartTime?: number
}

// Pastas que o Claude Code já abriu mas que não são projetos de verdade.
const IGNORED = [`${path.sep}.local${path.sep}`, `${path.sep}.cache${path.sep}`, `${path.sep}node_modules${path.sep}`]

const isDir = (p: string) => fs.stat(p).then((s) => s.isDirectory(), () => false)

/** Projetos conhecidos pelo Claude Code (~/.claude.json) que ainda não foram registrados no Orbita. */
export async function listDiscovered(): Promise<DiscoveredProject[]> {
  const home = os.homedir()
  const [config, registered] = await Promise.all([
    readJson<{ projects?: Record<string, ClaudeProject> }>(path.join(home, '.claude.json')),
    listProjects(),
  ])
  const known = new Set(registered.map((p) => p.path))
  const candidates = Object.entries(config?.projects ?? {}).filter(
    // O diretório pessoal usa o mesmo .claude do escopo global, então não vira projeto.
    ([dir]) => dir !== home && !known.has(dir) && !IGNORED.some((part) => `${dir}${path.sep}`.includes(part)),
  )

  const found = await Promise.all(
    candidates.map(async ([dir, entry]): Promise<DiscoveredProject | null> => {
      if (!(await isDir(dir))) return null
      return {
        path: dir,
        name: path.basename(dir),
        hasClaudeDir: await isDir(path.join(dir, '.claude')),
        mcpCount: Object.keys(entry.mcpServers ?? {}).length,
        lastStartTime: entry.lastStartTime ?? 0,
      }
    }),
  )
  return found
    .filter((p): p is DiscoveredProject => p !== null)
    .sort((a, b) => b.lastStartTime - a.lastStartTime || a.name.localeCompare(b.name))
}
