import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { GLOBAL_SCOPE, TABLE_SEATS, type Activity, type Agent, type AgentInput, type Project } from '../shared/types'
import type { DiscoveredProject, EditableKind, Item, ItemInput, ItemKind } from '../shared/inventory'
import { api } from './api'
import { AgentCard } from './components/AgentCard'
import { AgentDrawer, type ScopeOption } from './components/AgentDrawer'
import { Hall } from './components/Hall'
import { PlusIcon, SearchIcon } from './components/Icons'
import { ALL_SCOPE, Sidebar } from './components/Sidebar'
import { InventoryView } from './components/inventory/InventoryView'
import { ItemDrawer } from './components/inventory/ItemDrawer'
import { ItemEditor } from './components/inventory/ItemEditor'
import { sectionOf } from './components/inventory/meta'
import { MODELS } from './constants'

const Hall3D = lazy(() => import('./components/hall/Hall3D').then((m) => ({ default: m.Hall3D })))

type Theme = 'dark' | 'light'
type StatusFilter = 'all' | 'enabled' | 'disabled'
type View = 'hall' | 'hall3d' | 'list'

const ACTIVITY_POLL_MS = 2500
type Toast = { message: string; error: boolean }

const hasWebGL = (() => {
  try {
    return Boolean(document.createElement('canvas').getContext('webgl2') ?? document.createElement('canvas').getContext('webgl'))
  } catch {
    return false
  }
})()

const initialView = (): View => {
  const stored = localStorage.getItem('orbita-view')
  if (stored === 'hall3d') return hasWebGL ? 'hall3d' : 'hall'
  return stored === 'list' || stored === 'hall' ? stored : 'hall'
}

const initialSection = (): ItemKind => {
  const stored = localStorage.getItem('orbita-section')
  return ['skill', 'command', 'hook', 'mcp', 'plugin', 'rule'].includes(stored ?? '') ? (stored as ItemKind) : 'agent'
}

const initialTheme = (): Theme => {
  const stored = localStorage.getItem('orbita-theme')
  if (stored === 'light' || stored === 'dark') return stored
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'
}

