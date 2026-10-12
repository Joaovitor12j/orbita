import { createHash } from 'node:crypto'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { HTTPException } from 'hono/http-exception'
import { GLOBAL_SCOPE, type Agent, type AgentInput, type Project } from '../shared/types'
import { normalizeTools, parseAgentFile, serializeAgentFile } from './frontmatter'

const HOME = process.env.ORBITA_HOME ?? os.homedir()
export const CONFIG_DIR = path.join(HOME, '.config', 'orbita')
export const CLAUDE_DIR = path.join(HOME, '.claude')
const CONFIG_FILE = path.join(CONFIG_DIR, 'projects.json')
const GLOBAL_DIR = path.join(CLAUDE_DIR, 'agents')
const FILE_PATTERN = /^[a-z0-9][a-z0-9-]*\.md(\.disabled)?$/
const NAME_PATTERN = /^[a-z0-9][a-z0-9-]*$/
const DISABLED_SUFFIX = '.disabled'

const fail = (status: 400 | 404 | 409, message: string): never => {
  throw new HTTPException(status, { message })
}

const encodeId = (scopeId: string, file: string) =>
  Buffer.from(`${scopeId}/${file}`).toString('base64url')

const decodeId = (id: string) => {
  const [scopeId, file, ...rest] = Buffer.from(id, 'base64url').toString().split('/')
  if (!scopeId || !file || rest.length || !FILE_PATTERN.test(file)) fail(400, 'ID de agente inválido')
  return { scopeId: scopeId as string, file: file as string }
}

const projectId = (projectPath: string) =>
  createHash('sha1').update(projectPath).digest('hex').slice(0, 10)

const exists = (target: string) =>
  fs.access(target).then(
    () => true,
    () => false,
  )

export async function listProjects(): Promise<Project[]> {
  const raw = await fs.readFile(CONFIG_FILE, 'utf8').catch(() => '[]')
  return JSON.parse(raw) as Project[]
}

async function saveProjects(projects: Project[]) {
  await fs.mkdir(path.dirname(CONFIG_FILE), { recursive: true })
  await fs.writeFile(CONFIG_FILE, JSON.stringify(projects, null, 2))
}

export async function addProject(input: string): Promise<Project> {
  const resolved = path.resolve(input.startsWith('~') ? path.join(HOME, input.slice(1)) : input)
  const stat = await fs.stat(resolved).catch(() => null)
  if (!stat?.isDirectory()) fail(400, 'Diretório não encontrado')

  const projects = await listProjects()
  const id = projectId(resolved)
  if (projects.some((p) => p.id === id)) fail(409, 'Projeto já registrado')

  const project: Project = { id, name: path.basename(resolved), path: resolved }
  await saveProjects([...projects, project])
  return project
}

export async function removeProject(id: string) {
  const projects = await listProjects()
  await saveProjects(projects.filter((p) => p.id !== id))
}

async function scopeDir(scopeId: string): Promise<{ dir: string; label: string }> {
  if (scopeId === GLOBAL_SCOPE) return { dir: GLOBAL_DIR, label: 'Global' }
  const project = (await listProjects()).find((p) => p.id === scopeId)
  if (!project) fail(404, 'Escopo não encontrado')
  return { dir: path.join(project!.path, '.claude', 'agents'), label: project!.name }
}

async function readAgent(dir: string, scopeId: string, label: string, file: string): Promise<Agent> {
  const full = path.join(dir, file)
  const [raw, stat] = await Promise.all([fs.readFile(full, 'utf8'), fs.stat(full)])
  const { meta, prompt } = parseAgentFile(raw)
  const enabled = !file.endsWith(DISABLED_SUFFIX)
  const fallbackName = file.replace(/\.md(\.disabled)?$/, '')

  return {
    id: encodeId(scopeId, file),
    name: typeof meta.name === 'string' ? meta.name : fallbackName,
    description: typeof meta.description === 'string' ? meta.description : '',
    tools: normalizeTools(meta.tools),
    model: typeof meta.model === 'string' ? meta.model : '',
    color: typeof meta.color === 'string' ? meta.color : '',
    prompt,
    enabled,
    scopeId,
    scopeLabel: label,
    path: full,
    updatedAt: stat.mtime.toISOString(),
  }
}

async function readScope(scopeId: string): Promise<Agent[]> {
  const { dir, label } = await scopeDir(scopeId)
  const files = await fs.readdir(dir).catch(() => [] as string[])
  const valid = files.filter((f) => FILE_PATTERN.test(f))
  return Promise.all(valid.map((file) => readAgent(dir, scopeId, label, file)))
}

