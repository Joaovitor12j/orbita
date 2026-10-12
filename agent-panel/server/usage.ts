import { createReadStream, promises as fs } from 'node:fs'
import path from 'node:path'
import readline from 'node:readline'
import type { DayUsage, GroupUsage, ModelUsage, SessionUsage, SubagentUsage, TokenCounts, UsageReport } from '../shared/usage'
import { CLAUDE_DIR, CONFIG_DIR } from './store'

// Lê os transcripts do Claude Code (somente leitura) e resume uso por sessão, modelo, projeto e subagente.
// Um cache em disco guarda o resumo de cada arquivo (por mtime e tamanho): só o que mudou é relido.

const PROJECTS_DIR = path.join(CLAUDE_DIR, 'projects')
const CACHE_FILE = path.join(CONFIG_DIR, 'usage-cache.json')
const CACHE_VERSION = 3
const CONCURRENCY = 8
const TITLE_MAX = 90
const SESSIONS_LIMIT = 200

const zero = (): TokenCounts => ({ input: 0, output: 0, cacheRead: 0, cacheWrite: 0 })
const add = (a: TokenCounts, b: TokenCounts) => {
  a.input += b.input
  a.output += b.output
  a.cacheRead += b.cacheRead
  a.cacheWrite += b.cacheWrite
}

interface Usage {
  input_tokens?: number
  output_tokens?: number
  cache_read_input_tokens?: number
  cache_creation_input_tokens?: number
}

interface Parsed {
  kind: 'main' | 'sub'
  sessionId: string
  projectDir: string
  cwd: string
  entrypoint: string
  title: string
  startedAt: string
  endedAt: string
  messages: number
  models: Record<string, TokenCounts & { messages: number }>
  /** Tokens por dia (data local), para o gráfico. */
  daily: Record<string, TokenCounts>
  costUSD: number | null
  /** Tokens por modelo registrados no `cost-state` (inclui chamadas auxiliares que não viram mensagens no transcript). */
  registered: Record<string, TokenCounts> | null
  linesAdded: number
  linesRemoved: number
  durationMs: number
  agentType: string
  description: string
}

interface CacheEntry {
  mtimeMs: number
  size: number
  data: Parsed
}

let cache: Map<string, CacheEntry> | null = null
let dirty = false

async function loadCache() {
  if (cache) return cache
  cache = new Map()
  try {
    const raw = JSON.parse(await fs.readFile(CACHE_FILE, 'utf8')) as { version?: number; files?: Record<string, CacheEntry> }
    if (raw.version === CACHE_VERSION) cache = new Map(Object.entries(raw.files ?? {}))
  } catch {
    /* cache ausente ou corrompido: refaz */
  }
  return cache
}

async function saveCache() {
  if (!cache || !dirty) return
  dirty = false
  await fs.mkdir(CONFIG_DIR, { recursive: true })
  await fs.writeFile(CACHE_FILE, JSON.stringify({ version: CACHE_VERSION, files: Object.fromEntries(cache) }))
}

