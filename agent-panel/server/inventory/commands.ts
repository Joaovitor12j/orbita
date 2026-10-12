import { promises as fs } from 'node:fs'
import path from 'node:path'
import type { Item, ItemSource } from '../../shared/inventory'
import { parseAgentFile } from '../frontmatter'
import { itemId } from './skills'

export interface DirRoot {
  dir: string
  source: ItemSource
  origin: string
  /** Prefixo do nome (plugins usam `plugin:comando`). */
  prefix?: string
}

// Lista .md de uma pasta; subpastas viram namespace (`git/commit.md` -> `git:commit`).
async function markdownFiles(dir: string, base = ''): Promise<{ file: string; rel: string }[]> {
  const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => [])
  const found: { file: string; rel: string }[] = []
  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) found.push(...(await markdownFiles(full, `${base}${entry.name}:`)))
    else if (entry.name.endsWith('.md')) found.push({ file: full, rel: base + entry.name.slice(0, -3) })
  }
  return found
}

export async function readCommands(roots: DirRoot[]): Promise<Item[]> {
  const groups = await Promise.all(
    roots.map(async (root) => {
      const files = await markdownFiles(root.dir)
      return Promise.all(
        files.map(async ({ file, rel }): Promise<Item> => {
          const stat = await fs.stat(file).catch(() => null)
          const raw = await fs.readFile(file, 'utf8').catch(() => '')
          const { meta, prompt } = parseAgentFile(raw)
          const description = typeof meta.description === 'string' ? meta.description : ''
          const warnings = description ? [] : ['Sem description: o comando aparece sem explicação em /help']
          return {
            id: itemId('command', root.source, file),
            kind: 'command',
            name: `${root.prefix ? `${root.prefix}:` : ''}${rel}`,
            description,
            source: root.source,
            origin: root.origin,
            path: file,
            enabled: true,
            editable: root.source === 'user' || root.source === 'project',
            ...(warnings.length ? { warnings } : {}),
            meta: { ...meta, body: prompt, mtime: stat?.mtimeMs },
          }
        }),
      )
    }),
  )
  return groups.flat()
}

/** Agentes em arquivos .md soltos (usado para os que vêm dentro de plugins). */
export async function readAgentFiles(roots: DirRoot[]): Promise<Item[]> {
  const groups = await Promise.all(
    roots.map(async (root) => {
      const entries = await fs.readdir(root.dir, { withFileTypes: true }).catch(() => [])
      const files = entries.filter((e) => e.isFile() && e.name.endsWith('.md')).map((e) => path.join(root.dir, e.name))
      return Promise.all(
        files.map(async (file): Promise<Item> => {
          const { meta, prompt } = parseAgentFile(await fs.readFile(file, 'utf8').catch(() => ''))
          const fallback = path.basename(file, '.md')
          const name = typeof meta.name === 'string' && meta.name ? meta.name : fallback
          const description = typeof meta.description === 'string' ? meta.description : ''
          return {
            id: itemId('agent', root.source, file),
            kind: 'agent',
            name: `${root.prefix ? `${root.prefix}:` : ''}${name}`,
            description,
            source: root.source,
            origin: root.origin,
            path: file,
            enabled: true,
            meta: { tools: meta.tools, model: meta.model, color: meta.color, body: prompt },
          }
        }),
      )
    }),
  )
  return groups.flat()
}