export default function App() {
  const [agents, setAgents] = useState<Agent[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [discovered, setDiscovered] = useState<DiscoveredProject[]>([])
  const [loading, setLoading] = useState(true)
  const [scope, setScope] = useState(ALL_SCOPE)
  const [query, setQuery] = useState('')
  const [model, setModel] = useState('')
  const [status, setStatus] = useState<StatusFilter>('all')
  const [selected, setSelected] = useState<Agent | 'new' | null>(null)
  const [view, setView] = useState<View>(initialView)
  const [section, setSection] = useState<ItemKind>(initialSection)
  const [inventory, setInventory] = useState<Item[]>([])
  const [openItem, setOpenItem] = useState<Item | null>(null)
  const [editor, setEditor] = useState<{ kind: EditableKind; item: Item | null } | null>(null)
  const [inventoryTick, setInventoryTick] = useState(0)
  const [seats, setSeats] = useState<(string | null)[]>(() => Array<string | null>(TABLE_SEATS).fill(null))
  const [activity, setActivity] = useState<Activity[]>([])
  const [theme, setTheme] = useState<Theme>(initialTheme)
  const [toast, setToast] = useState<Toast | null>(null)
  const searchRef = useRef<HTMLInputElement>(null)

  const notify = useCallback((message: string, error = false) => {
    setToast({ message, error })
    window.setTimeout(() => setToast(null), 3200)
  }, [])

  const run = useCallback(
    async <T,>(action: () => Promise<T>, success?: string): Promise<T | undefined> => {
      try {
        const result = await action()
        if (success) notify(success)
        return result
      } catch (error) {
        notify(error instanceof Error ? error.message : 'Falha na operação', true)
        return undefined
      }
    },
    [notify],
  )

  const reload = useCallback(async () => {
    const [nextAgents, nextProjects, table, nextDiscovered] = await Promise.all([
      api.listAgents(),
      api.listProjects(),
      api.getTable(),
      api.listDiscovered().catch(() => [] as DiscoveredProject[]),
    ])
    setDiscovered(nextDiscovered)
    setAgents(nextAgents)
    setProjects(nextProjects)
    setSeats(table.seats)
  }, [])

  useEffect(() => {
    void run(reload).finally(() => setLoading(false))
  }, [reload, run])

  useEffect(() => {
    let alive = true
    const poll = () =>
      api
        .listActivity()
        .then((next) => alive && setActivity(next))
        .catch(() => undefined)
    void poll()
    const timer = window.setInterval(poll, ACTIVITY_POLL_MS)
    return () => {
      alive = false
      window.clearInterval(timer)
    }
  }, [])

  useEffect(() => {
    let alive = true
    api
      .getInventory(scope === ALL_SCOPE ? undefined : scope)
      .then((next) => alive && setInventory(next.items))
      .catch(() => alive && setInventory([]))
    return () => {
      alive = false
    }
  }, [scope, agents, inventoryTick])

  useEffect(() => {
    localStorage.setItem('orbita-section', section)
  }, [section])

  useEffect(() => {
    localStorage.setItem('orbita-view', view)
  }, [view])

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    localStorage.setItem('orbita-theme', theme)
  }, [theme])

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key === 'k') {
        event.preventDefault()
        searchRef.current?.focus()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  const scopes: ScopeOption[] = useMemo(
    () => [{ id: GLOBAL_SCOPE, label: 'Global' }, ...projects.map((p) => ({ id: p.id, label: p.name }))],
    [projects],
  )

  const visible = useMemo(() => {
    const term = query.trim().toLowerCase()
    return agents.filter((agent) => {
      if (scope !== ALL_SCOPE && agent.scopeId !== scope) return false
      if (model && agent.model !== model) return false
      if (status === 'enabled' && !agent.enabled) return false
      if (status === 'disabled' && agent.enabled) return false
      if (!term) return true
      return [agent.name, agent.description, ...agent.tools].some((text) => text.toLowerCase().includes(term))
    })
  }, [agents, scope, model, status, query])

  const stats = useMemo(
    () => ({
      total: agents.length,
      active: agents.filter((a) => a.enabled).length,
      projects: projects.length,
    }),
    [agents, projects],
  )

  const handleSave = async (input: AgentInput, id?: string) => {
    const saved = await run(() => (id ? api.updateAgent(id, input) : api.createAgent(input)), 'Agente salvo')
    if (!saved) return
    await run(reload)
    setSelected(saved)
  }

  const handleBuild = async (input: AgentInput) => {
    const built = await run(() => api.createAgent(input), `Robô ${input.name} montado`)
    if (!built) return false
    await run(reload)
    return true
  }

  const handleToggle = async (agent: Agent) => {
    const updated = await run(() => api.toggleAgent(agent.id))
    if (!updated) return
    await run(reload)
    setSelected((current) => (current && current !== 'new' && current.id === agent.id ? updated : current))
  }

  const handleDelete = async (agent: Agent) => {
    const done = await run(() => api.removeAgent(agent.id).then(() => true), 'Agente excluído')
    if (!done) return
    setSelected(null)
    await run(reload)
  }

  const handleCopy = async (agent: Agent, scopeId: string) => {
    const copied = await run(() => api.copyAgent(agent.id, scopeId), 'Agente copiado')
    if (!copied) return
    await run(reload)
  }

  const handleSeats = async (next: (string | null)[]) => {
    const previous = seats
    setSeats(next)
    const saved = await run(() => api.saveTable({ seats: next }))
    setSeats(saved ? saved.seats : previous)
  }

  const afterItemChange = () => {
    setEditor(null)
    setOpenItem(null)
    setInventoryTick((n) => n + 1)
  }

  const handleItemSave = async (input: ItemInput, path?: string) => {
    const done = await run(
      () => (path ? api.updateItem(path, input) : api.createItem(input)),
      path ? 'Alterações salvas' : `${input.kind === 'skill' ? 'Skill' : 'Comando'} criado`,
    )
    if (done) afterItemChange()
    return Boolean(done)
  }

  const handleItemDelete = async (item: Item) => {
    const done = await run(() => api.deleteItem(item.path).then(() => true), item.kind === 'skill' ? 'Skill excluída' : 'Comando excluído')
    if (done) afterItemChange()
  }

  const handleItemRestore = async (path: string, version: string) => {
    if (!window.confirm('Restaurar esta versão? A versão atual fica guardada no histórico.')) return
    const done = await run(() => api.restoreVersion(path, version), 'Versão restaurada')
    if (done) afterItemChange()
  }

  const handleAddProject = async (path: string) => {
    const project = await run(() => api.addProject(path), 'Projeto registrado')
    if (!project) return
    await run(reload)
    setScope(project.id)
  }

  const handleRemoveProject = async (id: string) => {
    await run(() => api.removeProject(id), 'Projeto removido da lista')
    if (scope === id) setScope(ALL_SCOPE)
    await run(reload)
  }

  const sectionItems = useMemo(() => inventory.filter((i) => i.kind === section), [inventory, section])
  const sectionCounts = useMemo(() => {
    const counts: Partial<Record<ItemKind, number>> = {}
    for (const item of inventory) if (item.kind !== 'agent') counts[item.kind] = (counts[item.kind] ?? 0) + 1
    counts.agent = scope === ALL_SCOPE ? agents.length : agents.filter((a) => a.scopeId === scope).length
    return counts
  }, [inventory, agents, scope])

  const scopeLabel = scope === ALL_SCOPE ? 'Todos os escopos' : scopes.find((s) => s.id === scope)?.label ?? ''
  const isAgents = section === 'agent'
  const title = isAgents
    ? scope === ALL_SCOPE
      ? 'Todos os agentes'
      : scopes.find((s) => s.id === scope)?.label ?? 'Agentes'
    : sectionOf(section).label

  return (
    <div className="layout">
      <Sidebar
        agents={agents}
        projects={projects}
        discovered={discovered}
        scope={scope}
        section={section}
        sectionCounts={sectionCounts}
        theme={theme}
        onScope={setScope}
        onSection={setSection}
        onAddProject={handleAddProject}
        onRemoveProject={handleRemoveProject}
        onToggleTheme={() => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))}
      />

      <main className="main">
        <header className="topbar">
          <div>
            <h1>{title}</h1>
            <p className="subtitle">
              {isAgents
                ? `${stats.active} de ${stats.total} ativos em ${stats.projects + 1} escopos`
                : `${sectionItems.filter((i) => i.enabled).length} de ${sectionItems.length} ativos · ${scopeLabel}`}
            </p>
          </div>
          <div className="topbar-actions">
            {isAgents && (
            <div className="segmented" role="group" aria-label="Visualização">
              <button className={view === 'hall' ? 'active' : ''} onClick={() => setView('hall')}>
                Salão
              </button>
              <button
                className={view === 'hall3d' ? 'active' : ''}
                onClick={() => setView('hall3d')}
                disabled={!hasWebGL}
                title={hasWebGL ? undefined : 'WebGL indisponível neste navegador'}
              >
                Salão 3D
              </button>
              <button className={view === 'list' ? 'active' : ''} onClick={() => setView('list')}>
                Lista
              </button>
            </div>
            )}
            {isAgents && (
              <button className="btn primary" onClick={() => setSelected('new')}>
                <PlusIcon /> Novo agente
              </button>
            )}
            {(section === 'skill' || section === 'command') && (
              <button className="btn primary" onClick={() => setEditor({ kind: section, item: null })}>
                <PlusIcon /> {section === 'skill' ? 'Nova skill' : 'Novo comando'}
              </button>
            )}
          </div>
        </header>

        <div className="toolbar">
          <label className="search">
            <SearchIcon />
            <input
              ref={searchRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar por nome, descrição ou ferramenta"
            />
            <kbd>Ctrl K</kbd>
          </label>

          {isAgents && (<>
          <div className="segmented" role="group" aria-label="Status">
            {(
              [
                ['all', 'Todos'],
                ['enabled', 'Ativos'],
                ['disabled', 'Inativos'],
              ] as const
            ).map(([value, label]) => (
              <button key={value} className={status === value ? 'active' : ''} onClick={() => setStatus(value)}>
                {label}
              </button>
            ))}
          </div>

          <select className="select" value={model} onChange={(e) => setModel(e.target.value)}>
            <option value="">Todos os modelos</option>
            {MODELS.filter((m) => m.value).map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </select>
          </>)}
        </div>

        {loading ? (
          <div className="empty">Carregando...</div>
        ) : !isAgents ? (
          <InventoryView key={section} section={sectionOf(section)} items={sectionItems} query={query} onOpen={setOpenItem} />
        ) : view === 'list' && visible.length === 0 ? (
          <div className="empty">
            <p>{agents.length === 0 ? 'Nenhum agente encontrado.' : 'Nenhum agente corresponde aos filtros.'}</p>
            {agents.length === 0 && (
              <button className="btn primary" onClick={() => setSelected('new')}>
                <PlusIcon /> Criar o primeiro agente
              </button>
            )}
          </div>
        ) : view === 'hall3d' ? (
          <Suspense fallback={<div className="empty">Carregando o salão 3D...</div>}>
            <Hall3D
              agents={agents}
              visibleIds={new Set(visible.map((a) => a.id))}
              seats={seats}
              activity={activity}
              onSeatsChange={handleSeats}
              selectedId={selected && selected !== 'new' ? selected.id : undefined}
              onOpen={setSelected}
              onToggle={handleToggle}
              scopes={scopes}
              defaultScope={scope === ALL_SCOPE ? GLOBAL_SCOPE : scope}
              onBuild={handleBuild}
            />
          </Suspense>
        ) : view === 'hall' ? (
          <Hall
            agents={agents}
            visibleIds={new Set(visible.map((a) => a.id))}
            seats={seats}
            activity={activity}
            onSeatsChange={handleSeats}
            selectedId={selected && selected !== 'new' ? selected.id : undefined}
            onOpen={setSelected}
            onToggle={handleToggle}
            scopes={scopes}
            defaultScope={scope === ALL_SCOPE ? GLOBAL_SCOPE : scope}
            onBuild={handleBuild}
          />
        ) : (
          <section className="grid">
            {visible.map((agent) => (
              <AgentCard
                key={agent.id}
                agent={agent}
                showScope={scope === ALL_SCOPE}
                onOpen={setSelected}
                onToggle={handleToggle}
              />
            ))}
          </section>
        )}
      </main>

      {openItem && (
        <ItemDrawer
          item={openItem}
          all={inventory}
          onClose={() => setOpenItem(null)}
          onEdit={(item) => {
            setOpenItem(null)
            setEditor({ kind: item.kind as EditableKind, item })
          }}
        />
      )}

      {editor && (
        <ItemEditor
          key={editor.item ? `${editor.item.id}:${String(editor.item.meta.mtime)}` : `new-${editor.kind}`}
          kind={editor.kind}
          item={editor.item}
          scopes={scopes}
          defaultScope={scope === ALL_SCOPE ? GLOBAL_SCOPE : scope}
          onSave={handleItemSave}
          onDelete={handleItemDelete}
          onRestore={handleItemRestore}
          onClose={() => setEditor(null)}
        />
      )}

      {selected && isAgents && (
        <AgentDrawer
          key={selected === 'new' ? 'new' : `${selected.id}:${selected.updatedAt}`}
          agent={selected === 'new' ? null : selected}
          scopes={scopes}
          defaultScope={scope === ALL_SCOPE ? GLOBAL_SCOPE : scope}
          onSave={handleSave}
          onDelete={handleDelete}
          onCopy={handleCopy}
          onClose={() => setSelected(null)}
        />
      )}

      {toast && <div className={`toast ${toast.error ? 'error' : ''}`}>{toast.message}</div>}
    </div>
  )
}
