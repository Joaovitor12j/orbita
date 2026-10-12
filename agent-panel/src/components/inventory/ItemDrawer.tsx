import { useEffect, type ReactNode } from 'react'
import type { Item } from '../../../shared/inventory'
import { CloseIcon } from '../Icons'
import { HIDDEN_META, META_LABELS, META_VALUES, sectionOf } from './meta'

interface Props {
  item: Item
  all: Item[]
  onClose: () => void
  onEdit?: (item: Item) => void
  onTogglePlugin?: (item: Item) => void
}

const BODY_LIMIT = 20_000

function renderValue(value: unknown): ReactNode {
  if (Array.isArray(value)) {
    return (
      <div className="chips">
        {value.map((v, i) => (
          <span key={`${String(v)}-${i}`} className="chip">
            {String(v)}
          </span>
        ))}
      </div>
    )
  }
  if (value && typeof value === 'object') {
    return (
      <ul className="kv">
        {Object.entries(value).map(([k, v]) => (
          <li key={k}>
            <span>{k}</span>
            <code>{String(v)}</code>
          </li>
        ))}
      </ul>
    )
  }
  return <code className="val">{String(value)}</code>
}

const isEmpty = (v: unknown) =>
  v === undefined || v === null || v === '' || (Array.isArray(v) && !v.length) || (typeof v === 'object' && !Array.isArray(v) && !Object.keys(v as object).length)

export function ItemDrawer({ item, all, onClose, onEdit, onTogglePlugin }: Props) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const winner = item.shadowedBy ? all.find((i) => i.id === item.shadowedBy) : undefined
  const body = typeof item.meta.body === 'string' ? item.meta.body : ''
  const props = Object.entries(item.meta).filter(([k, v]) => !HIDDEN_META.has(k) && !isEmpty(v))

  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <aside className="drawer" role="dialog" aria-label={`${sectionOf(item.kind).singular} ${item.name}`}>
        <header className="drawer-head">
          <div>
            <h2>{item.name}</h2>
            <p className="path">{item.path}</p>
          </div>
          <div className="head-actions">
            {item.editable && onEdit && (
              <button className="btn ghost" onClick={() => onEdit(item)}>
                Editar
              </button>
            )}
            {item.toggleable && onTogglePlugin && (
              <button className="btn ghost" onClick={() => onTogglePlugin(item)}>
                {item.enabled ? 'Desligar' : 'Ligar'}
              </button>
            )}
            <button className="icon-btn" onClick={onClose} aria-label="Fechar">
              <CloseIcon />
            </button>
          </div>
        </header>

        <div className="drawer-body">
          <div className="chips">
            <span className="badge">{sectionOf(item.kind).singular}</span>
            <span className="badge scope-badge">{item.origin}</span>
            <span className={`badge ${item.enabled ? 'ok' : 'off'}`}>{item.enabled ? 'ativo' : 'desligado'}</span>
          </div>

          {winner && (
            <p className="notice warn">
              Sobrescrito por <strong>{winner.name}</strong> ({winner.origin}): o Claude Code usa o outro.
            </p>
          )}
          {item.warnings?.map((w) => (
            <p key={w} className="notice warn">
              {w}
            </p>
          ))}

          {item.description && <p className="inv-full-desc">{item.description}</p>}

          {props.length > 0 && (
            <dl className="props">
              {props.map(([key, value]) => (
                <div key={key}>
                  <dt>{META_LABELS[key] ?? key}</dt>
                  <dd>{renderValue(META_VALUES[key]?.[String(value)] ?? value)}</dd>
                </div>
              ))}
            </dl>
          )}

          {body && (
            <div className="field grow">
              <label>
                Conteúdo <small>{body.split('\n').length} linhas · somente leitura</small>
              </label>
              <pre className="body-view">{body.length > BODY_LIMIT ? `${body.slice(0, BODY_LIMIT)}\n\n… (truncado)` : body}</pre>
            </div>
          )}
        </div>
      </aside>
    </div>
  )
}
