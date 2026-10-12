import { SEATS, bubbleText } from './layout'
import { colorOf, modelLabel } from '../../constants'
import type { Activity, Agent } from '../../../shared/types'

const since = (iso: string) => {
  const seconds = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 1000))
  return seconds < 60 ? `${seconds}s` : `${Math.round(seconds / 60)} min`
}

interface Props {
  hover?: Agent
  hoverActivity?: Activity
  feed: Activity[]
  canFocus: (act: Activity) => boolean
  onFocus: (act: Activity) => void
}

/** Painel inferior do salão: detalhes do robô sob o cursor, ou o feed de atividade ao vivo. */
export function HallInfo({ hover, hoverActivity, feed, canFocus, onFocus }: Props) {
  return (
    <div className="hall-info">
      {hover ? (
        <>
          <strong>{hover.name}</strong>
          <span className="hall-chip" style={{ borderColor: colorOf(hover.color) }}>
            {modelLabel(hover.model)}
          </span>
          <span className="hall-chip">{hover.scopeLabel}</span>
          <span className="hall-chip">{hoverActivity ? 'Trabalhando' : hover.enabled ? 'Ativo' : 'Desligado'}</span>
          <p>
            {hoverActivity
              ? `${hoverActivity.description || 'Tarefa sem descrição'} · ${hoverActivity.project} · ${bubbleText(hoverActivity)}`
              : hover.description || 'Sem descrição.'}
          </p>
        </>
      ) : feed.length > 0 ? (
        <ul className="feed">
          {feed.map((act) => (
            <li key={act.agentId}>
              <button type="button" className="feed-row" disabled={!canFocus(act)} onClick={() => onFocus(act)} title="Centralizar no robô">
                <span className={`dot ${act.status}`} />
                <strong>{act.agentType}</strong>
                <span>{act.description}</span>
                <span className="feed-meta">
                  {act.project} · {act.status === 'working' ? bubbleText(act) : `concluído há ${since(act.updatedAt)}`}
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="hall-hint">
          Arraste um robô até uma das {SEATS} cadeiras do Conselho. Clique para abrir, botão direito para ligar ou desligar.
          Subagentes em execução no Claude Code aparecem aqui ao vivo.
        </p>
      )}
    </div>
  )
}
