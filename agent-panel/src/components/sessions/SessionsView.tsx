import { useCallback, useEffect, useMemo, useState } from 'react'
import type { LiveSession, SessionsResponse } from '../../../shared/sessions'
import { api } from '../../api'
import { fmtCost, fmtTokens } from '../usage/format'
import { LiveSessionDrawer } from './LiveSessionDrawer'
import { relative, stateInfo } from './state'

const POLL_MS = 5000

type Filter = 'all' | 'active' | 'finished'

export function SessionsView() {
  const [data, setData] = useState<SessionsResponse | null>(null)
  const [filter, setFilter] = useState<Filter>('all')
  const [open, setOpen] = useState<LiveSession | null>(null)
  const [now, setNow] = useState(Date.now())

  const load = useCallback(async () => {
    try {
      setData(await api.getSessions())
      setNow(Date.now())
    } catch (e) {
      setData({ generatedAt: new Date().toISOString(), sessions: [], error: e instanceof Error ? e.message : 'Falha ao ler as sessões' })
    }
  }, [])

  // Atualiza a cada 5 s enquanto a aba está visível.
  useEffect(() => {
    void load()
    const timer = window.setInterval(() => {
      if (!document.hidden) void load()
    }, POLL_MS)
    return () => window.clearInterval(timer)
  }, [load])

  const visible = useMemo(
    () => (data?.sessions ?? []).filter((s) => (filter === 'all' ? true : filter === 'active' ? s.active : !s.active)),
    [data, filter],
  )

  if (!data) return <div className="empty">Lendo as sessões…</div>
  const activeCount = data.sessions.filter((s) => s.active).length

  return (
    <section className="inventory">
      <div className="inv-filters">
        <div className="segmented" role="group" aria-label="Filtro">
          {(
            [
              ['all', 'Todas'],
              ['active', 'Ativas'],
              ['finished', 'Encerradas'],
            ] as const
          ).map(([value, label]) => (
            <button key={value} className={filter === value ? 'active' : ''} onClick={() => setFilter(value)}>
              {label}
            </button>
          ))}
        </div>
        <span className="inv-count">
          {activeCount} ativa{activeCount === 1 ? '' : 's'} · {data.sessions.length} no total · atualiza a cada 5 s
        </span>
      </div>

      {data.error && <p className="notice warn">{data.error}</p>}

      {!data.error && visible.length === 0 ? (
        <div className="empty">
          <p>{data.sessions.length === 0 ? 'Nenhuma sessão do Claude Code em andamento ou em segundo plano.' : 'Nenhuma sessão neste filtro.'}</p>
        </div>
      ) : (
        <ul className="inv-list">
          {visible.map((s) => {
            const info = stateInfo(s.state)
            const u = s.usage
            return (
              <li key={s.sessionId}>
                <button className={`inv-row ${s.active ? '' : 'off'}`} onClick={() => setOpen(s)}>
                  <span className={`state-dot ${info.tone}`} aria-hidden />
                  <span className="inv-main">
                    <span className="inv-name">{s.name}</span>
                    <span className="inv-desc">
                      {s.project} · iniciada {relative(s.startedAt, now)}
                      {u ? ` · ${u.messages} respostas · ${u.tokenSource === 'transcript' ? '~' : ''}${fmtTokens(u.input + u.output)} tokens` : ''}
                    </span>
                  </span>
                  <span className="inv-badges">
                    <span className="badge scope-badge">{s.kind === 'background' ? 'segundo plano' : 'interativa'}</span>
                    {u?.costUSD != null && <span className="badge">{fmtCost(u.costUSD)}</span>}
                    <span className={`badge state ${info.tone}`} title={info.hint}>
                      {info.label}
                    </span>
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      )}

      {open && <LiveSessionDrawer session={open} onClose={() => setOpen(null)} />}
    </section>
  )
}
