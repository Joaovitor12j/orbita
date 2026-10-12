import { promises as fs } from 'node:fs'
import path from 'node:path'
import type { Activity } from '../shared/types'
import { CLAUDE_DIR } from './store'

// Lê (somente leitura) os transcripts que o Claude Code grava para cada subagente:
// ~/.claude/projects/<projeto>/<sessão>/subagents/agent-<id>.jsonl + agent-<id>.meta.json

const PROJECTS_DIR = path.join(CLAUDE_DIR, 'projects')
const WINDOW_MS = 10 * 60_000
const STALE_MS = 5 * 60_000
const TAIL_BYTES = 256 * 1024
const HEAD_BYTES = 16 * 1024
const DETAIL_MAX = 60

type Entry = {
  type?: string
  timestamp?: string
  cwd?: string
  sessionId?: string
  message?: { stop_reason?: string | null; content?: unknown }
}

type Block = { type?: string; name?: string; input?: Record<string, unknown> }

const cache = new Map<string, { mtimeMs: number; activity: Activity }>()

async function readSlice(file: string, size: number, fromEnd: boolean) {
  const handle = await fs.open(file, 'r')
  try {
    const { size: total } = await handle.stat()
    const length = Math.min(size, total)
    const buffer = Buffer.alloc(length)
    await handle.read(buffer, 0, length, fromEnd ? total - length : 0)
    const lines = buffer.toString('utf8').split('\n')
    // Descarta a linha cortada pela janela de leitura.
    if (length < total) fromEnd ? lines.shift() : lines.pop()
    return lines
  } finally {
    await handle.close()
  }
}

const parse = (line: string): Entry | null => {
  try {
    return JSON.parse(line) as Entry
  } catch {
    return null
  }
}

const blocksOf = (entry: Entry): Block[] =>
  Array.isArray(entry.message?.content) ? (entry.message.content as Block[]) : []

const clip = (text: string) => {
  const flat = text.replace(/\s+/g, ' ').trim()
  return flat.length > DETAIL_MAX ? `${flat.slice(0, DETAIL_MAX - 1)}…` : flat
}

const describeTool = (input: Record<string, unknown> = {}) => {
  for (const key of ['file_path', 'notebook_path', 'path']) {
    if (typeof input[key] === 'string') return path.basename(input[key] as string)
  }
  for (const key of ['command', 'pattern', 'query', 'url', 'description', 'prompt']) {
    if (typeof input[key] === 'string') return clip(input[key] as string)
  }
  return ''
}

async function readActivity(file: string, mtimeMs: number): Promise<Activity> {
  const agentId = path.basename(file, '.jsonl').replace(/^agent-/, '')
  const metaRaw = await fs.readFile(file.replace(/\.jsonl$/, '.meta.json'), 'utf8').catch(() => '{}')
  const meta = (parse(metaRaw) ?? {}) as { agentType?: string; description?: string }

  const head = (await readSlice(file, HEAD_BYTES, false)).map(parse).find(Boolean)
  const tail = (await readSlice(file, TAIL_BYTES, true)).map(parse).filter((e): e is Entry => Boolean(e))

  let tool = ''
  let detail = ''
  let finished = false
  for (let i = tail.length - 1; i >= 0; i--) {
    const entry = tail[i]!
    if (entry.type !== 'assistant' && entry.type !== 'user') continue
    const uses = blocksOf(entry).filter((b) => b.type === 'tool_use')
    if (entry.type === 'assistant' && entry.message?.stop_reason === 'end_turn' && uses.length === 0) {
      finished = true
      break
    }
    const last = uses.at(-1)
    // O subagente entrega o relatório final por esta ferramenta, sem fechar o turno com end_turn.
    if (last?.name === 'SubagentHandback') {
      finished = true
      break
    }
    if (last) {
      tool = last.name ?? ''
      detail = describeTool(last.input)
      break
    }
  }

  const cwd = head?.cwd ?? tail.find((e) => e.cwd)?.cwd ?? ''
  return {
    agentId,
    agentType: meta.agentType ?? 'desconhecido',
    description: meta.description ?? '',
    status: finished ? 'done' : 'working',
    tool,
    detail,
    project: cwd ? path.basename(cwd) : '',
    sessionId: head?.sessionId ?? path.basename(path.dirname(path.dirname(file))),
    startedAt: head?.timestamp ?? new Date(mtimeMs).toISOString(),
    updatedAt: new Date(mtimeMs).toISOString(),
  }
}

async function recentTranscripts(now: number) {
  const found: { file: string; mtimeMs: number }[] = []
  const projects = await fs.readdir(PROJECTS_DIR, { withFileTypes: true }).catch(() => [])
  for (const project of projects) {
    if (!project.isDirectory()) continue
    const projectDir = path.join(PROJECTS_DIR, project.name)
    const sessions = await fs.readdir(projectDir, { withFileTypes: true }).catch(() => [])
    for (const session of sessions) {
      if (!session.isDirectory()) continue
      const dir = path.join(projectDir, session.name, 'subagents')
      const files = await fs.readdir(dir).catch(() => [] as string[])
      for (const name of files) {
        if (!name.endsWith('.jsonl')) continue
        const file = path.join(dir, name)
        const stat = await fs.stat(file).catch(() => null)
        if (stat && now - stat.mtimeMs <= WINDOW_MS) found.push({ file, mtimeMs: stat.mtimeMs })
      }
    }
  }
  return found
}

export async function listActivity(): Promise<Activity[]> {
  const now = Date.now()
  const transcripts = await recentTranscripts(now)
  const live = new Set(transcripts.map((t) => t.file))
  for (const key of cache.keys()) if (!live.has(key)) cache.delete(key)

  const result = await Promise.all(
    transcripts.map(async ({ file, mtimeMs }) => {
      let cached = cache.get(file)
      if (!cached || cached.mtimeMs !== mtimeMs) {
        cached = { mtimeMs, activity: await readActivity(file, mtimeMs) }
        cache.set(file, cached)
      }
      // Sem escrita há muito tempo: a sessão foi encerrada sem fechar o turno.
      const stale = now - mtimeMs > STALE_MS
      return stale ? { ...cached.activity, status: 'done' as const } : cached.activity
    }),
  )
  return result.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
}
