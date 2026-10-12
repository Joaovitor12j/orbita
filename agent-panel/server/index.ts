import { serve } from '@hono/node-server'
import { serveStatic } from '@hono/node-server/serve-static'
import { Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'
import type { HarnessInput } from '../shared/harness'
import type { ItemInput } from '../shared/inventory'
import type { AgentInput, TableState } from '../shared/types'
import { listActivity } from './activity'
import {
  addProject,
  copyAgent,
  createAgent,
  listAgents,
  listProjects,
  removeAgent,
  removeProject,
  toggleAgent,
  updateAgent,
} from './store'
import { createItem, deleteItem, listVersions, readVersion, restoreVersion, updateItem } from './editor'
import { createHarness, listHarnesses, prepareHarness, removeHarness, updateHarness } from './harness'
import { listLive, sessionLogs, sessionTail } from './sessions'
import { buildUsage } from './usage'
import { listDiscovered } from './discovery'
import { buildInventory } from './inventory'
import { readTable, saveTable } from './table'

const PORT = Number(process.env.PORT ?? 4545)
const ALLOWED_ORIGINS = new Set([
  `http://127.0.0.1:${PORT}`,
  `http://localhost:${PORT}`,
  'http://127.0.0.1:5173',
  'http://localhost:5173',
])

const app = new Hono()

app.use('/api/*', async (c, next) => {
  const origin = c.req.header('origin')
  if (origin && !ALLOWED_ORIGINS.has(origin)) return c.json({ error: 'Origem não permitida' }, 403)
  if (c.req.method !== 'GET' && !c.req.header('content-type')?.includes('application/json')) {
    return c.json({ error: 'Content-Type deve ser application/json' }, 415)
  }
  await next()
})

app.get('/api/projects', async (c) => c.json(await listProjects()))

app.get('/api/projects/discovered', async (c) => c.json(await listDiscovered()))

app.post('/api/projects', async (c) => {
  const { path } = await c.req.json<{ path: string }>()
  return c.json(await addProject(path), 201)
})

app.delete('/api/projects/:id', async (c) => {
  await removeProject(c.req.param('id'))
  return c.body(null, 204)
})

app.get('/api/agents', async (c) => c.json(await listAgents()))

app.post('/api/agents', async (c) => c.json(await createAgent(await c.req.json<AgentInput>()), 201))

app.put('/api/agents/:id', async (c) =>
  c.json(await updateAgent(c.req.param('id'), await c.req.json<AgentInput>())),
)

app.patch('/api/agents/:id/toggle', async (c) => c.json(await toggleAgent(c.req.param('id'))))

app.post('/api/agents/:id/copy', async (c) => {
  const { scopeId } = await c.req.json<{ scopeId: string }>()
  return c.json(await copyAgent(c.req.param('id'), scopeId), 201)
})

app.delete('/api/agents/:id', async (c) => {
  await removeAgent(c.req.param('id'))
  return c.body(null, 204)
})

app.get('/api/table', async (c) => c.json(await readTable()))

app.put('/api/table', async (c) => c.json(await saveTable(await c.req.json<TableState>())))

app.get('/api/inventory', async (c) => c.json(await buildInventory(c.req.query('project'))))

const queryPath = (c: { req: { query: (k: string) => string | undefined } }) => {
  const file = c.req.query('path')
  if (!file) throw new HTTPException(400, { message: 'Informe o caminho do arquivo' })
  return file
}

app.post('/api/items', async (c) => c.json(await createItem(await c.req.json<ItemInput>()), 201))

app.put('/api/items', async (c) => c.json(await updateItem(queryPath(c), await c.req.json<ItemInput>())))

app.delete('/api/items', async (c) => {
  await deleteItem(queryPath(c))
  return c.body(null, 204)
})

app.get('/api/items/history', async (c) => c.json(await listVersions(queryPath(c))))

app.get('/api/items/history/:version', async (c) =>
  c.json({ content: await readVersion(queryPath(c), c.req.param('version')) }),
)

app.post('/api/items/restore', async (c) => {
  const { path, version } = await c.req.json<{ path: string; version: string }>()
  return c.json(await restoreVersion(path, version))
})

app.get('/api/harnesses', async (c) => c.json(await listHarnesses()))

app.post('/api/harnesses', async (c) => c.json(await createHarness(await c.req.json<HarnessInput>()), 201))

app.put('/api/harnesses/:id', async (c) => c.json(await updateHarness(c.req.param('id'), await c.req.json<HarnessInput>())))

app.delete('/api/harnesses/:id', async (c) => {
  await removeHarness(c.req.param('id'))
  return c.body(null, 204)
})

// Grava os arquivos do harness em ~/.config/orbita/harnesses/<id>/ e devolve o comando de lançamento.
app.post('/api/harnesses/:id/prepare', async (c) => c.json(await prepareHarness(c.req.param('id'))))

app.get('/api/usage', async (c) => {
  const days = Number(c.req.query('days') ?? 30)
  if (!Number.isFinite(days) || days < 0 || days > 3650) throw new HTTPException(400, { message: 'Período inválido' })
  return c.json(await buildUsage(days, c.req.query('project') || undefined))
})

app.get('/api/sessions', async (c) => c.json(await listLive()))

app.get('/api/sessions/:sessionId/tail', async (c) => c.json(await sessionTail(c.req.param('sessionId'))))

app.get('/api/sessions/background/:id/logs', async (c) => c.json(await sessionLogs(c.req.param('id'))))

app.get('/api/activity', async (c) => c.json(await listActivity()))

app.use('/*', serveStatic({ root: './dist' }))
app.get('*', serveStatic({ path: './dist/index.html' }))

app.onError((err, c) => {
  if (err instanceof HTTPException) return c.json({ error: err.message }, err.status)
  console.error(err)
  return c.json({ error: 'Erro interno' }, 500)
})

serve({ fetch: app.fetch, port: PORT, hostname: '127.0.0.1' }, () => {
  console.log(`Orbita em http://127.0.0.1:${PORT}`)
})
