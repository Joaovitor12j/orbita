import { createHash } from 'node:crypto'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import type { Item, ItemSource } from '../../shared/inventory'
import { parseAgentFile } from '../frontmatter'

const SKILL_FILE = 'SKILL.md'
const MAX_DEPTH = 3

export const itemId = (kind: string, source: string, file: string) =>
  createHash('sha1').update(`${kind}:${source}:${file}`).digest('hex').slice(0, 12)

// Procura pastas com SKILL.md até MAX_DEPTH níveis (cobre ~/.claude/skills/synced/<uuid>/<skill>).
async function findSkillFiles(dir: string, skip: string[] = [], depth = 0): Promise<string[]> {
  const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => [])
  const found: string[] = []
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name.startsWith('.') || skip.includes(entry.name)) continue
    const sub = path.join(dir, entry.name)
    if (await fs.access(path.join(sub, SKILL_FILE)).then(() => true, () => false)) found.push(path.join(sub, SKILL_FILE))
    else if (depth < MAX_DEPTH - 1) found.push(...(await findSkillFiles(sub, [], depth + 1)))
  }
  return found
}

export interface SkillRoot {
  dir: string
  source: ItemSource
  origin: string
  /** Subpastas ignoradas na raiz (lidas como outra origem). */
  skip?: string[]
}

async function readSkill(file: string, root: SkillRoot): Promise<Item> {
  const warnings: string[] = []
  const stat = await fs.stat(file).catch(() => null)
  const raw = await fs.readFile(file, 'utf8').catch(() => {
    warnings.push('Não foi possível ler o arquivo')
    return ''
  })
  const { meta, prompt } = parseAgentFile(raw)
  const folder = path.basename(path.dirname(file))
  const name = typeof meta.name === 'string' && meta.name ? meta.name : folder
  const description = typeof meta.description === 'string' ? meta.description : ''
  if (!Object.keys(meta).length) warnings.push('Sem frontmatter')
  else if (!description) warnings.push('Sem description: o Claude não saberá quando usar')
  if (name !== folder) warnings.push(`Nome "${name}" difere da pasta "${folder}"`)

  const { name: _n, description: _d, ...rest } = meta
  return {
    id: itemId('skill', root.source, file),
    kind: 'skill',
    name,
    description,
    source: root.source,
    origin: root.origin,
    path: file,
    enabled: true,
    editable: root.source === 'user' || root.source === 'project',
    ...(warnings.length ? { warnings } : {}),
    meta: { ...rest, bytes: Buffer.byteLength(raw), body: prompt, mtime: stat?.mtimeMs },
  }
}

export async function readSkills(roots: SkillRoot[]): Promise<Item[]> {
  const groups = await Promise.all(
    roots.map(async (root) => {
      const files = await findSkillFiles(root.dir, root.skip)
      return Promise.all(files.map((file) => readSkill(file, root)))
    }),
  )
  return groups.flat()
}
