import type { DiscoveredProject, Inventory } from '../shared/inventory'
import type { Activity, Agent, AgentInput, Project, TableState } from '../shared/types'

async function request<T>(url: string, method = 'GET', body?: unknown): Promise<T> {
  const response = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  if (!response.ok) {
    const payload = (await response.json().catch(() => ({}))) as { error?: string }
    throw new Error(payload.error ?? `Erro ${response.status}`)
  }
  return response.status === 204 ? (undefined as T) : ((await response.json()) as T)
}

export const api = {
  listAgents: () => request<Agent[]>('/api/agents'),
  createAgent: (input: AgentInput) => request<Agent>('/api/agents', 'POST', input),
  updateAgent: (id: string, input: AgentInput) => request<Agent>(`/api/agents/${id}`, 'PUT', input),
  toggleAgent: (id: string) => request<Agent>(`/api/agents/${id}/toggle`, 'PATCH', {}),
  copyAgent: (id: string, scopeId: string) => request<Agent>(`/api/agents/${id}/copy`, 'POST', { scopeId }),
  removeAgent: (id: string) => request<void>(`/api/agents/${id}`, 'DELETE', {}),
  listProjects: () => request<Project[]>('/api/projects'),
  addProject: (path: string) => request<Project>('/api/projects', 'POST', { path }),
  getTable: () => request<TableState>('/api/table'),
  saveTable: (table: TableState) => request<TableState>('/api/table', 'PUT', table),
  listDiscovered: () => request<DiscoveredProject[]>('/api/projects/discovered'),
  getInventory: (project?: string) => request<Inventory>(`/api/inventory${project ? `?project=${encodeURIComponent(project)}` : ''}`),
  listActivity: () => request<Activity[]>('/api/activity'),
  removeProject: (id: string) => request<void>(`/api/projects/${id}`, 'DELETE', {}),
}
