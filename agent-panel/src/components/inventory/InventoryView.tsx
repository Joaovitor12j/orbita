import { useMemo, useState } from 'react'
import type { Item } from '../../../shared/inventory'
import { GroupDrawer } from './GroupDrawer'
import { sectionOf, type Section } from './meta'

interface Props {
  section: Section
  items: Item[]
  query: string
  onOpen: (item: Item) => void
}

const ALL = ''

interface Row {
  key: string
  items: Item[]
}

// MCPs repetidos (o mesmo servidor vindo de plugins e conectores) viram uma linha só.
const groupRows = (items: Item[], group: boolean): Row[] => {
  if (!group) return items.map((item) => ({ key: item.id, items: [item] }))
  const map = new Map<string, Item[]>()
  for (const item of items) {
    const key = item.name.toLowerCase()
    map.set(key, [...(map.get(key) ?? []), item])
  }
  return [...map.entries()].map(([key, members]) => ({ key, items: members }))
}

export function InventoryView({ section, items, query, onOpen }: Props) {
  const [origin, setOrigin] = useState(ALL)
  const [state, setState] = useState<'all' | 'active' | 'off'>('all')
  const [openGroup, setOpenGroup] = useState<Row | null>(null)
  const grouped = section.kind === 'mcp'

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

  const rows = useMemo(() => groupRows(visible, grouped), [visible, grouped])

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
          {grouped && rows.length !== visible.length
            ? `${rows.length} servidores (${visible.length} declarações)`
            : `${visible.length} de ${items.length} ${sectionOf(section.kind).label.toLowerCase()}`}
        </span>
      </div>

      {visible.length === 0 ? (
        <div className="empty">Nada corresponde aos filtros.</div>
      ) : (
        <ul className="inv-list">
          {rows.map((row) => {
            const first = row.items.find((i) => i.description && i.meta.type !== 'connector') ?? row.items[0]!
            const many = row.items.length > 1
            const off = row.items.filter((i) => !i.enabled).length
            const warned = row.items.filter((i) => i.warnings?.length).length
            const origins = [...new Set(row.items.map((i) => i.origin))]
            return (
              <li key={row.key}>
                <button
                  className={`inv-row ${off === row.items.length ? 'off' : ''} ${!many && first.shadowedBy ? 'shadowed' : ''}`}
                  onClick={() => (many ? setOpenGroup(row) : onOpen(first))}
                >
                  <span className={`inv-dot ${off < row.items.length ? 'on' : ''}`} aria-hidden />
                  <span className="inv-main">
                    <span className="inv-name">{first.name}</span>
                    <span className="inv-desc">{first.description || 'Sem descrição'}</span>
                  </span>
                  <span className="inv-badges">
                    {!many && first.shadowedBy && <span className="badge warn">sobrescrito</span>}
                    {warned > 0 && <span className="badge warn">{many ? `${warned} de ${row.items.length} com aviso` : `${first.warnings!.length} aviso${first.warnings!.length > 1 ? 's' : ''}`}</span>}
                    {off > 0 && <span className="badge off">{many && off < row.items.length ? `${off} desligado${off > 1 ? 's' : ''}` : 'desligado'}</span>}
                    {!many && first.kind === 'mcp' && <span className="badge scope-badge">{String(first.meta.type)}</span>}
                    {!many && first.kind === 'plugin' && /^\d/.test(String(first.meta.version ?? '')) ? <span className="badge scope-badge">v{String(first.meta.version)}</span> : null}
                    {origins.slice(0, 3).map((o) => (
                      <span key={o} className="badge scope-badge">
                        {o}
                      </span>
                    ))}
                    {origins.length > 3 && <span className="badge scope-badge">+{origins.length - 3}</span>}
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      )}
      {openGroup && <GroupDrawer name={openGroup.items[0]!.name} items={openGroup.items} onOpen={onOpen} onClose={() => setOpenGroup(null)} />}
    </section>
  )
}