export async function listAgents(): Promise<Agent[]> {
  const projects = await listProjects()
  const scopes = [GLOBAL_SCOPE, ...projects.map((p) => p.id)]
  const groups = await Promise.all(scopes.map(readScope))
  return groups.flat().sort((a, b) => a.name.localeCompare(b.name))
}

const validate = (input: AgentInput) => {
  if (!NAME_PATTERN.test(input.name)) fail(400, 'Nome deve usar apenas letras minúsculas, números e hífens')
  if (!input.description.trim()) fail(400, 'Descrição é obrigatória')
  if (!input.prompt.trim()) fail(400, 'Prompt do sistema é obrigatório')
}

const buildMeta = (base: Record<string, unknown>, input: AgentInput) => {
  const meta: Record<string, unknown> = { ...base, name: input.name, description: input.description.trim() }
  const optional: Record<string, string> = {
    tools: input.tools.join(', '),
    model: input.model,
    color: input.color,
  }
  for (const [key, value] of Object.entries(optional)) {
    if (value) meta[key] = value
    else delete meta[key]
  }
  return meta
}

export async function createAgent(input: AgentInput): Promise<Agent> {
  validate(input)
  const { dir, label } = await scopeDir(input.scopeId)
  const file = `${input.name}.md`
  const target = path.join(dir, file)
  if ((await exists(target)) || (await exists(target + DISABLED_SUFFIX))) fail(409, 'Já existe um agente com esse nome neste escopo')

  await fs.mkdir(dir, { recursive: true })
  await fs.writeFile(target, serializeAgentFile(buildMeta({}, input), input.prompt))
  return readAgent(dir, input.scopeId, label, file)
}

export async function updateAgent(id: string, input: AgentInput): Promise<Agent> {
  validate(input)
  const { scopeId, file } = decodeId(id)
  const { dir, label } = await scopeDir(scopeId)
  const current = path.join(dir, file)
  if (!(await exists(current))) fail(404, 'Agente não encontrado')

  const suffix = file.endsWith(DISABLED_SUFFIX) ? DISABLED_SUFFIX : ''
  const nextFile = `${input.name}.md${suffix}`
  const target = path.join(dir, nextFile)
  if (nextFile !== file && (await exists(target))) fail(409, 'Já existe um agente com esse nome neste escopo')

  const { meta } = parseAgentFile(await fs.readFile(current, 'utf8'))
  await fs.writeFile(target, serializeAgentFile(buildMeta(meta, input), input.prompt))
  if (nextFile !== file) await fs.unlink(current)
  return readAgent(dir, scopeId, label, nextFile)
}

export async function toggleAgent(id: string): Promise<Agent> {
  const { scopeId, file } = decodeId(id)
  const { dir, label } = await scopeDir(scopeId)
  const nextFile = file.endsWith(DISABLED_SUFFIX) ? file.slice(0, -DISABLED_SUFFIX.length) : file + DISABLED_SUFFIX
  if (!(await exists(path.join(dir, file)))) fail(404, 'Agente não encontrado')
  if (await exists(path.join(dir, nextFile))) fail(409, 'Conflito de nome ao alternar estado')

  await fs.rename(path.join(dir, file), path.join(dir, nextFile))
  return readAgent(dir, scopeId, label, nextFile)
}

export async function removeAgent(id: string) {
  const { scopeId, file } = decodeId(id)
  const { dir } = await scopeDir(scopeId)
  const target = path.join(dir, file)
  if (!(await exists(target))) fail(404, 'Agente não encontrado')
  await fs.unlink(target)
}

export async function copyAgent(id: string, targetScopeId: string): Promise<Agent> {
  const { scopeId, file } = decodeId(id)
  const source = await scopeDir(scopeId)
  const sourcePath = path.join(source.dir, file)
  if (!(await exists(sourcePath))) fail(404, 'Agente não encontrado')
  const raw = await fs.readFile(sourcePath, 'utf8')
  const { meta, prompt } = parseAgentFile(raw)
  const name = file.replace(/\.md(\.disabled)?$/, '')

  return createAgent({
    scopeId: targetScopeId,
    name,
    description: typeof meta.description === 'string' ? meta.description : '',
    tools: normalizeTools(meta.tools),
    model: typeof meta.model === 'string' ? meta.model : '',
    color: typeof meta.color === 'string' ? meta.color : '',
    prompt,
  })
}