const localDay = (ts: string) => {
  const d = new Date(ts)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const clip = (text: string) => {
  const flat = text.replace(/\s+/g, ' ').trim()
  return flat.length > TITLE_MAX ? `${flat.slice(0, TITLE_MAX - 1)}…` : flat
}

// modelUsage do cost-state -> tokens por modelo; null quando vazio.
function registeredUsage(raw: unknown): Record<string, TokenCounts> | null {
  if (!raw || typeof raw !== 'object') return null
  const result: Record<string, TokenCounts> = {}
  for (const [model, u] of Object.entries(raw as Record<string, Record<string, number>>)) {
    const t: TokenCounts = {
      input: Number(u?.inputTokens) || 0,
      output: Number(u?.outputTokens) || 0,
      cacheRead: Number(u?.cacheReadInputTokens) || 0,
      cacheWrite: Number(u?.cacheCreationInputTokens) || 0,
    }
    if (t.input + t.output + t.cacheRead + t.cacheWrite > 0) result[model] = t
  }
  return Object.keys(result).length ? result : null
}

async function parseTranscript(file: string, kind: Parsed['kind'], sessionId: string, projectDir: string): Promise<Parsed> {
  const out: Parsed = {
    kind, sessionId, projectDir, cwd: '', entrypoint: '', title: '', startedAt: '', endedAt: '', messages: 0,
    models: {}, daily: {}, costUSD: null, registered: null, linesAdded: 0, linesRemoved: 0, durationMs: 0, agentType: '', description: '',
  }
  // O mesmo id de mensagem aparece em várias linhas (um bloco por linha): vale o de maior saída.
  const byMessage = new Map<string, { model: string; usage: Usage; ts: string }>()
  let aiTitle = ''
  let lastPrompt = ''
  let maxCost = -1

  const rl = readline.createInterface({ input: createReadStream(file, { encoding: 'utf8' }), crlfDelay: Infinity })
  for await (const line of rl) {
    if (!line) continue
    const needMeta = !out.cwd || !out.startedAt
    const interesting = needMeta || line.includes('"usage"') || line.includes('"cost-state"') || line.includes('"ai-title"') || line.includes('"last-prompt"')
    if (!interesting) continue
    let entry: Record<string, any>
    try {
      entry = JSON.parse(line)
    } catch {
      continue
    }
    if (typeof entry.timestamp === 'string') {
      if (!out.startedAt || entry.timestamp < out.startedAt) out.startedAt = entry.timestamp
      if (entry.timestamp > out.endedAt) out.endedAt = entry.timestamp
    }
    if (!out.cwd && typeof entry.cwd === 'string') out.cwd = entry.cwd
    if (!out.entrypoint && typeof entry.entrypoint === 'string') out.entrypoint = entry.entrypoint

    switch (entry.type) {
      case 'ai-title':
        if (typeof entry.aiTitle === 'string') aiTitle = entry.aiTitle
        break
      case 'last-prompt':
        if (typeof entry.lastPrompt === 'string') lastPrompt = entry.lastPrompt
        break
      case 'cost-state': {
        // O total acumulado só cresce; guarda o maior para não perder custo em sessões retomadas.
        const cost = Number(entry.totalCostUSD) || 0
        if (cost > maxCost) {
          maxCost = cost
          out.registered = registeredUsage(entry.modelUsage)
          out.linesAdded = Number(entry.totalLinesAdded) || 0
          out.linesRemoved = Number(entry.totalLinesRemoved) || 0
        }
        out.durationMs = Math.max(out.durationMs, Number(entry.totalDuration) || 0)
        break
      }
      case 'assistant': {
        const message = entry.message
        const usage = message?.usage as Usage | undefined
        if (!usage || !message?.model || message.model === '<synthetic>') break
        const id = String(message.id ?? entry.requestId ?? entry.uuid ?? `${out.messages}`)
        const previous = byMessage.get(id)
        if (!previous || (usage.output_tokens ?? 0) >= (previous.usage.output_tokens ?? 0)) {
          byMessage.set(id, { model: String(message.model), usage, ts: String(entry.timestamp ?? out.startedAt) })
        }
        break
      }
    }
  }

  for (const { model, usage, ts } of byMessage.values()) {
    const tokens: TokenCounts = {
      input: usage.input_tokens ?? 0,
      output: usage.output_tokens ?? 0,
      cacheRead: usage.cache_read_input_tokens ?? 0,
      cacheWrite: usage.cache_creation_input_tokens ?? 0,
    }
    const m = (out.models[model] ??= { ...zero(), messages: 0 })
    add(m, tokens)
    m.messages++
    const day = (out.daily[localDay(ts)] ??= zero())
    add(day, tokens)
    out.messages++
  }
  out.costUSD = maxCost > 0 ? maxCost : null
  out.title = clip(aiTitle || lastPrompt)

  if (kind === 'sub') {
    const meta = await fs.readFile(file.replace(/\.jsonl$/, '.meta.json'), 'utf8').catch(() => '{}')
    try {
      const parsed = JSON.parse(meta) as { agentType?: string; description?: string }
      out.agentType = parsed.agentType ?? 'desconhecido'
      out.description = parsed.description ?? ''
    } catch {
      out.agentType = 'desconhecido'
    }
  }
  return out
}

interface Found {
  file: string
  kind: Parsed['kind']
  sessionId: string
  projectDir: string
}

async function listTranscripts(): Promise<Found[]> {
  const found: Found[] = []
  const projects = await fs.readdir(PROJECTS_DIR, { withFileTypes: true }).catch(() => [])
  for (const project of projects) {
    if (!project.isDirectory()) continue
    const dir = path.join(PROJECTS_DIR, project.name)
    const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => [])
    for (const entry of entries) {
      if (entry.isFile() && entry.name.endsWith('.jsonl')) {
        found.push({ file: path.join(dir, entry.name), kind: 'main', sessionId: entry.name.slice(0, -6), projectDir: project.name })
      } else if (entry.isDirectory()) {
        const subDir = path.join(dir, entry.name, 'subagents')
        const subs = await fs.readdir(subDir).catch(() => [] as string[])
        for (const name of subs) {
          if (name.endsWith('.jsonl')) found.push({ file: path.join(subDir, name), kind: 'sub', sessionId: entry.name, projectDir: project.name })
        }
      }
    }
  }
  return found
}

