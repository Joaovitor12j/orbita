import { useEffect, useState } from 'react'
import type { GroupUsage, SessionUsage, UsageReport } from '../../../shared/usage'
import { api } from '../../api'
import { BarChart, type Metric } from './BarChart'
import { fmtCost, fmtDate, fmtFull, fmtTokens, modelName } from './format'
import { SessionDrawer } from './SessionDrawer'

interface Props {
  /** Pasta do projeto selecionado na barra lateral; vazio = todos. */
  projectPath?: string
  scopeLabel: string
}

const RANGES = [
  { days: 7, label: '7 dias' },
  { days: 30, label: '30 dias' },
  { days: 90, label: '90 dias' },
  { days: 0, label: 'Tudo' },
]
const SESSIONS_SHOWN = 25

function GroupTable({ title, rows, name }: { title: string; rows: GroupUsage[]; name?: (g: GroupUsage) => string }) {
  if (rows.length === 0) return null
  return (
    <div className="usage-card">
      <h3>{title}</h3>
      <table className="usage-table">
        <thead>
          <tr>
            <th />
            <th>Sessões</th>
            <th>Entrada + saída</th>
            <th>Cache</th>
            <th>Custo</th>
          </tr>
        </thead>
        <tbody>
          {rows.slice(0, 8).map((g) => (
            <tr key={g.key}>
              <td className="wrap">{name ? name(g) : g.label}</td>
              <td>{fmtFull(g.sessions)}</td>
              <td title={`${fmtFull(g.input)} entrada · ${fmtFull(g.output)} saída`}>{fmtTokens(g.input + g.output)}</td>
              <td title={`${fmtFull(g.cacheRead)} lido · ${fmtFull(g.cacheWrite)} escrito`}>{fmtTokens(g.cacheRead + g.cacheWrite)}</td>
              <td>{g.withCost > 0 ? `${fmtCost(g.costUSD)}${g.withCost < g.sessions ? '*' : ''}` : '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function UsageView({ projectPath, scopeLabel }: Props) {
  const [days, setDays] = useState(30)
  const [metric, setMetric] = useState<Metric>('tokens')
  const [report, setReport] = useState<UsageReport | null>(null)
  const [error, setError] = useState('')
  const [open, setOpen] = useState<SessionUsage | null>(null)
  const [shown, setShown] = useState(SESSIONS_SHOWN)

  useEffect(() => {
    let alive = true
    setError('')
    api
      .getUsage(days, projectPath)
      .then((r) => alive && setReport(r))
      .catch((e) => alive && setError(e instanceof Error ? e.message : 'Falha ao ler o uso'))
    return () => {
      alive = false
    }
  }, [days, projectPath])

  if (error) return <div className="empty">{error}</div>
  if (!report) return <div className="empty">Lendo os transcripts…</div>

  const t = report.totals
  return (
    <section className="usage">
      <div className="inv-filters">
        <div className="segmented" role="group" aria-label="Período">
          {RANGES.map((r) => (
            <button key={r.days} className={days === r.days ? 'active' : ''} onClick={() => setDays(r.days)}>
              {r.label}
            </button>
          ))}
        </div>
        <span className="inv-count">
          {scopeLabel} · {fmtFull(t.sessions)} sessões com atividade
          {report.emptySessions > 0 ? ` (${fmtFull(report.emptySessions)} vazias ocultas)` : ''}
        </span>
      </div>

      <dl className="metrics big">
        <div>
          <dt>Custo registrado</dt>
          <dd>{t.withCost > 0 ? fmtCost(t.costUSD) : '—'}</dd>
          <small>
            em {fmtFull(t.withCost)} de {fmtFull(t.sessions)} sessões
          </small>
        </div>
        <div>
          <dt>Entrada + saída</dt>
          <dd>{fmtTokens(t.input + t.output)}</dd>
          <small>
            {fmtTokens(t.input)} entrada · {fmtTokens(t.output)} saída
          </small>
        </div>
        <div>
          <dt>Cache</dt>
          <dd>{fmtTokens(t.cacheRead + t.cacheWrite)}</dd>
          <small>
            {fmtTokens(t.cacheRead)} lido · {fmtTokens(t.cacheWrite)} escrito
          </small>
        </div>
        <div>
          <dt>Linhas alteradas</dt>
          <dd>
            +{fmtTokens(t.linesAdded)} / −{fmtTokens(t.linesRemoved)}
          </dd>
          <small>{fmtFull(t.messages)} respostas do modelo</small>
        </div>
      </dl>

      <div className="usage-card">
        <div className="usage-card-head">
          <h3>Por dia</h3>
          <div className="segmented" role="group" aria-label="Métrica">
            <button className={metric === 'tokens' ? 'active' : ''} onClick={() => setMetric('tokens')}>
              Tokens
            </button>
            <button className={metric === 'cost' ? 'active' : ''} onClick={() => setMetric('cost')}>
              Custo
            </button>
          </div>
        </div>
        <BarChart days={report.daily} metric={metric} />
        {metric === 'cost' && <p className="hint-text">O custo de cada sessão entra no dia em que ela terminou.</p>}
      </div>

      <div className="usage-grid">
        <GroupTable title="Projetos" rows={report.projects} />
        <GroupTable title="Modelos" rows={report.models} name={(g) => modelName(g.label)} />
        <GroupTable title="Subagentes" rows={report.agents} />
      </div>
      <p className="hint-text">
        Custo e tokens vêm do registro que o próprio Claude Code grava ao encerrar a sessão ({fmtFull(t.registered)} de {fmtFull(t.sessions)} sessões; ele só existe em
        sessões recentes). Nas demais, os tokens são a soma das mensagens gravadas no transcript (marcadas com ~), que costuma ficar abaixo do real, e não há custo:
        o Orbita não estima preços. * indica custo parcial. O cache fica fora de “entrada + saída” porque domina a contagem.
      </p>

      <div className="usage-card">
        <h3>Sessões recentes</h3>
        <ul className="inv-list">
          {report.sessions.slice(0, shown).map((s) => (
            <li key={s.id}>
              <button className="inv-row" onClick={() => setOpen(s)}>
                <span className="inv-main">
                  <span className="inv-name">{s.title || 'Sessão sem título'}</span>
                  <span className="inv-desc">
                    {s.project} · {fmtDate(s.endedAt)} · {fmtFull(s.messages)} respostas · {s.tokenSource === 'transcript' ? '~' : ''}{fmtTokens(s.input + s.output)} tokens
                  </span>
                </span>
                <span className="inv-badges">
                  {s.subagents.length > 0 && <span className="badge scope-badge">{s.subagents.length} subagentes</span>}
                  <span className={`badge ${s.costUSD === null ? 'scope-badge' : ''}`}>{s.costUSD === null ? 'sem custo' : fmtCost(s.costUSD)}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
        {report.sessions.length > shown && (
          <button className="btn ghost" onClick={() => setShown((n) => n + SESSIONS_SHOWN)}>
            Mostrar mais
          </button>
        )}
      </div>

      {open && <SessionDrawer session={open} onClose={() => setOpen(null)} />}
    </section>
  )
}
