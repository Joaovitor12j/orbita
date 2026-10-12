import { randomBytes } from 'node:crypto'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { HTTPException } from 'hono/http-exception'
import { EFFORTS, HARNESS_MODELS, PERMISSION_MODES, type Harness, type HarnessInput, type HarnessRef, type Prepared, type PreparedFile } from '../shared/harness'
import { buildInventory } from './inventory'
import { readRawServer } from './inventory/mcp'
import { CONFIG_DIR, listProjects } from './store'

// Perfis de harness e o "lançamento": o Orbita grava, em ~/.config/orbita/harnesses/<id>/, os arquivos
// que o Claude Code lê por flag (--settings, --mcp-config, --plugin-dir) e devolve o comando pronto.
// Nenhum arquivo do ~/.claude ou do projeto é alterado.

const FILE = path.join(CONFIG_DIR, 'harnesses.json')
const ROOT = path.join(CONFIG_DIR, 'harnesses')
const ID = /^h-[a-f0-9]{8}$/
const PLUGIN_KEY = /^[\w.-]+@[\w.-]+$/
const NAME_MAX = 60
const TEXT_MAX = 20_000
const INSTRUCTIONS_WARN = 8_000

const fail = (status: 400 | 404, message: string): never => {
  throw new HTTPException(status, { message })
}

const text = (value: unknown, max = TEXT_MAX) => (typeof value === 'string' ? value.slice(0, max) : '')
const oneOf = (value: unknown, options: { value: string }[]) =>
  options.some((o) => o.value === value) ? (value as string) : ''

const refs = (value: unknown): HarnessRef[] =>
  Array.isArray(value)
    ? value
        .filter((r): r is HarnessRef => Boolean(r) && typeof r.id === 'string' && /^[a-f0-9]{12}$/.test(r.id))
        .map((r) => ({ id: r.id, name: text(r.name, 120), origin: text(r.origin, 120) }))
    : []

function sanitize(input: HarnessInput): HarnessInput {
  const name = text(input?.name, NAME_MAX).trim()
  if (!name) fail(400, 'Nome é obrigatório')
  const plugins: Record<string, boolean> = {}
  for (const [key, value] of Object.entries(input.plugins ?? {})) if (PLUGIN_KEY.test(key)) plugins[key] = Boolean(value)
  return {
    name,
    description: text(input.description, 500).trim(),
    projectId: text(input.projectId, 40),
    model: oneOf(input.model, HARNESS_MODELS),
    effort: oneOf(input.effort, EFFORTS),
    permissionMode: oneOf(input.permissionMode, PERMISSION_MODES),
    instructions: text(input.instructions).trim(),
    allowedTools: text(input.allowedTools, 2000).trim(),
    disallowedTools: text(input.disallowedTools, 2000).trim(),
    plugins,
    skillsOff: [...new Set((input.skillsOff ?? []).filter((s) => typeof s === 'string' && /^[\w.:-]{1,80}$/.test(s)))],
    mcp: { mode: input.mcp?.mode === 'only' ? 'only' : 'inherit', servers: refs(input.mcp?.servers) },
    agents: refs(input.agents),
  }
}

export async function listHarnesses(): Promise<Harness[]> {
  const raw = await fs.readFile(FILE, 'utf8').catch(() => '[]')
  try {
    const parsed = JSON.parse(raw) as Harness[]
    return Array.isArray(parsed) ? parsed.filter((h) => ID.test(h?.id)) : []
  } catch {
    return []
  }
}

async function save(list: Harness[]) {
  await fs.mkdir(CONFIG_DIR, { recursive: true })
  await fs.writeFile(FILE, JSON.stringify(list, null, 2))
}

export async function createHarness(input: HarnessInput): Promise<Harness> {
  const harness: Harness = { ...sanitize(input), id: `h-${randomBytes(4).toString('hex')}`, updatedAt: new Date().toISOString() }
  await save([...(await listHarnesses()), harness])
  return harness
}

