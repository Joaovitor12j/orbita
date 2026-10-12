import { useEffect } from 'react'
import type { Item } from '../../../shared/inventory'
import { CloseIcon } from '../Icons'

interface Props {
  name: string
  items: Item[]
  onOpen: (item: Item) => void
  onClose: () => void
}

export function GroupDrawer({ name, items, onOpen, onClose }: Props) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Com o detalhe de um item aberto por cima, o Esc fecha só ele.
      if (e.key === 'Escape' && document.querySelectorAll('.overlay').length === 1) onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <aside className="drawer" role="dialog" aria-label={`Origens de ${name}`}>
        <header className="drawer-head">
          <div>
            <h2>{name}</h2>
            <p className="path">
              {items.length} declarações do mesmo servidor, em origens diferentes
            </p>
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="Fechar">
            <CloseIcon />
          </button>
        </header>
        <div className="drawer-body">
          <ul className="inv-list">
            {items.map((item) => (
              <li key={item.id}>
                <button className={`inv-row ${item.enabled ? '' : 'off'}`} onClick={() => onOpen(item)}>
                  <span className={`inv-dot ${item.enabled ? 'on' : ''}`} aria-hidden />
                  <span className="inv-main">
                    <span className="inv-name">{item.origin}</span>
                    <span className="inv-desc">{String(item.meta.fullName ?? item.name)}</span>
                  </span>
                  <span className="inv-badges">
                    {item.warnings?.length ? <span className="badge warn">{item.warnings[0]!.startsWith('Requer') ? 'autenticar' : 'aviso'}</span> : null}
                    {!item.enabled && <span className="badge off">desligado</span>}
                    <span className="badge scope-badge">{String(item.meta.type)}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      </aside>
    </div>
  )
}
