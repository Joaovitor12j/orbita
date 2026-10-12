import { fmtCost, fmtDay, fmtTokens } from './format'
import type { DayUsage } from '../../../shared/usage'

export type Metric = 'tokens' | 'cost'

interface Props {
  days: DayUsage[]
  metric: Metric
}

const W = 640
const H = 150
const PAD = { top: 10, bottom: 22, left: 4, right: 4 }

const value = (d: DayUsage, metric: Metric) => (metric === 'tokens' ? d.input + d.output : d.costUSD)

// Preenche os dias sem uso entre o primeiro e o último, para a escala de tempo ficar honesta.
function fill(days: DayUsage[]): DayUsage[] {
  if (days.length < 2) return days
  const byDay = new Map(days.map((d) => [d.day, d]))
  const out: DayUsage[] = []
  const end = new Date(`${days.at(-1)!.day}T12:00:00`)
  for (const cursor = new Date(`${days[0]!.day}T12:00:00`); cursor <= end; cursor.setDate(cursor.getDate() + 1)) {
    const key = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}-${String(cursor.getDate()).padStart(2, '0')}`
    out.push(byDay.get(key) ?? { day: key, input: 0, output: 0, cacheRead: 0, cacheWrite: 0, costUSD: 0, sessions: 0 })
  }
  return out
}

export function BarChart({ days, metric }: Props) {
  const data = fill(days)
  if (data.length === 0) return <p className="hint-text">Sem uso no período.</p>
  const max = Math.max(...data.map((d) => value(d, metric)), 1)
  const inner = W - PAD.left - PAD.right
  const step = inner / data.length
  const bar = Math.max(2, step * 0.7)
  const fmt = metric === 'tokens' ? fmtTokens : fmtCost
  const labelEvery = Math.ceil(data.length / 8)

  return (
    <svg className="usage-chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={metric === 'tokens' ? 'Tokens por dia' : 'Custo por dia'}>
      <line x1={PAD.left} x2={W - PAD.right} y1={H - PAD.bottom} y2={H - PAD.bottom} className="axis" />
      {data.map((d, i) => {
        const v = value(d, metric)
        const h = (v / max) * (H - PAD.top - PAD.bottom)
        const x = PAD.left + i * step + (step - bar) / 2
        return (
          <g key={d.day}>
            <rect x={x} y={H - PAD.bottom - h} width={bar} height={Math.max(h, v > 0 ? 1 : 0)} rx={2} className="bar">
              <title>{`${fmtDay(d.day)}: ${fmt(v)}`}</title>
            </rect>
            {i % labelEvery === 0 && (
              <text x={x + bar / 2} y={H - 6} textAnchor="middle" className="tick">
                {fmtDay(d.day)}
              </text>
            )}
          </g>
        )
      })}
      <text x={W - PAD.right} y={PAD.top} textAnchor="end" className="tick">
        máx. {fmt(max)}
      </text>
    </svg>
  )
}
