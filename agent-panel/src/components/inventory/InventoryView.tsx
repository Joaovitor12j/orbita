import { useMemo, useState } from 'react'
import type { Item } from '../../../shared/inventory'
import { sectionOf, type Section } from './meta'

interface Props {
  section: Section
  items: Item[]
  query: string
  onOpen: (item: Item) => void
}

const ALL = ''

export function InventoryView({ section, items, query, onOpen }: Props) {
  const [origin, setOrigin] = useState(ALL)
  const [state, setState] = useState<'all' | 'active' | 'off'>('all')

  const origins = useMemo(() => [...new Set(items.map((i) => i.origin))].sort((a, b) => a.localeCompare(b)), [items])

  const visible = useMemo(() => {
    const term = query.trim().toLowerCase()
    return items.filter((item) => {
      if (origin && item.origin !== origin) return false
      if (state === 'active' && !item.enabled) return false
      if (state === 'off' && item.enabled) return false
      return !term || [item.name, item.description, item.origin].some((t) => t.toLowerCase().includes(term))
    })
  }, [items, origin, state, query])

  if (!items.length) return <div className="empty">{section.empty}</div>

  return (
    <section className="inventory">
      <div className="inv-filters">
        <div className="segmented" role="group" aria-label="Estado">
          {(
            [
              ['all', 'Todos'],
              ['active', 'Ativos'],
              ['off', 'Desligados'],
            ] as const
          ).map(([value, label]) => (
            <button key={value} className={state === value ? 'active' : ''} onClick={() => setState(value)}>
              {label}
            </button>
          ))}
        </div>
        <select className="select" value={origin} onChange={(e) => setOrigin(e.target.value)} aria-label="Origem">
          <option value={ALL}>Todas as origens</option>
          {origins.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
        <span className="inv-count">
          {visible.length} de {items.length} {sectionOf(section.kind).label.toLowerCase()}
        </span>
      </div>

      {visible.length === 0 ? (
        <div className="empty">Nada corresponde aos filtros.</div>
      ) : (
        <ul className="inv-list">
          {visible.map((item) => (
            <li key={item.id}>
              <button className={`inv-row ${item.enabled ? '' : 'off'} ${item.shadowedBy ? 'shadowed' : ''}`} onClick={() => onOpen(item)}>
                <span className={`inv-dot ${item.enabled ? 'on' : ''}`} aria-hidden />
                <span className="inv-main">
                  <span className="inv-name">{item.name}</span>
                  <span className="inv-desc">{item.description || 'Sem descrição'}</span>
                </span>
                <span className="inv-badges">
                  {item.shadowedBy && <span className="badge warn">sobrescrito</span>}
                  {item.warnings?.length ? <span className="badge warn">{item.warnings.length} aviso{item.warnings.length > 1 ? 's' : ''}</span> : null}
                  {!item.enabled && <span className="badge off">desligado</span>}
                  {item.kind === 'mcp' && <span className="badge scope-badge">{String(item.meta.type)}</span>}
                  {item.kind === 'plugin' && /^\d/.test(String(item.meta.version ?? '')) ? <span className="badge scope-badge">v{String(item.meta.version)}</span> : null}
                  <span className="badge scope-badge">{item.origin}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
