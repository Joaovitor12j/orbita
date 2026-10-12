import type { Agent } from '../../shared/types'
import { colorOf } from '../constants'

export const modelScale = (model: string) => (model === 'haiku' ? 0.78 : model === 'opus' ? 1.3 : model === 'sonnet' ? 1 : 0.92)

export function Robot({ agent }: { agent: Agent }) {
  const color = colorOf(agent.color)
  const eye = agent.enabled ? color : '#475569'
  const has = (...names: string[]) => agent.tools.some((t) => names.includes(t))
  return (
    <g className={agent.scopeId === 'visitor' ? 'robot-visitor' : agent.enabled ? '' : 'robot-off'}>
      <ellipse cx="0" cy="2" rx="17" ry="6" fill="#000" opacity=".35" />
      <rect x="-9" y="-13" width="6" height="13" rx="2" fill="#94a3b8" />
      <rect x="3" y="-13" width="6" height="13" rx="2" fill="#94a3b8" />
      <rect x="-19.5" y="-37" width="5.5" height="17" rx="2.7" fill="#cbd5e1" />
      <rect x="14" y="-37" width="5.5" height="17" rx="2.7" fill="#cbd5e1" />
      <rect x="-14" y="-39" width="28" height="29" rx="7" fill={agent.enabled ? color : '#64748b'} />
      <rect x="-14" y="-24" width="28" height="14" rx="6" fill="#000" opacity=".16" />
      <rect x="-7" y="-33" width="14" height="9" rx="2.5" fill="#0b1020" opacity=".55" />
      <circle cx="0" cy="-28.5" r="2.2" fill={eye} className={agent.enabled ? 'blink' : ''} />
      <line x1="0" y1="-60" x2="0" y2="-67" stroke="#94a3b8" strokeWidth="1.6" />
      <circle cx="0" cy="-69" r="2.8" fill={eye} className={agent.enabled ? 'blink' : ''} />
      <rect x="-12.5" y="-61" width="25" height="21" rx="7.5" fill="#e2e8f0" />
      <rect x="-9.5" y="-57" width="19" height="12" rx="4.5" fill="#0b1020" />
      <circle cx="-4.2" cy="-51" r="2.4" fill={eye} />
      <circle cx="4.2" cy="-51" r="2.4" fill={eye} />
      {has('Bash') && (
        <path d="M16 -21 h6 l2.5 -4.5 M16 -17 h6 l2.5 4.5" fill="none" stroke="#f1f5f9" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
      )}
      {has('Read', 'Grep', 'Glob') && (
        <g fill="none" stroke="#f8fafc" strokeWidth="1.8" strokeLinecap="round">
          <circle cx="-18" cy="-52" r="5.2" fill="#38bdf8" fillOpacity=".25" />
          <line x1="-21.7" y1="-48.3" x2="-25.5" y2="-44.5" />
        </g>
      )}
      {has('Edit', 'Write', 'NotebookEdit', 'TodoWrite') && (
        <line x1="-17" y1="-20" x2="-23" y2="-32" stroke="#facc15" strokeWidth="2.6" strokeLinecap="round" />
      )}
      {has('WebFetch', 'WebSearch') && (
        <g fill="none" stroke="#f8fafc" strokeWidth="1.5">
          <ellipse cx="8" cy="-67" rx="6" ry="2.4" />
          <line x1="8" y1="-67" x2="8" y2="-62" />
        </g>
      )}
      {!agent.enabled && (
        <text x="14" y="-70" className="zzz">
          z
        </text>
      )}
    </g>
  )
}
