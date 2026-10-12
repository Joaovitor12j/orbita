import { useEffect, useState } from 'react'
import type { LiveSession, TailEntry } from '../../../shared/sessions'
import { api } from '../../api'
import { copyText } from '../clipboard'
import { CloseIcon, CopyIcon } from '../Icons'
import { fmtCost, fmtDate, fmtFull, fmtTokens } from '../usage/format'
import { relative, stateInfo } from './state'

interface Props {
  session: LiveSession
  onClose: () => void
}

export function LiveSessionDrawer({ session: s, onClose }: Props) {
  const [tail, setTail] = useState<TailEntry[] | null>(null)
  const [tailError, setTailError] = useState('')
  const [logs, setLogs] = useState<{ text?: string; error?: string } | null>(null)
  const [loadingLogs, setLoadingLogs] = useState(false)
  const [copied, setCopied] = useState('')
  const info = stateInfo(s.state)

  useEffect(() => {
    let alive = true
    api
      .getSessionTail(s.sessionId)
      .then((t) => alive && setTail(t))
      .catch((e) => alive && setTailError(e instanceof Error ? e.message : 'Falha ao ler o transcript'))
    return () => {
      alive = false
    }
  }, [s.sessionId])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const loadLogs = async () => {
    if (!s.id) return
    setLoadingLogs(true)
    setLogs(await api.getSessionLogs(s.id).catch((e) => ({ error: e instanceof Error ? e.message : 'Falha ao ler os logs' })))
    setLoadingLogs(false)
  }

  const copy = async (command: string) => {
    if (await copyText(command)) {
      setCopied(command)
      window.setTimeout(() => setCopied(''), 1800)
    }
  }

  const commands = s.id ? [`claude attach ${s.id}`, `claude logs ${s.id}`, `claude stop ${s.id}`] : []
  const u = s.usage

  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <aside className="drawer wide" role="dialog" aria-label="Detalhes da sessão">
        <header className="drawer-head">
          <div>
            <h2>{s.name}</h2>
            <p className="path">{s.cwd}</p>
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="Fechar">
            <CloseIcon />
          </button>
        </header>

        <div className="drawer-body">
          <div className="chips">
            <span className={`badge state ${info.tone}`} title={info.hint}>
              {info.label}
            </span>
            <span className="badge scope-badge">{s.kind === 'background' ? 'segundo plano' : 'interativa'}</span>
            <span className="badge scope-badge">iniciada {relative(s.startedAt)}</span>
            {s.pid && <span className="badge scope-badge">pid {s.pid}</span>}
          </div>

          <dl className="metrics">
            <div>
              <dt>Custo registrado</dt>
              <dd>{u?.costUSD != null ? fmtCost(u.costUSD) : '—'}</dd>
            </div>
            <div>
              <dt>Respostas</dt>
              <dd>{u ? fmtFull(u.messages) : '—'}</dd>
            </div>
            <div>
              <dt>Entrada + saída</dt>
              <dd>{u ? `${u.tokenSource === 'transcript' ? '~' : ''}${fmtTokens(u.input + u.output)}` : '—'}</dd>
            </div>
            <div>
              <dt>Início</dt>
              <dd className="small">{fmtDate(new Date(s.startedAt).toISOString())}</dd>
            </div>
          </dl>
          {s.active && u?.costUSD == null && <p className="hint-text">O Claude Code grava o custo ao encerrar a sessão, então ele aparece aqui depois.</p>}

          <div className="field">
            <label>Atividade recente</label>
            {tailError && <p className="notice warn">{tailError}</p>}
            {!tail && !tailError && <p className="hint-text">Lendo o transcript…</p>}
            {tail && tail.length === 0 && <p className="hint-text">Sem mensagens para mostrar.</p>}
            {tail && tail.length > 0 && (
              <ul className="tail">
                {tail.map((e, i) => (
                  <li key={`${e.at}-${i}`} className={e.role}>
                    <span className="who">{e.role === 'user' ? 'você' : 'claude'}</span>
                    <span className="what">
                      {e.tools.map((t) => (
                        <span key={t} className="chip">
                          {t}
                        </span>
                      ))}
                      {e.text}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {s.kind === 'background' && s.id && (
            <>
              <div className="field">
                <label>Saída do terminal</label>
                {!logs && (
                  <button className="btn ghost" disabled={loadingLogs} onClick={() => void loadLogs()}>
                    {loadingLogs ? 'Lendo…' : 'Ver saída do terminal'}
                  </button>
                )}
                {logs?.error && <p className="notice warn">{logs.error}</p>}
                {logs?.text !== undefined && <pre className="body-view">{logs.text || '(vazio)'}</pre>}
              </div>

              <div className="field">
                <label>Comandos (copie e rode no terminal)</label>
                <ul className="cmd-list">
                  {commands.map((c) => (
                    <li key={c}>
                      <code>{c}</code>
                      <button className="btn ghost" onClick={() => void copy(c)} aria-label={`Copiar ${c}`}>
                        <CopyIcon /> {copied === c ? 'Copiado' : 'Copiar'}
                      </button>
                    </li>
                  ))}
                </ul>
                <p className="hint-text">O Orbita não inicia nem para sessões nesta versão: o monitor é somente leitura.</p>
              </div>
            </>
          )}
        </div>
      </aside>
    </div>
  )
}
