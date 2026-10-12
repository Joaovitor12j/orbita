import type { Agent } from '../../shared/types'
import { colorOf, modelLabel } from '../constants'

interface Props {
  agent: Agent
  showScope: boolean
  onOpen: (agent: Agent) => void
  onToggle: (agent: Agent) => void
}

export function AgentCard({ agent, showScope, onOpen, onToggle }: Props) {
  const color = colorOf(agent.color)
  const visibleTools = agent.tools.slice(0, 4)
  const hidden = agent.tools.length - visibleTools.length

  return (
    <article
      className={`card ${agent.enabled ? '' : 'disabled'}`}
      style={{ ['--agent' as string]: color }}
      onClick={() => onOpen(agent)}
      tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && onOpen(agent)}
    >
      <header className="card-head">
        <span className="dot" />
        <h3>{agent.name}</h3>
        <button
          className={`switch ${agent.enabled ? 'on' : ''}`}
          role="switch"
          aria-checked={agent.enabled}
          aria-label={agent.enabled ? 'Desativar agente' : 'Ativar agente'}
          onClick={(e) => {
            e.stopPropagation()
            onToggle(agent)
          }}
        >
          <span />
        </button>
      </header>

      <p className="card-desc">{agent.description || 'Sem descrição'}</p>

      <div className="chips">
        {agent.tools.length === 0 && <span className="chip muted">todas as ferramentas</span>}
        {visibleTools.map((tool) => (
          <span key={tool} className="chip">
            {tool}
          </span>
        ))}
        {hidden > 0 && <span className="chip muted">+{hidden}</span>}
      </div>

      <footer className="card-foot">
        <span className="badge">{modelLabel(agent.model)}</span>
        {showScope && <span className="badge scope-badge">{agent.scopeLabel}</span>}
        {!agent.enabled && <span className="badge off">desativado</span>}
      </footer>
    </article>
  )
}
