import type { SessionUsage } from './usage'

// Sessões do Claude Code em andamento ou em segundo plano, lidas de `claude agents --json --all`.

export interface LiveSession {
  /** Id curto de sessões em segundo plano (`claude attach <id>`); null nas interativas. */
  id: string | null
  kind: 'background' | 'interactive'
  name: string
  cwd: string
  project: string
  pid: number | null
  startedAt: number
  /** Estado bruto do Claude Code (`done`, `failed`, `blocked`, `busy`…). */
  state: string
  sessionId: string
  /** Em andamento agora (não concluída nem falha). */
  active: boolean
  /** Uso e custo da sessão, quando o transcript já existe. */
  usage: SessionUsage | null
}

export interface TailEntry {
  role: 'user' | 'assistant'
  at: string
  text: string
  tools: string[]
}

export interface SessionsReport {
  generatedAt: string
  sessions: LiveSession[]
}

/** Quando o `claude` não está disponível ou falha, a lista vem vazia com a explicação. */
export interface SessionsResponse extends SessionsReport {
  error?: string
}
