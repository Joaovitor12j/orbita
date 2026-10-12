import { useCallback, useEffect, useState } from 'react'
import { EFFORTS, HARNESS_MODELS, PERMISSION_MODES, type Harness, type HarnessInput } from '../../../shared/harness'
import type { Item } from '../../../shared/inventory'
import type { Project } from '../../../shared/types'
import { api } from '../../api'
import { PlusIcon } from '../Icons'
import { CompareDrawer } from './CompareDrawer'
import { HarnessEditor } from './HarnessEditor'
import { LaunchDrawer } from './LaunchDrawer'

interface Props {
  projects: Project[]
  run: <T>(action: () => Promise<T>, success?: string) => Promise<T | undefined>
  /** Avisa o App quando a lista muda (contagem na barra lateral). */
  onChanged: () => void
}

const labelOf = (options: { value: string; label: string }[], value: string) => options.find((o) => o.value === value)?.label ?? value

export function HarnessView({ projects, run, onChanged }: Props) {
  const [harnesses, setHarnesses] = useState<Harness[]>([])
  const [inventory, setInventory] = useState<Item[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<Harness | 'new' | null>(null)
  const [launching, setLaunching] = useState<Harness | null>(null)
  const [picked, setPicked] = useState<string[]>([])
  const [comparing, setComparing] = useState(false)

  const reload = useCallback(async () => {
    const [list, inv] = await Promise.all([api.listHarnesses(), api.getInventory().then((r) => r.items)])
    setHarnesses(list)
    setInventory(inv)
  }, [])

  useEffect(() => {
    void run(reload).finally(() => setLoading(false))
  }, [reload, run])

  const save = async (input: HarnessInput, id?: string) => {
    const saved = await run(() => (id ? api.updateHarness(id, input) : api.createHarness(input)), id ? 'Harness salvo' : 'Harness criado')
    if (!saved) return false
    setEditing(null)
    await run(reload)
    onChanged()
    return true
  }

  const remove = async (harness: Harness) => {
    const done = await run(() => api.deleteHarness(harness.id).then(() => true), 'Harness excluído')
    if (!done) return
    setEditing(null)
    setPicked((p) => p.filter((id) => id !== harness.id))
    await run(reload)
    onChanged()
  }

  const duplicate = async (harness: Harness) => {
    const { id: _id, updatedAt: _u, ...rest } = harness
    const copy = await run(() => api.createHarness({ ...rest, name: `${harness.name} (cópia)` }), 'Harness duplicado')
    if (copy) {
      await run(reload)
      onChanged()
    }
  }

  const togglePick = (id: string) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id].slice(-2)))
  const pair = picked.map((id) => harnesses.find((h) => h.id === id)).filter((h): h is Harness => Boolean(h))

  if (loading) return <div className="empty">Carregando...</div>

  return (
    <section className="harness-view">
      <div className="inv-filters">
        <button className="btn primary" onClick={() => setEditing('new')}>
          <PlusIcon /> Novo harness
        </button>
        <button className="btn ghost" disabled={pair.length !== 2} onClick={() => setComparing(true)} title="Marque dois harness nos cartões">
          Comparar {pair.length}/2
        </button>
        <span className="inv-count">{harnesses.length} harness</span>
      </div>

      {harnesses.length === 0 ? (
        <div className="empty">
          <p>Um harness é um perfil de sessão: modelo, plugins, MCPs e agentes que valem só para um jeito de trabalhar.</p>
          <button className="btn primary" onClick={() => setEditing('new')}>
            <PlusIcon /> Criar o primeiro harness
          </button>
        </div>
      ) : (
        <div className="grid">
          {harnesses.map((h) => {
            const project = projects.find((p) => p.id === h.projectId)
            const tweaks = Object.keys(h.plugins).length + h.skillsOff.length
            return (
              <article key={h.id} className={`card harness-card ${picked.includes(h.id) ? 'picked' : ''}`} style={{ ['--agent' as string]: 'var(--accent)' }}>
                <header className="card-head">
                  <h3>{h.name}</h3>
                  <label className="pick-box" title="Marcar para comparar">
                    <input type="checkbox" checked={picked.includes(h.id)} onChange={() => togglePick(h.id)} aria-label={`Comparar ${h.name}`} />
                  </label>
                </header>
                <p className="card-desc">{h.description || 'Sem descrição'}</p>
                <div className="chips">
                  <span className="chip">{project ? project.name : 'diretório atual'}</span>
                  {h.model && <span className="chip">{labelOf(HARNESS_MODELS, h.model)}</span>}
                  {h.effort && <span className="chip">esforço {labelOf(EFFORTS, h.effort).toLowerCase()}</span>}
                  {h.permissionMode && <span className="chip">{labelOf(PERMISSION_MODES, h.permissionMode).split(' (')[0]}</span>}
                  {h.mcp.mode === 'only' && <span className="chip">{h.mcp.servers.length} MCP exclusivos</span>}
                  {h.agents.length > 0 && <span className="chip">{h.agents.length} agentes extras</span>}
                  {tweaks > 0 && <span className="chip">{tweaks} ajustes</span>}
                </div>
                <footer className="card-foot actions">
                  <button className="btn primary" onClick={() => setLaunching(h)}>
                    Lançar
                  </button>
                  <button className="btn ghost" onClick={() => setEditing(h)}>
                    Editar
                  </button>
                  <button className="btn ghost" onClick={() => void duplicate(h)}>
                    Duplicar
                  </button>
                </footer>
              </article>
            )
          })}
        </div>
      )}

      {editing && (
        <HarnessEditor
          key={editing === 'new' ? 'new' : `${editing.id}:${editing.updatedAt}`}
          harness={editing === 'new' ? null : editing}
          inventory={inventory}
          projects={projects}
          onSave={save}
          onDelete={remove}
          onClose={() => setEditing(null)}
        />
      )}
      {launching && <LaunchDrawer harness={launching} onClose={() => setLaunching(null)} />}
      {comparing && pair.length === 2 && <CompareDrawer a={pair[0]!} b={pair[1]!} projects={projects} onClose={() => setComparing(false)} />}
    </section>
  )
}