export async function updateHarness(id: string, input: HarnessInput): Promise<Harness> {
  const list = await listHarnesses()
  const index = list.findIndex((h) => h.id === id)
  if (index < 0) return fail(404, 'Harness não encontrado')
  const harness: Harness = { ...sanitize(input), id, updatedAt: new Date().toISOString() }
  list[index] = harness
  await save(list)
  return harness
}

export async function removeHarness(id: string): Promise<void> {
  if (!ID.test(id)) fail(400, 'ID inválido')
  await save((await listHarnesses()).filter((h) => h.id !== id))
  // O id foi validado acima, então o caminho nunca sai de ROOT.
  await fs.rm(path.join(ROOT, id), { recursive: true, force: true })
}

const shellQuote = (value: string) => `'${value.replace(/'/g, `'\\''`)}'`
const slug = (value: string) => value.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'harness'

async function writeFileSafe(file: string, content: string, files: PreparedFile[], purpose: string) {
  await fs.writeFile(file, content, { mode: 0o600 })
  await fs.chmod(file, 0o600)
  files.push({ path: file, purpose })
}

/** Grava os arquivos do harness e monta o comando de lançamento. */
export async function prepareHarness(id: string): Promise<Prepared> {
  const harness = (await listHarnesses()).find((h) => h.id === id)
  if (!harness) return fail(404, 'Harness não encontrado')
  const warnings: string[] = []
  const files: PreparedFile[] = []

  const projects = await listProjects()
  const project = harness.projectId ? projects.find((p) => p.id === harness.projectId) : undefined
  if (harness.projectId && !project) warnings.push('O projeto deste harness não está mais registrado: o comando roda no diretório atual do terminal')

  const dir = path.join(ROOT, harness.id)
  await fs.mkdir(dir, { recursive: true, mode: 0o700 })
  await fs.chmod(dir, 0o700)
  const inventory = (await buildInventory()).items
  const byId = new Map(inventory.map((i) => [i.id, i]))
  const args: string[] = ['--name', shellQuote(harness.name)]

  if (harness.model) args.push('--model', harness.model)
  if (harness.effort) args.push('--effort', harness.effort)
  if (harness.permissionMode) args.push('--permission-mode', harness.permissionMode)

  // --settings: plugins ligados/desligados e skills desligadas só para esta sessão.
  const settings: Record<string, unknown> = {}
  const installed = new Set(inventory.filter((i) => i.kind === 'plugin').map((i) => String(i.meta.key)))
  const enabledPlugins = Object.fromEntries(Object.entries(harness.plugins).filter(([k]) => PLUGIN_KEY.test(k)))
  for (const key of Object.keys(enabledPlugins)) if (!installed.has(key)) warnings.push(`Plugin ${key} não está instalado`)
  if (Object.keys(enabledPlugins).length) settings.enabledPlugins = enabledPlugins
  if (harness.skillsOff.length) settings.skillOverrides = Object.fromEntries(harness.skillsOff.map((s) => [s, 'off']))
  const settingsFile = path.join(dir, 'settings.json')
  if (Object.keys(settings).length) {
    await writeFileSafe(settingsFile, JSON.stringify(settings, null, 2), files, 'Plugins e skills desligados nesta sessão (--settings)')
    args.push('--settings', shellQuote(settingsFile))
  } else await fs.rm(settingsFile, { force: true })

  // --mcp-config + --strict-mcp-config: só os servidores escolhidos, com as credenciais reais.
  const mcpFile = path.join(dir, 'mcp.json')
  if (harness.mcp.mode === 'only') {
    const projectPaths = new Map(projects.map((p) => [p.name, p.path]))
    const pluginRoots = new Map(inventory.filter((i) => i.kind === 'plugin').map((i) => [i.name, i.path]))
    const servers: Record<string, unknown> = {}
    for (const ref of harness.mcp.servers) {
      const item = byId.get(ref.id)
      if (!item || item.kind !== 'mcp') {
        warnings.push(`MCP ${ref.name || ref.id} não existe mais no inventário`)
        continue
      }
      if (item.meta.type === 'connector') {
        warnings.push(`${item.name} é um conector da conta claude.ai e não pode ir num harness (é gerenciado pelo Claude Code)`)
        continue
      }
      const raw = await readRawServer(item, projectPaths)
      if (!raw) {
        warnings.push(`Não consegui ler a definição de ${item.name}`)
        continue
      }
      // Servidores de plugin usam ${CLAUDE_PLUGIN_ROOT}, que só existe dentro do plugin.
      const root = pluginRoots.get(String(item.meta.plugin ?? ''))
      const body = root ? JSON.parse(JSON.stringify(raw).replaceAll('${CLAUDE_PLUGIN_ROOT}', root)) : raw
      let key = item.name
      if (key in servers) key = `${slug(item.origin)}-${item.name}`
      servers[key] = body
    }
    await writeFileSafe(mcpFile, JSON.stringify({ mcpServers: servers }, null, 2), files, 'Servidores MCP escolhidos, com credenciais (permissão 0600)')
    args.push('--mcp-config', shellQuote(mcpFile), '--strict-mcp-config')
  } else await fs.rm(mcpFile, { force: true })

  // --plugin-dir: um plugin gerado com os agentes extras do harness.
  const pluginDir = path.join(dir, 'plugin')
  await fs.rm(pluginDir, { recursive: true, force: true })
  if (harness.agents.length) {
    const agentsDir = path.join(pluginDir, 'agents')
    await fs.mkdir(agentsDir, { recursive: true })
    await fs.mkdir(path.join(pluginDir, '.claude-plugin'), { recursive: true })
    const used = new Set<string>()
    let copied = 0
    for (const ref of harness.agents) {
      const item = byId.get(ref.id)
      if (!item || item.kind !== 'agent') {
        warnings.push(`Agente ${ref.name || ref.id} não existe mais no inventário`)
        continue
      }
      let file = `${slug(item.name.replace(/^.*:/, ''))}.md`
      if (used.has(file)) file = `${slug(item.origin)}-${file}`
      used.add(file)
      await fs.copyFile(item.path, path.join(agentsDir, file))
      copied++
    }
    if (copied) {
      const manifest = { name: `orbita-${slug(harness.name).slice(0, 40)}`, version: '1.0.0', author: { name: 'Orbita' }, description: `Agentes extras do harness ${harness.name}` }
      await fs.writeFile(path.join(pluginDir, '.claude-plugin', 'plugin.json'), JSON.stringify(manifest, null, 2))
      files.push({ path: pluginDir, purpose: `Plugin gerado com ${copied} agente${copied > 1 ? 's' : ''} extra${copied > 1 ? 's' : ''} (--plugin-dir)` })
      args.push('--plugin-dir', shellQuote(pluginDir))
    }
  }

  if (harness.instructions) {
    if (harness.instructions.length > INSTRUCTIONS_WARN) warnings.push('As instruções são longas e ficam dentro do comando; considere uma skill ou um CLAUDE.md')
    args.push('--append-system-prompt', shellQuote(harness.instructions))
  }
  if (harness.allowedTools) args.push('--allowedTools', shellQuote(harness.allowedTools))
  if (harness.disallowedTools) args.push('--disallowedTools', shellQuote(harness.disallowedTools))

  const lines = ['claude', ...args.reduce<string[]>((acc, token) => {
    // Cada flag começa uma linha; os valores ficam junto dela.
    if (token.startsWith('--')) acc.push(token)
    else acc[acc.length - 1] = `${acc.at(-1)} ${token}`
    return acc
  }, [])]
  const body = lines.map((l, i) => (i === 0 ? l : `  ${l}`)).join(' \\\n')
  const command = project ? `cd ${shellQuote(project.path)} &&\n${body}` : body
  return { command, dir, files, warnings }
}
