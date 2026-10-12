import { useEffect } from 'react'
import { EFFORTS, HARNESS_MODELS, PERMISSION_MODES, type Harness } from '../../../shared/harness'
import type { Project } from '../../../shared/types'
import { CloseIcon } from '../Icons'

interface Props {
  a: Harness
  b: Harness
  projects: Project[]
  onClose: () => void
}

const labelOf = (options: { value: string; label: string }[], value: string) => options.find((o) => o.value === value)?.label ?? value

interface Row {
  label: string
  left: string
  right: string
}

const setText = (items: string[]) => (items.length ? items.join(', ') : '—')

// Para listas, mostra o que só um deles tem; o que é comum fica em "em ambos".
function diffList(label: string, x: string[], y: string[]): Row[] {
  const both = x.filter((i) => y.includes(i))
  const onlyX = x.filter((i) => !y.includes(i))
  const onlyY = y.filter((i) => !x.includes(i))
  if (!onlyX.length && !onlyY.length) return [{ label, left: setText(both), right: setText(both) }]
  return [{ label, left: `${setText(onlyX)}${both.length ? ` (+${both.length} em comum)` : ''}`, right: `${setText(onlyY)}${both.length ? ` (+${both.length} em comum)` : ''}` }]
}

const pluginList = (h: Harness) => Object.entries(h.plugins).map(([k, v]) => `${k.split('@')[0]} ${v ? 'ligado' : 'desligado'}`)

export function CompareDrawer({ a, b, projects, onClose }: Props) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const project = (h: Harness) => projects.find((p) => p.id === h.projectId)?.name ?? 'Diretório atual'
  const mcp = (h: Harness) => (h.mcp.mode === 'only' ? h.mcp.servers.map((s) => `${s.name} (${s.origin})`) : [])
  const rows: Row[] = [
    { label: 'Projeto', left: project(a), right: project(b) },
    { label: 'Modelo', left: labelOf(HARNESS_MODELS, a.model), right: labelOf(HARNESS_MODELS, b.model) },
    { label: 'Esforço', left: labelOf(EFFORTS, a.effort), right: labelOf(EFFORTS, b.effort) },
    { label: 'Permissões', left: labelOf(PERMISSION_MODES, a.permissionMode), right: labelOf(PERMISSION_MODES, b.permissionMode) },
    { label: 'Ferramentas permitidas', left: a.allowedTools || '—', right: b.allowedTools || '—' },
    { label: 'Ferramentas negadas', left: a.disallowedTools || '—', right: b.disallowedTools || '—' },
    { label: 'Instruções', left: a.instructions ? `${a.instructions.length} caracteres` : '—', right: b.instructions ? `${b.instructions.length} caracteres` : '—' },
    ...diffList('Plugins ajustados', pluginList(a), pluginList(b)),
    ...diffList('Skills desligadas', a.skillsOff, b.skillsOff),
    { label: 'Modo MCP', left: a.mcp.mode === 'only' ? 'Somente os escolhidos' : 'Os de sempre', right: b.mcp.mode === 'only' ? 'Somente os escolhidos' : 'Os de sempre' },
    ...diffList('Servidores MCP', mcp(a), mcp(b)),
    ...diffList('Agentes extras', a.agents.map((r) => r.name), b.agents.map((r) => r.name)),
  ]
  const different = rows.filter((r) => r.left !== r.right).length

  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <aside className="drawer wide" role="dialog" aria-label="Comparar harness">
        <header className="drawer-head">
          <div>
            <h2>
              {a.name} <span className="vs">×</span> {b.name}
            </h2>
            <p className="path">{different === 0 ? 'Configurações idênticas' : `${different} diferença${different > 1 ? 's' : ''}`}</p>
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="Fechar">
            <CloseIcon />
          </button>
        </header>
        <div className="drawer-body">
          <table className="compare">
            <thead>
              <tr>
                <th />
                <th>{a.name}</th>
                <th>{b.name}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.label} className={r.left !== r.right ? 'diff' : ''}>
                  <th>{r.label}</th>
                  <td>{r.left}</td>
                  <td>{r.right}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </aside>
    </div>
  )
}
