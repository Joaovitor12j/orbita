import { serve } from '@hono/node-server'
import { serveStatic } from '@hono/node-server/serve-static'
import { Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'
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
