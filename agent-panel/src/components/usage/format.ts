const compact = new Intl.NumberFormat('pt-BR', { notation: 'compact', maximumFractionDigits: 1 })
const full = new Intl.NumberFormat('pt-BR')
const money = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'USD' })

export const fmtTokens = (n: number) => (n < 1000 ? full.format(n) : compact.format(n))
export const fmtFull = (n: number) => full.format(n)
export const fmtCost = (n: number) => money.format(n)

export const fmtDuration = (ms: number) => {
  if (!ms) return '—'
  const minutes = Math.round(ms / 60_000)
  if (minutes < 1) return '< 1 min'
  if (minutes < 60) return `${minutes} min`
  return `${Math.floor(minutes / 60)} h ${String(minutes % 60).padStart(2, '0')} min`
}

export const fmtDate = (iso: string) => new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
export const fmtDay = (day: string) => `${day.slice(8, 10)}/${day.slice(5, 7)}`

/** Nome curto do modelo: `claude-opus-5-5[1m]` -> `opus 5.5 (1m)`. */
export const modelName = (id: string) => {
  const m = /^claude-([a-z]+)-(\d+(?:-\d+)?)(?:-\d{8})?(\[.+\])?$/.exec(id)
  if (!m) return id
  return `${m[1]} ${m[2]!.replace('-', '.')}${m[3] ? ` ${m[3]}` : ''}`
}
