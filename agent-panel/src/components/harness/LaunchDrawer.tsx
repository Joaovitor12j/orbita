import { useEffect, useState } from 'react'
import type { Harness, Prepared } from '../../../shared/harness'
import { api } from '../../api'
import { CloseIcon, CopyIcon } from '../Icons'

interface Props {
  harness: Harness
  onClose: () => void
}

export function LaunchDrawer({ harness, onClose }: Props) {
  const [prepared, setPrepared] = useState<Prepared | null>(null)
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    let alive = true
    api
      .prepareHarness(harness.id)
      .then((p) => alive && setPrepared(p))
      .catch((e) => alive && setError(e instanceof Error ? e.message : 'Falha ao preparar'))
    return () => {
      alive = false
    }
  }, [harness.id])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const copy = async () => {
    if (!prepared) return
    try {
      await navigator.clipboard.writeText(prepared.command)
    } catch {
      // Plano B para navegadores que recusam a API de área de transferência.
      const area = document.createElement('textarea')
      area.value = prepared.command
      area.style.position = 'fixed'
      area.style.opacity = '0'
      document.body.appendChild(area)
      area.select()
      const done = document.execCommand('copy')
      area.remove()
      if (!done) return setError('Não consegui copiar automaticamente: selecione o comando e copie')
    }
    setError('')
    setCopied(true)
    window.setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <aside className="drawer wide" role="dialog" aria-label={`Lançar ${harness.name}`}>
        <header className="drawer-head">
          <div>
            <h2>Lançar “{harness.name}”</h2>
            <p className="path">Cole o comando no terminal. O Orbita não executa nada.</p>
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="Fechar">
            <CloseIcon />
          </button>
        </header>

        <div className="drawer-body">
          {error && <p className="notice warn">{error}</p>}
          {!prepared && !error && <p className="hint-text">Preparando os arquivos…</p>}
          {prepared && (
            <>
              <div className="field">
                <label>Comando</label>
                <pre className="body-view command">{prepared.command}</pre>
                <button className="btn primary" onClick={() => void copy()}>
                  <CopyIcon /> {copied ? 'Copiado!' : 'Copiar comando'}
                </button>
              </div>

              {prepared.warnings.map((w) => (
                <p key={w} className="notice warn">
                  {w}
                </p>
              ))}

              <div className="field">
                <label>Arquivos gerados</label>
                {prepared.files.length === 0 ? (
                  <p className="hint-text">Nenhum: este harness só usa flags simples.</p>
                ) : (
                  <ul className="kv files">
                    {prepared.files.map((f) => (
                      <li key={f.path}>
                        <code>{f.path}</code>
                        <span>{f.purpose}</span>
                      </li>
                    ))}
                  </ul>
                )}
                <p className="hint-text">Fica tudo em {prepared.dir}. Seus arquivos em ~/.claude e nos projetos não são alterados.</p>
              </div>
            </>
          )}
        </div>
      </aside>
    </div>
  )
}
