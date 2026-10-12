import { createHash } from 'node:crypto'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { HTTPException } from 'hono/http-exception'
import { EDITABLE_FIELDS, type EditableKind, type ItemInput, type ItemVersion } from '../shared/inventory'
import { GLOBAL_SCOPE } from '../shared/types'
import { parseAgentFile, serializeAgentFile } from './frontmatter'
import { CLAUDE_DIR, CONFIG_DIR, listProjects } from './store'

// Escrita de skills e comandos de usuário e projeto. O servidor só toca em arquivos dentro das
// pastas `skills/` e `commands/` do escopo global e dos projetos registrados: nunca em plugins.

const SKILL_NAME = /^[a-z0-9][a-z0-9-]{0,63}$/
const COMMAND_NAME = /^[a-z0-9][a-z0-9-]{0,63}(:[a-z0-9][a-z0-9-]{0,63}){0,2}$/
const DESCRIPTION_MAX = 1024
const HISTORY_DIR = path.join(CONFIG_DIR, 'history')
const HISTORY_KEEP = 20
const SKILL_FILE = 'SKILL.md'

const fail = (status: 400 | 404 | 409, message: string): never => {
  throw new HTTPException(status, { message })
}

interface Base {
  scopeId: string
  skills: string
  commands: string
}

async function bases(): Promise<Base[]> {
  const projects = await listProjects()
  return [
    { scopeId: GLOBAL_SCOPE, skills: path.join(CLAUDE_DIR, 'skills'), commands: path.join(CLAUDE_DIR, 'commands') },
    ...projects.map((p) => ({
      scopeId: p.id,
      skills: path.join(p.path, '.claude', 'skills'),
      commands: path.join(p.path, '.claude', 'commands'),
    })),
  ]
}

const inside = (root: string, target: string) => {
  const rel = path.relative(root, target)
  return rel !== '' && !rel.startsWith('..') && !path.isAbsolute(rel)
}

interface Located {
  kind: EditableKind
  base: Base
  file: string
}

// Confere que o arquivo é exatamente uma skill (<skills>/<nome>/SKILL.md) ou um comando (<commands>/**/*.md).
async function locate(file: string): Promise<Located> {
  const target = path.resolve(file)
  for (const base of await bases()) {
    if (inside(base.skills, target)) {
      const parts = path.relative(base.skills, target).split(path.sep)
      if (parts.length === 2 && parts[1] === SKILL_FILE && SKILL_NAME.test(parts[0]!)) return { kind: 'skill', base, file: target }
    }
    if (inside(base.commands, target) && target.endsWith('.md')) {
      const parts = path.relative(base.commands, target).split(path.sep)
      if (parts.length <= 3 && parts.every((p) => !p.startsWith('.'))) return { kind: 'command', base, file: target }
    }
  }
  return fail(400, 'Este arquivo não pode ser editado pelo Orbita (só skills e comandos de usuário e projeto)')
}

function validate(kind: EditableKind, input: ItemInput) {
  if (!input.description?.trim()) fail(400, 'Descrição é obrigatória')
  if (input.description.length > DESCRIPTION_MAX) fail(400, `Descrição passa de ${DESCRIPTION_MAX} caracteres`)
  if (!input.body?.trim()) fail(400, kind === 'skill' ? 'O conteúdo da skill é obrigatório' : 'O conteúdo do comando é obrigatório')
}

const allowedFields = (kind: EditableKind) => new Set(EDITABLE_FIELDS[kind].map((f) => f.key))

function buildMeta(base: Record<string, unknown>, kind: EditableKind, input: ItemInput, name?: string) {
  const meta: Record<string, unknown> = { ...base }
  if (name) meta.name = name
  meta.description = input.description.trim()
  for (const key of allowedFields(kind)) {
    const value = input.fields?.[key]?.trim()
    if (value) meta[key] = value
    else delete meta[key]
  }
  // Comandos não usam `name` no frontmatter; mantém só o que já existia.
  if (kind === 'command' && !name) delete meta.name
  return meta
}

const historyDir = (file: string) => path.join(HISTORY_DIR, createHash('sha1').update(file).digest('hex').slice(0, 12))