async function scan(): Promise<Parsed[]> {
  const files = await loadCache()
  const found = await listTranscripts()
  const live = new Set(found.map((f) => f.file))
  for (const key of files.keys()) {
    if (!live.has(key)) {
      files.delete(key)
      dirty = true
    }
  }

  let index = 0
  const worker = async () => {
    while (index < found.length) {
      const item = found[index++]!
      const stat = await fs.stat(item.file).catch(() => null)
      if (!stat) continue
      const cached = files.get(item.file)
      if (cached && cached.mtimeMs === stat.mtimeMs && cached.size === stat.size) continue
      const data = await parseTranscript(item.file, item.kind, item.sessionId, item.projectDir).catch(() => null)
      if (!data) continue
      files.set(item.file, { mtimeMs: stat.mtimeMs, size: stat.size, data })
      dirty = true
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker))
  await saveCache().catch(() => undefined)
  return [...files.entries()].map(([file, e]) => ({ ...e.data, __file: file }) as Parsed & { __file: string })
}

const sumTokens = (list: TokenCounts[]) => {
  const t = zero()
  for (const x of list) add(t, x)
  return t
}

type ParsedFile = Parsed & { __file: string }

/** Monta o resumo de uma sessão: com registro do Claude Code ele é a fonte (mesmos números do custo); senão, o que o transcript permite somar. */
function makeSession(p: ParsedFile, subagents: SubagentUsage[]): SessionUsage {
  const exact = p.registered !== null
  const models: ModelUsage[] = exact
    ? Object.entries(p.registered!).map(([model, t]) => ({ model, ...t, messages: p.models[model]?.messages ?? 0 }))
    : Object.entries(p.models).map(([model, m]) => ({ model, ...m }))
  return {
    tokenSource: exact ? 'registrado' : 'transcript',
    id: p.sessionId, title: p.title, cwd: p.cwd, project: path.basename(p.cwd) || p.projectDir, entrypoint: p.entrypoint,
    startedAt: p.startedAt, endedAt: p.endedAt, messages: p.messages, models, costUSD: p.costUSD,
    linesAdded: p.linesAdded, linesRemoved: p.linesRemoved, durationMs: p.durationMs,
    subagents, file: p.__file, ...sumTokens(models),
  }
}

function subagentsBySession(parsed: ParsedFile[]) {
  const map = new Map<string, SubagentUsage[]>()
  for (const p of parsed) {
    if (p.kind !== 'sub') continue
    const key = `${p.projectDir}/${p.sessionId}`
    const tokens = sumTokens(Object.values(p.models))
    const list = map.get(key) ?? []
    list.push({ agentId: path.basename(p.__file, '.jsonl').replace(/^agent-/, ''), type: p.agentType, description: p.description, models: Object.keys(p.models), messages: p.messages, ...tokens })
    map.set(key, list)
  }
  return map
}

/** Resumo de uso de sessões específicas (inclusive as sem resposta ainda), pelo id da sessão. */
export async function usageForSessions(ids: string[]): Promise<Map<string, SessionUsage>> {
  const wanted = new Set(ids)
  const parsed = (await scan()) as ParsedFile[]
  const subs = subagentsBySession(parsed)
  const result = new Map<string, SessionUsage>()
  for (const p of parsed) {
    if (p.kind === 'main' && wanted.has(p.sessionId)) result.set(p.sessionId, makeSession(p, subs.get(`${p.projectDir}/${p.sessionId}`) ?? []))
  }
  return result
}

const group = (map: Map<string, GroupUsage>, key: string, label: string) => {
  let g = map.get(key)
  if (!g) {
    g = { key, label, ...zero(), sessions: 0, messages: 0, costUSD: 0, withCost: 0 }
    map.set(key, g)
  }
  return g
}

const byWork = (a: GroupUsage, b: GroupUsage) => b.input + b.output + b.cacheWrite - (a.input + a.output + a.cacheWrite) || b.costUSD - a.costUSD

