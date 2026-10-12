import { useEffect, useState } from 'react'
import type { Agent, AgentInput } from '../../shared/types'
import { AGENT_COLORS, KNOWN_TOOLS, MODELS } from '../constants'
import { Robot, modelScale } from './Robot'
import type { ScopeOption } from './AgentDrawer'

interface Props {
  scopes: ScopeOption[]
  defaultScope: string
  onBuild: (input: AgentInput) => Promise<boolean>
  onClose: () => void
}

const slug = (text: string) =>
  text
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/^-+/, '')

export function Bench({ scopes, defaultScope, onBuild, onClose }: Props) {
  const [form, setForm] = useState<AgentInput>({
    scopeId: defaultScope,
    name: '',
    description: '',
    tools: ['Read', 'Grep'],
    model: 'sonnet',
    color: 'cyan',
    prompt: '',
  })
  const [building, setBuilding] = useState(false)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const patch = (change: Partial<AgentInput>) => setForm((f) => ({ ...f, ...change }))
  const toggleTool = (tool: string) =>
    patch({ tools: form.tools.includes(tool) ? form.tools.filter((t) => t !== tool) : [...form.tools, tool] })

  const ready = form.name.length > 0 && form.description.trim().length > 0
  const preview: Agent = {
    id: 'preview',
    name: form.name || 'novo-robô',
    description: form.description,
    tools: form.tools,
    model: form.model,
    color: form.color,
    prompt: '',
    enabled: true,
    scopeId: form.scopeId,
    scopeLabel: '',
    path: '',
    updatedAt: '',
  }

  const build = async () => {
    if (!ready || building) return
    setBuilding(true)
    const prompt = form.prompt.trim() || `Você é ${form.name}. ${form.description.trim()}`
    const ok = await onBuild({ ...form, description: form.description.trim(), prompt })
    setBuilding(false)
    if (ok) onClose()
  }

  return (
    <aside className="bench" role="dialog" aria-label="Bancada de montagem">
      <header>
        <strong>Bancada de montagem</strong>
        <button className="bench-close" onClick={onClose} aria-label="Fechar">
          ×
        </button>
      </header>

      <svg viewBox="-44 -92 88 112" className="bench-preview" aria-hidden="true">
        <ellipse cx="0" cy="4" rx="34" ry="10" className="bench-pad" />
        <g transform={`scale(${modelScale(form.model)})`}>
          <g className="bob">
            <Robot agent={preview} />
          </g>
        </g>
      </svg>
      <p className="bench-name">{preview.name}</p>

      <label className="bench-field">
        Nome
        <input value={form.name} onChange={(e) => patch({ name: slug(e.target.value) })} placeholder="ex.: revisor-de-sql" autoFocus />
      </label>
      <label className="bench-field">
        Missão
        <input value={form.description} onChange={(e) => patch({ description: e.target.value })} placeholder="Quando este robô deve ser chamado" />
      </label>

      <div className="bench-field">
        Cor
        <div className="bench-swatches">
          {Object.entries(AGENT_COLORS).map(([name, hex]) => (
            <button
              key={name}
              type="button"
              className={form.color === name ? 'on' : ''}
              style={{ background: hex }}
              onClick={() => patch({ color: name })}
              aria-label={name}
            />
          ))}
        </div>
      </div>

      <div className="bench-field">
        Modelo (tamanho)
        <div className="segmented">
          {MODELS.map((m) => (
            <button key={m.value} type="button" className={form.model === m.value ? 'active' : ''} onClick={() => patch({ model: m.value })}>
              {m.label}
            </button>
          ))}
        </div>
      </div>

      <div className="bench-field">
        Ferramentas (acessórios)
        <div className="chips selectable">
          {KNOWN_TOOLS.map((tool) => (
            <button key={tool} type="button" className={`chip ${form.tools.includes(tool) ? 'on' : ''}`} onClick={() => toggleTool(tool)}>
              {tool}
            </button>
          ))}
        </div>
      </div>

      <label className="bench-field">
        Escopo
        <select value={form.scopeId} onChange={(e) => patch({ scopeId: e.target.value })}>
          {scopes.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
        </select>
      </label>

      <label className="bench-field">
        Instruções (opcional)
        <textarea rows={3} value={form.prompt} onChange={(e) => patch({ prompt: e.target.value })} placeholder="Se vazio, uso a missão como instrução inicial." />
      </label>

      <button className="btn primary" disabled={!ready || building} onClick={build}>
        {building ? 'Montando…' : 'Montar robô'}
      </button>
    </aside>
  )
}