// Guarda a versão atual antes de sobrescrever ou apagar, mantendo as últimas HISTORY_KEEP.
async function backup(file: string) {
  const raw = await fs.readFile(file, 'utf8').catch(() => null)
  if (raw === null) return
  const dir = historyDir(file)
  await fs.mkdir(dir, { recursive: true })
  const existing = (await fs.readdir(dir).catch(() => [] as string[])).filter((n) => n.endsWith('.md')).sort()
  const last = existing.at(-1)
  // Não repete a versão idêntica à última guardada.
  if (last && (await fs.readFile(path.join(dir, last), 'utf8').catch(() => null)) === raw) return
  await fs.writeFile(path.join(dir, `${Date.now()}.md`), raw)
  for (const old of existing.slice(0, Math.max(0, existing.length + 1 - HISTORY_KEEP))) await fs.unlink(path.join(dir, old)).catch(() => undefined)
}

async function writeAtomic(file: string, content: string) {
  await fs.mkdir(path.dirname(file), { recursive: true })
  const temp = `${file}.orbita-${process.pid}.tmp`
  await fs.writeFile(temp, content)
  await fs.rename(temp, file)
}

export interface Written {
  path: string
  mtime: number
}

const written = async (file: string): Promise<Written> => ({ path: file, mtime: (await fs.stat(file)).mtimeMs })

export async function createItem(input: ItemInput): Promise<Written> {
  const kind = input.kind
  if (kind !== 'skill' && kind !== 'command') fail(400, 'Tipo inválido')
  const name = (input.name ?? '').trim()
  if (!(kind === 'skill' ? SKILL_NAME : COMMAND_NAME).test(name)) {
    fail(400, 'Nome deve usar letras minúsculas, números e hífens' + (kind === 'command' ? ' (":" cria subpastas)' : ''))
  }
  validate(kind, input)
  const base = (await bases()).find((b) => b.scopeId === (input.scopeId ?? GLOBAL_SCOPE))
  if (!base) return fail(404, 'Escopo não encontrado')

  const file =
    kind === 'skill' ? path.join(base!.skills, name, SKILL_FILE) : path.join(base!.commands, ...name.split(':')) + '.md'
  if (await fs.access(file).then(() => true, () => false)) fail(409, `Já existe ${kind === 'skill' ? 'uma skill' : 'um comando'} com esse nome neste escopo`)

  await writeAtomic(file, serializeAgentFile(buildMeta({}, kind, input, kind === 'skill' ? name : undefined), input.body))
  return written(file)
}

export async function updateItem(file: string, input: ItemInput): Promise<Written> {
  const located = await locate(file)
  validate(located.kind, input)
  const stat = await fs.stat(located.file).catch(() => null)
  if (!stat) return fail(404, 'Arquivo não encontrado')
  if (input.mtime !== undefined && Math.abs(stat!.mtimeMs - input.mtime) > 1) {
    fail(409, 'O arquivo mudou no disco desde que você o abriu. Feche e abra de novo para ver a versão atual')
  }
  const { meta } = parseAgentFile(await fs.readFile(located.file, 'utf8'))
  await backup(located.file)
  // Campos que o editor não conhece (ex.: `license`) são preservados como estavam.
  await writeAtomic(located.file, serializeAgentFile(buildMeta(meta, located.kind, input, located.kind === 'skill' ? String(meta.name ?? path.basename(path.dirname(located.file))) : undefined), input.body))
  return written(located.file)
}

export async function deleteItem(file: string): Promise<void> {
  const located = await locate(file)
  if (!(await fs.access(located.file).then(() => true, () => false))) fail(404, 'Arquivo não encontrado')
  await backup(located.file)
  await fs.unlink(located.file)
  // Remove a pasta da skill se ficou vazia (mantém se tiver scripts ou referências).
  if (located.kind === 'skill') await fs.rmdir(path.dirname(located.file)).catch(() => undefined)
}

export async function listVersions(file: string): Promise<ItemVersion[]> {
  const located = await locate(file)
  const dir = historyDir(located.file)
  const names = (await fs.readdir(dir).catch(() => [] as string[])).filter((n) => n.endsWith('.md')).sort().reverse()
  return Promise.all(
    names.map(async (n) => {
      const version = n.slice(0, -3)
      return { version, createdAt: new Date(Number(version)).toISOString(), bytes: (await fs.stat(path.join(dir, n))).size }
    }),
  )
}

export async function readVersion(file: string, version: string): Promise<string> {
  const located = await locate(file)
  if (!/^\d+$/.test(version)) fail(400, 'Versão inválida')
  return fs.readFile(path.join(historyDir(located.file), `${version}.md`), 'utf8').catch(() => fail(404, 'Versão não encontrada'))
}

export async function restoreVersion(file: string, version: string): Promise<Written> {
  const located = await locate(file)
  const content = await readVersion(file, version)
  await backup(located.file)
  await writeAtomic(located.file, content)
  return written(located.file)
}
