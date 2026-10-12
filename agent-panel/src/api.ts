import type { SessionsResponse, TailEntry } from '../shared/sessions'
import type { UsageReport } from '../shared/usage'
import type { Harness, HarnessInput, Prepared } from '../shared/harness'
import type { DiscoveredProject, Inventory, ItemInput, ItemVersion } from '../shared/inventory'
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
  createItem: (input: ItemInput) => request<{ path: string; mtime: number }>('/api/items', 'POST', input),
  updateItem: (path: string, input: ItemInput) => request<{ path: string; mtime: number }>(`/api/items?path=${encodeURIComponent(path)}`, 'PUT', input),
  deleteItem: (path: string) => request<void>(`/api/items?path=${encodeURIComponent(path)}`, 'DELETE', {}),
  listVersions: (path: string) => request<ItemVersion[]>(`/api/items/history?path=${encodeURIComponent(path)}`),
  restoreVersion: (path: string, version: string) => request<{ path: string; mtime: number }>('/api/items/restore', 'POST', { path, version }),
  setPluginEnabled: (key: string, enabled: boolean, projectPath?: string) =>
    request<{ path: string }>('/api/plugins/enabled', 'PUT', { key, enabled, projectPath }),
  listHarnesses: () => request<Harness[]>('/api/harnesses'),
  createHarness: (input: HarnessInput) => request<Harness>('/api/harnesses', 'POST', input),
  updateHarness: (id: string, input: HarnessInput) => request<Harness>(`/api/harnesses/${id}`, 'PUT', input),
  deleteHarness: (id: string) => request<void>(`/api/harnesses/${id}`, 'DELETE', {}),
  prepareHarness: (id: string) => request<Prepared>(`/api/harnesses/${id}/prepare`, 'POST', {}),
  getUsage: (days: number, project?: string) =>
    request<UsageReport>(`/api/usage?days=${days}${project ? `&project=${encodeURIComponent(project)}` : ''}`),
  getSessions: () => request<SessionsResponse>('/api/sessions'),
  getSessionTail: (sessionId: string) => request<TailEntry[]>(`/api/sessions/${sessionId}/tail`),
  getSessionLogs: (id: string) => request<{ text?: string; error?: string }>(`/api/sessions/background/${id}/logs`),
  listActivity: () => request<Activity[]>('/api/activity'),
  removeProject: (id: string) => request<void>(`/api/projects/${id}`, 'DELETE', {}),
}
