import { execFile } from 'node:child_process'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { HTTPException } from 'hono/http-exception'
import type { LiveSession, SessionsResponse, TailEntry } from '../shared/sessions'
import { usageForSessions } from './usage'

// Monitor das sessões do Claude Code (somente leitura): lê `claude agents --json --all`, o transcript
// de cada sessão para a atividade recente e, se o supervisor estiver ativo, `claude logs <id>`.
// Os argumentos são fixos e o único valor vindo de fora (o id) é validado: nada passa por shell.

const CLAUDE_BIN = process.env.ORBITA_CLAUDE_BIN ?? 'claude'
const SHORT_ID = /^[a-f0-9]{8}$/
const SESSION_ID = /^[a-f0-9-]{36}$/
const TAIL_BYTES = 160 * 1024
const TAIL_ENTRIES = 8
const TEXT_MAX = 320
const LOGS_MAX = 20_000
const ANSI = /\u001b\[[0-9;?]*[ -/]*[@-~]/g

function run(args: string[], timeout = 15_000) {
  return new Promise<string>((resolve, reject) => {
    execFile(CLAUDE_BIN, args, { timeout, maxBuffer: 5_000_000, env: process.env }, (error, stdout, stderr) => {
      if (error) reject(Object.assign(error, { stdout, stderr }))
      else resolve(stdout)
    })
  })
}

interface RawAgent {
  id?: string | null
  kind?: string
  name?: string
  cwd?: string
  pid?: number | null
  startedAt?: number
  state?: string | null
  status?: string | null
  sessionId?: string
}

const FINISHED = new Set(['done', 'failed'])

export async function listLive(): Promise<SessionsResponse> {
  const base = { generatedAt: new Date().toISOString(), sessions: [] as LiveSession[] }
  let raw: RawAgent[]
  try {
    const parsed: unknown = JSON.parse(await run(['agents', '--json', '--all']))
    raw = Array.isArray(parsed) ? (parsed as RawAgent[]) : []
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code
    return { ...base, error: code === 'ENOENT' ? 'Não encontrei o comando `claude` no PATH do servidor' : 'Não consegui ler as sessões (claude agents --json falhou)' }
  }

  const usage = await usageForSessions(raw.map((r) => r.sessionId).filter((s): s is string => typeof s === 'string')).catch(() => new Map())
  const sessions = raw
    .filter((r) => typeof r.sessionId === 'string')
    .map((r): LiveSession => {
      const interactive = r.kind === 'interactive'
      const state = (interactive ? r.status : r.state) ?? 'desconhecido'
      const sessionId = r.sessionId!
      return {
        id: r.id && SHORT_ID.test(r.id) ? r.id : null,
        kind: interactive ? 'interactive' : 'background',
        name: r.name?.trim() || usage.get(sessionId)?.title || 'Sessão sem nome',
        cwd: r.cwd ?? '',
        project: path.basename(r.cwd ?? '') || r.cwd || '—',
        pid: typeof r.pid === 'number' ? r.pid : null,
        startedAt: r.startedAt ?? 0,
        state,
        sessionId,
        active: interactive || !FINISHED.has(state),
        usage: usage.get(sessionId) ?? null,
      }
    })
    .sort((a, b) => Number(b.active) - Number(a.active) || b.startedAt - a.startedAt)
  return { ...base, sessions }
}

const clip = (text: string) => {
  const flat = text.replace(/\s+/g, ' ').trim()
  return flat.length > TEXT_MAX ? `${flat.slice(0, TEXT_MAX - 1)}…` : flat
}

// Textos que o Claude Code injeta (lembretes, saídas de comandos) não são conversa de verdade.
const INJECTED = /^<(system-reminder|command-|local-command|ide_|task-notification)/

function textOf(content: unknown): { text: string; tools: string[] } {
  if (typeof content === 'string') return { text: INJECTED.test(content.trim()) ? '' : content, tools: [] }
  if (!Array.isArray(content)) return { text: '', tools: [] }
  const parts: string[] = []
  const tools: string[] = []
  for (const block of content as { type?: string; text?: string; name?: string }[]) {
    if (block.type === 'text' && typeof block.text === 'string' && !INJECTED.test(block.text.trim())) parts.push(block.text)
    else if (block.type === 'tool_use' && block.name) tools.push(block.name)
  }
  return { text: parts.join(' '), tools }
}

/** Últimas mensagens da sessão, lidas do fim do transcript. */
export async function sessionTail(sessionId: string): Promise<TailEntry[]> {
  if (!SESSION_ID.test(sessionId)) throw new HTTPException(400, { message: 'Id de sessão inválido' })
  const usage = (await usageForSessions([sessionId])).get(sessionId)
  if (!usage) throw new HTTPException(404, { message: 'Transcript da sessão não encontrado' })

  const handle = await fs.open(usage.file, 'r')
  try {
    const { size } = await handle.stat()
    const length = Math.min(TAIL_BYTES, size)
    const buffer = Buffer.alloc(length)
    await handle.read(buffer, 0, length, size - length)
    const lines = buffer.toString('utf8').split('\n')
    if (length < size) lines.shift() // a primeira linha pode estar cortada
    const entries: TailEntry[] = []
    for (const line of lines) {
      if (!line.includes('"type":"user"') && !line.includes('"type":"assistant"')) continue
      let entry: { type?: string; timestamp?: string; isMeta?: boolean; message?: { content?: unknown } }
      try {
        entry = JSON.parse(line)
      } catch {
        continue
      }
      if ((entry.type !== 'user' && entry.type !== 'assistant') || entry.isMeta) continue
      const { text, tools } = textOf(entry.message?.content)
      if (!text.trim() && tools.length === 0) continue
      entries.push({ role: entry.type, at: entry.timestamp ?? '', text: clip(text), tools })
    }
    return entries.slice(-TAIL_ENTRIES)
  } finally {
    await handle.close()
  }
}

/** Saída recente do terminal de uma sessão em segundo plano. Só existe com o supervisor do Claude Code ativo. */
export async function sessionLogs(id: string): Promise<{ text?: string; error?: string }> {
  if (!SHORT_ID.test(id)) throw new HTTPException(400, { message: 'Id inválido' })
  try {
    const out = (await run(['logs', id], 20_000)).replace(ANSI, '')
    return { text: out.length > LOGS_MAX ? out.slice(-LOGS_MAX) : out }
  } catch (error) {
    const detail = String((error as { stdout?: string; stderr?: string }).stdout || (error as { stderr?: string }).stderr || '').replace(ANSI, '').trim()
    return {
      error: detail.includes('control.sock')
        ? 'O supervisor de sessões em segundo plano do Claude Code não está rodando, então não há saída de terminal para ler. A atividade recente (do transcript) continua disponível.'
        : detail || 'Não consegui ler os logs',
    }
  }
}