/** Relatório de uso. `days` = 0 considera tudo; `projectPath` limita às sessões dessa pasta. */
export async function buildUsage(days = 30, projectPath?: string): Promise<UsageReport> {
  const parsed = (await scan()) as ParsedFile[]
  const since = days > 0 ? Date.now() - days * 86_400_000 : 0
  const inScope = (cwd: string) => !projectPath || cwd === projectPath || cwd.startsWith(`${projectPath}${path.sep}`)

  const subsBySession = subagentsBySession(parsed)

  const sessions: SessionUsage[] = []
  let empty = 0
  for (const p of parsed) {
    if (p.kind !== 'main' || !p.endedAt || new Date(p.endedAt).getTime() < since || !inScope(p.cwd)) continue
    if (p.messages === 0) {
      empty++
      continue
    }
    sessions.push(makeSession(p, subsBySession.get(`${p.projectDir}/${p.sessionId}`) ?? []))
  }
  sessions.sort((a, b) => b.endedAt.localeCompare(a.endedAt))

  const dailyMap = new Map<string, DayUsage>()
  const projects = new Map<string, GroupUsage>()
  const models = new Map<string, GroupUsage>()
  const agents = new Map<string, GroupUsage>()
  const totals = { ...zero(), sessions: sessions.length, messages: 0, costUSD: 0, withCost: 0, linesAdded: 0, linesRemoved: 0, registered: 0 }

  const sessionByFile = new Map(sessions.map((s) => [s.file, s]))
  for (const p of parsed) {
    const session = sessionByFile.get(p.__file)
    if (p.kind !== 'main' || !session) continue
    const transcriptTotal = sumTokens(Object.values(p.daily))
    const fields = ['input', 'output', 'cacheRead', 'cacheWrite'] as const
    // Os totais da sessão são os registrados: o dia de cada mensagem só reparte esse total.
    // Quando o transcript não tem um campo (ex.: entrada zerada), ele vai todo para o último dia.
    const lastDay = localDay(session.endedAt)
    const days = Object.keys(p.daily)
    const target = (day: string) => dailyMap.get(day) ?? { day, ...zero(), costUSD: 0, sessions: 0 }
    for (const day of days) {
      const share = p.daily[day]!
      const d = target(day)
      for (const f of fields) if (transcriptTotal[f] > 0) d[f] += (share[f] / transcriptTotal[f]) * session[f]
      dailyMap.set(day, d)
    }
    const d = target(lastDay)
    for (const f of fields) if (transcriptTotal[f] === 0) d[f] += session[f]
    dailyMap.set(lastDay, d)
  }
  for (const [day] of dailyMap) {
    if (since && new Date(`${day}T23:59:59`).getTime() < since) dailyMap.delete(day)
  }
  for (const s of sessions) {
    totals.messages += s.messages
    totals.linesAdded += s.linesAdded
    totals.linesRemoved += s.linesRemoved
    add(totals, s)
    if (s.tokenSource === 'registrado') totals.registered++
    if (s.costUSD !== null) {
      totals.costUSD += s.costUSD
      totals.withCost++
    }
    const pg = group(projects, s.cwd, s.project)
    add(pg, s)
    pg.sessions++
    pg.messages += s.messages
    if (s.costUSD !== null) {
      pg.costUSD += s.costUSD
      pg.withCost++
    }
    // O custo da sessão vai para o dia em que ela terminou.
    const day = dailyMap.get(localDay(s.endedAt))
    if (day) {
      day.sessions++
      if (s.costUSD !== null) day.costUSD += s.costUSD
    }
    for (const m of s.models) {
      const mg = group(models, m.model, m.model)
      add(mg, m)
      mg.sessions++
      mg.messages += m.messages
    }
    for (const sub of s.subagents) {
      const ag = group(agents, sub.type, sub.type)
      add(ag, sub)
      ag.sessions++
      ag.messages += sub.messages
    }
  }

  const rank = (m: Map<string, GroupUsage>) => [...m.values()].sort(byWork)
  return {
    generatedAt: new Date().toISOString(),
    days,
    totals,
    emptySessions: empty,
    daily: [...dailyMap.values()].sort((a, b) => a.day.localeCompare(b.day)),
    projects: rank(projects),
    models: rank(models),
    agents: rank(agents),
    sessions: sessions.slice(0, SESSIONS_LIMIT),
  }
}
