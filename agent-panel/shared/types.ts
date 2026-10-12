export interface Agent {
  id: string
  name: string
  description: string
  tools: string[]
  model: string
  color: string
  prompt: string
  enabled: boolean
  scopeId: string
  scopeLabel: string
  path: string
  updatedAt: string
}

export interface Project {
  id: string
  name: string
  path: string
}

export interface AgentInput {
  scopeId: string
  name: string
  description: string
  tools: string[]
  model: string
  color: string
  prompt: string
}

export const GLOBAL_SCOPE = 'global'

export const TABLE_SEATS = 7

/** Cada cadeira guarda `scopeId:nome`, que sobrevive a ligar/desligar o agente. */
export interface TableState {
  seats: (string | null)[]
}

export interface Activity {
  agentId: string
  agentType: string
  description: string
  status: 'working' | 'done'
  tool: string
  detail: string
  project: string
  sessionId: string
  startedAt: string
  updatedAt: string
}
