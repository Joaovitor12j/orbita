// Uso do Claude Code lido dos transcripts em ~/.claude/projects (somente leitura).
// O custo vem do registro `cost-state` que o próprio Claude Code grava; o Orbita não estima preços.

export interface TokenCounts {
  input: number
  output: number
  cacheRead: number
  cacheWrite: number
}

export interface ModelUsage extends TokenCounts {
  model: string
  messages: number
}

export interface SubagentUsage extends TokenCounts {
  agentId: string
  type: string
  description: string
  models: string[]
  messages: number
}

export interface SessionUsage extends TokenCounts {
  /** `registrado`: tokens do próprio Claude Code (os mesmos do custo). `transcript`: soma das mensagens gravadas, aproximada. */
  tokenSource: 'registrado' | 'transcript'
  id: string
  title: string
  /** Pasta onde a sessão rodou (cwd). */
  cwd: string
  project: string
  entrypoint: string
  startedAt: string
  endedAt: string
  messages: number
  models: ModelUsage[]
  /** Custo registrado pelo Claude Code; null quando a sessão não tem registro. */
  costUSD: number | null
  linesAdded: number
  linesRemoved: number
  durationMs: number
  subagents: SubagentUsage[]
  file: string
}

export interface DayUsage extends TokenCounts {
  day: string
  costUSD: number
  sessions: number
}

export interface GroupUsage extends TokenCounts {
  key: string
  label: string
  sessions: number
  messages: number
  costUSD: number
  /** Sessões do grupo com custo registrado. */
  withCost: number
}

export interface UsageReport {
  generatedAt: string
  /** Dias considerados; 0 = tudo. */
  days: number
  totals: TokenCounts & { sessions: number; messages: number; costUSD: number; withCost: number; linesAdded: number; linesRemoved: number; registered: number }
  /** Sessões sem nenhuma resposta do modelo (testes, abortadas), ocultas da lista. */
  emptySessions: number
  daily: DayUsage[]
  projects: GroupUsage[]
  models: GroupUsage[]
  agents: GroupUsage[]
  sessions: SessionUsage[]
}
