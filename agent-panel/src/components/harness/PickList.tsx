import { useMemo, useState } from 'react'

export interface PickOption {
  id: string
  label: string
  sub?: string
}

interface Props {
  options: PickOption[]
  selected: Set<string>
  onToggle: (id: string) => void
  placeholder?: string
}

/** Lista com busca e caixas de seleção, para escolher itens do inventário. */
export function PickList({ options, selected, onToggle, placeholder = 'Filtrar…' }: Props) {
  const [query, setQuery] = useState('')
  const shown = useMemo(() => {
    const term = query.trim().toLowerCase()
    return term ? options.filter((o) => `${o.label} ${o.sub ?? ''}`.toLowerCase().includes(term)) : options
  }, [options, query])

  return (
    <div className="picklist">
      <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={placeholder} spellCheck={false} />
      <ul>
        {shown.map((o) => (
          <li key={o.id}>
            <label>
              <input type="checkbox" checked={selected.has(o.id)} onChange={() => onToggle(o.id)} />
              <span className="pick-label">{o.label}</span>
              {o.sub && <small>{o.sub}</small>}
            </label>
          </li>
        ))}
        {shown.length === 0 && <li className="pick-empty">Nada encontrado</li>}
      </ul>
    </div>
  )
}
