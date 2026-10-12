import { useState, type FormEvent } from 'react'
import { GLOBAL_SCOPE, type Agent, type Project } from '../../shared/types'
import type { DiscoveredProject } from '../../shared/inventory'
import { SECTIONS, type SectionId } from './inventory/meta'
import { CloseIcon, FolderIcon, GlobeIcon, MoonIcon, OrbitIcon, PlusIcon, SunIcon } from './Icons'

interface Props {
  agents: Agent[]
  projects: Project[]
  discovered: DiscoveredProject[]
  scope: string
  section: SectionId
  /** Contagem por seção no escopo atual. */
  sectionCounts: Partial<Record<SectionId, number>>
  theme: 'dark' | 'light'
  onScope: (scope: string) => void
  onSection: (section: SectionId) => void
  onAddProject: (path: string) => Promise<void>
  onRemoveProject: (id: string) => void
  onToggleTheme: () => void
}

export const ALL_SCOPE = 'all'
const SUGGESTED_LIMIT = 5

export function Sidebar({ agents, projects, discovered, scope, section, sectionCounts, theme, onScope, onSection, onAddProject, onRemoveProject, onToggleTheme }: Props) {
  const [adding, setAdding] = useState(false)
  const [path, setPath] = useState('')
  const [showAll, setShowAll] = useState(false)
  const [adopting, setAdopting] = useState<string | null>(null)
  const suggested = showAll ? discovered : discovered.slice(0, SUGGESTED_LIMIT)

  const adopt = async (target: string) => {
    setAdopting(target)
    await onAddProject(target)
    setAdopting(null)
  }

  const count = (id: string) => agents.filter((a) => a.scopeId === id).length

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (!path.trim()) return
    await onAddProject(path.trim())
    setPath('')
    setAdding(false)
  }

  return (
    <aside className="sidebar">
      <div className="brand">
        <span className="brand-mark">
          <OrbitIcon width={18} height={18} />
        </span>
        <span className="brand-name">Orbita</span>
      </div>

      <nav className="section-nav" aria-label="Seções">
        {SECTIONS.map((s) => (
          <button key={s.kind} className={`scope ${section === s.kind ? 'active' : ''}`} onClick={() => onSection(s.kind)}>
            <span className="scope-label">{s.label}</span>
            {s.kind !== 'usage' && <span className="scope-count">{sectionCounts[s.kind] ?? 0}</span>}
          </button>
        ))}
      </nav>

      <nav className="scopes">
        <div className="section-title">
          <span>Escopo</span>
        </div>
        <button className={`scope ${scope === ALL_SCOPE ? 'active' : ''}`} onClick={() => onScope(ALL_SCOPE)}>
          <span className="scope-label">Todos</span>
          <span className="scope-count">{section === 'agent' ? agents.length : ''}</span>
        </button>
        <button className={`scope ${scope === GLOBAL_SCOPE ? 'active' : ''}`} onClick={() => onScope(GLOBAL_SCOPE)}>
          <GlobeIcon />
          <span className="scope-label">Globais</span>
          <span className="scope-count">{section === 'agent' ? count(GLOBAL_SCOPE) : ''}</span>
        </button>

        <div className="section-title">
          <span>Projetos</span>
          <button className="icon-btn" onClick={() => setAdding((v) => !v)} aria-label="Adicionar projeto">
            <PlusIcon width={14} height={14} />
          </button>
        </div>

        {adding && (
          <form className="add-project" onSubmit={submit}>
            <input
              autoFocus
              value={path}
              onChange={(e) => setPath(e.target.value)}
              placeholder="/caminho/do/projeto"
              spellCheck={false}
            />
          </form>
        )}

        {projects.map((project) => (
          <div key={project.id} className={`scope-row ${scope === project.id ? 'active' : ''}`}>
            <button className="scope" onClick={() => onScope(project.id)} title={project.path}>
              <FolderIcon />
              <span className="scope-label">{project.name}</span>
              <span className="scope-count">{section === 'agent' ? count(project.id) : ''}</span>
            </button>
            <button className="icon-btn remove" onClick={() => onRemoveProject(project.id)} aria-label="Remover projeto">
              <CloseIcon width={12} height={12} />
            </button>
          </div>
        ))}

        {!projects.length && !adding && <p className="hint">Nenhum projeto registrado.</p>}

        {discovered.length > 0 && (
          <>
            <div className="section-title" title="Projetos que o Claude Code já abriu nesta máquina">
              <span>Sugeridos</span>
              <span className="scope-count">{discovered.length}</span>
            </div>
            {suggested.map((project) => (
              <div key={project.path} className="scope-row suggested">
                <span className="scope" title={project.path}>
                  <FolderIcon />
                  <span className="scope-label">{project.name}</span>
                  {project.mcpCount > 0 && <span className="scope-count">{project.mcpCount} MCP</span>}
                </span>
                <button
                  className="icon-btn add"
                  disabled={adopting === project.path}
                  onClick={() => void adopt(project.path)}
                  aria-label={`Registrar ${project.name}`}
                  title={`Registrar ${project.path}`}
                >
                  <PlusIcon width={14} height={14} />
                </button>
              </div>
            ))}
            {discovered.length > SUGGESTED_LIMIT && (
              <button className="more-link" onClick={() => setShowAll((v) => !v)}>
                {showAll ? 'Mostrar menos' : `Ver todos (${discovered.length})`}
              </button>
            )}
          </>
        )}
      </nav>

      <button className="theme-toggle" onClick={onToggleTheme}>
        {theme === 'dark' ? <SunIcon /> : <MoonIcon />}
        <span>{theme === 'dark' ? 'Tema claro' : 'Tema escuro'}</span>
      </button>
    </aside>
  )
}
