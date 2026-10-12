import { useEffect } from 'react'
import type { SessionUsage } from '../../../shared/usage'
import { CloseIcon } from '../Icons'
import { fmtCost, fmtDate, fmtDuration, fmtFull, modelName } from './format'

interface Props {
  session: SessionUsage
  onClose: () => void
}

export function SessionDrawer({ session: s, onClose }: Props) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <aside className="drawer wide" role="dialog" aria-label="Detalhes da sessão">
        <header className="drawer-head">
          <div>
            <h2>{s.title || 'Sessão sem título'}</h2>
            <p className="path">{s.file}</p>
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="Fechar">
            <CloseIcon />
          </button>
        </header>
        <div className="drawer-body">
          <div className="chips">
            <span className="badge scope-badge">{s.project}</span>
            {s.entrypoint && <span className="badge scope-badge">{s.entrypoint}</span>}
            <span className="badge scope-badge">
              {fmtDate(s.startedAt)} → {fmtDate(s.endedAt)}
            </span>
          </div>

          <dl className="metrics">
            <div>
              <dt>Custo registrado</dt>
              <dd>{s.costUSD === null ? '—' : fmtCost(s.costUSD)}</dd>
            </div>
            <div>
              <dt>Respostas do modelo</dt>
              <dd>{fmtFull(s.messages)}</dd>
            </div>
            <div>
              <dt>Duração</dt>
              <dd>{fmtDuration(s.durationMs)}</dd>
            </div>
            <div>
              <dt>Linhas</dt>
              <dd>
                +{fmtFull(s.linesAdded)} / −{fmtFull(s.linesRemoved)}
              </dd>
            </div>
          </dl>
          {s.tokenSource === 'transcript' && (
            <p className="notice warn">Tokens aproximados: somados das mensagens do transcript, pois o Claude Code ainda não registrou o uso desta sessão. Tendem a ficar abaixo do real.</p>
          )}
          {s.costUSD === null && (
            <p className="notice warn">Sem custo registrado: o Claude Code grava o custo ao encerrar a sessão (esta pode estar em andamento) e só o faz em sessões recentes.</p>
          )}

          <div className="field">
            <label>Tokens por modelo</label>
            <table className="usage-table">
              <thead>
                <tr>
                  <th>Modelo</th>
                  <th>Respostas</th>
                  <th>Entrada</th>
                  <th>Saída</th>
                  <th>Cache lido</th>
                  <th>Cache escrito</th>
                </tr>
              </thead>
              <tbody>
                {s.models.map((m) => (
                  <tr key={m.model}>
                    <td>{modelName(m.model)}</td>
                    <td>{fmtFull(m.messages)}</td>
                    <td>{fmtFull(m.input)}</td>
                    <td>{fmtFull(m.output)}</td>
                    <td>{fmtFull(m.cacheRead)}</td>
                    <td>{fmtFull(m.cacheWrite)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {s.subagents.length > 0 && (
            <div className="field">
              <label>Subagentes ({s.subagents.length})</label>
              <table className="usage-table">
                <thead>
                  <tr>
                    <th>Tipo</th>
                    <th>Tarefa</th>
                    <th>Respostas</th>
                    <th>Entrada + saída</th>
                  </tr>
                </thead>
                <tbody>
                  {s.subagents.map((a) => (
                    <tr key={a.agentId}>
                      <td>{a.type}</td>
                      <td className="wrap">{a.description || '—'}</td>
                      <td>{fmtFull(a.messages)}</td>
                      <td>{fmtFull(a.input + a.output)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="hint-text">Tokens somados do transcript de cada subagente (aproximação). O custo deles já está dentro do custo da sessão.</p>
            </div>
          )}
        </div>
      </aside>
    </div>
  )
}
