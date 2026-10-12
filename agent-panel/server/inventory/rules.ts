import { promises as fs } from 'node:fs'
import path from 'node:path'
import type { Item, ItemSource } from '../../shared/inventory'
import { parseAgentFile } from '../frontmatter'
import { CLAUDE_DIR } from '../store'
import { itemId } from './skills'

interface Root {
  base: string
  source: ItemSource
  origin: string
  /** Pasta que guarda CLAUDE.md e rules/ (~/.claude ou <projeto>/.claude). */
  claudeDir: string
}

const clip = (text: string, max = 140) => (text.length > max ? `${text.slice(0, max - 1)}…` : text)

// Primeira linha com conteúdo, sem marcação de título.
const summarize = (body: string) => {
  const line = body.split('\n').map((l) => l.replace(/^#+\s*/, '').trim()).find(Boolean)
  return clip(line ?? '')
}

async function ruleFiles(dir: string): Promise<string[]> {
  const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => [])
  const found: string[] = []
  for (const e of entries) {
    const full = path.join(dir, e.name)
    if (e.isDirectory()) found.push(...(await ruleFiles(full)))
    else if (e.name.endsWith('.md')) found.push(full)
  }
  return found
}

async function toRule(file: string, label: string, root: Root): Promise<Item | null> {
  const raw = await fs.readFile(file, 'utf8').catch(() => null)
  if (raw === null) return null
  const { meta, prompt } = parseAgentFile(raw)
  return {
    id: itemId('rule', root.source, file),
    kind: 'rule',
    name: label,
    description: summarize(prompt),
    source: root.source,
    origin: root.origin,
    path: file,
    enabled: true,
    meta: { paths: meta.paths, bytes: Buffer.byteLength(raw), body: prompt },
  }
}

export async function readRules(projects: { name: string; path: string }[]): Promise<Item[]> {
  const roots: Root[] = [
    { base: CLAUDE_DIR, source: 'user', origin: 'Global', claudeDir: CLAUDE_DIR },
    ...projects.map((p) => ({ base: p.path, source: 'project' as const, origin: p.name, claudeDir: path.join(p.path, '.claude') })),
  ]
  const items: Item[] = []
  for (const root of roots) {
    const memory = [
      path.join(root.claudeDir, 'CLAUDE.md'),
      ...(root.source === 'project' ? [path.join(root.base, 'CLAUDE.md'), path.join(root.base, 'CLAUDE.local.md')] : []),
    ]
    for (const file of memory) {
      const item = await toRule(file, path.basename(file), root)
      if (item) items.push(item)
    }
    const dir = path.join(root.claudeDir, 'rules')
    for (const file of await ruleFiles(dir)) {
      const item = await toRule(file, path.relative(dir, file), root)
      if (item) items.push(item)
    }
  }
  return items
}
