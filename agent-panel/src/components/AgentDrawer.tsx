import { useEffect, useMemo, useState, type KeyboardEvent } from 'react'
import type { Agent, AgentInput } from '../../shared/types'
import { AGENT_COLORS, KNOWN_TOOLS, MODELS } from '../constants'
import { CloseIcon, CopyIcon, TrashIcon } from './Icons'

export interface ScopeOption {
  id: string
  label: string
}

interface Props {
  agent: Agent | null
  scopes: ScopeOption[]
  defaultScope: string
  onSave: (input: AgentInput, id?: string) => Promise<void>
  onDelete: (agent: Agent) => Promise<void>
  onCopy: (agent: Agent, scopeId: string) => Promise<void>
  onClose: () => void
}

const emptyForm = (scopeId: string): AgentInput => ({
  scopeId,
  name: '',
  description: '',
  tools: [],
  model: '',
  color: '',
  prompt: '',
})

const fromAgent = (agent: Agent): AgentInput => ({
  scopeId: agent.scopeId,
  name: agent.name,
  description: agent.description,
  tools: agent.tools,
  model: agent.model,
  color: agent.color,
  prompt: agent.prompt,
})

export function AgentDrawer({ agent, scopes, defaultScope, onSave, onDelete, onCopy, onClose }: Props) {
  const [form, setForm] = useState<AgentInput>(() => (agent ? fromAgent(agent) : emptyForm(defaultScope)))
  const [customTool, setCustomTool] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [copyTarget, setCopyTarget] = useState('')
  const [saving, setSaving] = useState(false)

  const patch = (changes: Partial<AgentInput>) => setForm((current) => ({ ...current, ...changes }))

  const toolOptions = useMemo(() => {
    const extras = form.tools.filter((tool) => !KNOWN_TOOLS.includes(tool))
    return [...KNOWN_TOOLS, ...extras]
  }, [form.tools])

  const copyOptions = scopes.filter((scope) => scope.id !== agent?.scopeId)
  const dirty = !agent || JSON.stringify(form) !== JSON.stringify(fromAgent(agent))

  const toggleTool = (tool: string) =>
    patch({ tools: form.tools.includes(tool) ? form.tools.filter((t) => t !== tool) : [...form.tools, tool] })

  const addCustomTool = () => {
    const value = customTool.trim()
    if (value && !form.tools.includes(value)) patch({ tools: [...form.tools, value] })
    setCustomTool('')
  }

  const save = async () => {
    if (saving) return
    setSaving(true)
    await onSave(form, agent?.id).finally(() => setSaving(false))
  }

  useEffect(() => {
    const handler = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
      if ((event.ctrlKey || event.metaKey) && event.key === 's') {
        event.preventDefault()
        void save()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  })

  const onCustomKey = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== 'Enter') return
    event.preventDefault()
    addCustomTool()
  }

  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <aside className="drawer" role="dialog" aria-label={agent ? `Editar ${agent.name}` : 'Novo agente'}>
        <header className="drawer-head">
          <div>
            <h2>{agent ? agent.name : 'Novo agente'}</h2>
            {agent && <p className="path">{agent.path}</p>}
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="Fechar">
            <CloseIcon />
          </button>
        </header>

        <div className="drawer-body">
          <div className="field">
            <label>Nome</label>
            <input
              value={form.name}
              onChange={(e) => patch({ name: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-') })}
              placeholder="code-reviewer"
              spellCheck={false}
            />
          </div>

          <div className="field">
            <label>Descrição</label>
            <textarea
              rows={3}
              value={form.description}
              onChange={(e) => patch({ description: e.target.value })}
              placeholder="Quando o Claude deve delegar para este agente"
            />
          </div>

          <div className="field-row">
            <div className="field">
              <label>Escopo</label>
              <select value={form.scopeId} disabled={!!agent} onChange={(e) => patch({ scopeId: e.target.value })}>
                {scopes.map((scope) => (
                  <option key={scope.id} value={scope.id}>
                    {scope.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>Modelo</label>
              <select value={form.model} onChange={(e) => patch({ model: e.target.value })}>
                {MODELS.map((model) => (
                  <option key={model.value} value={model.value}>
                    {model.label}
                  </option>
                ))}
                {form.model && !MODELS.some((m) => m.value === form.model) && (
                  <option value={form.model}>{form.model}</option>
                )}
              </select>
            </div>
          </div>

          <div className="field">
            <label>Cor</label>
            <div className="swatches">
              <button
                type="button"
                className={`swatch none ${form.color === '' ? 'selected' : ''}`}
                onClick={() => patch({ color: '' })}
                aria-label="Sem cor"
              />
              {Object.entries(AGENT_COLORS).map(([name, hex]) => (
                <button
                  key={name}
                  type="button"
                  className={`swatch ${form.color === name ? 'selected' : ''}`}
                  style={{ background: hex }}
                  onClick={() => patch({ color: name })}
                  aria-label={name}
                />
              ))}
            </div>
          </div>

          <div className="field">
            <label>
              Ferramentas <small>{form.tools.length ? `${form.tools.length} selecionadas` : 'vazio herda todas'}</small>
            </label>
            <div className="chips selectable">
              {toolOptions.map((tool) => (
                <button
                  key={tool}
                  type="button"
                  className={`chip ${form.tools.includes(tool) ? 'on' : ''}`}
                  onClick={() => toggleTool(tool)}
                >
                  {tool}
                </button>
              ))}
            </div>
            <input
              value={customTool}
              onChange={(e) => setCustomTool(e.target.value)}
              onKeyDown={onCustomKey}
              onBlur={addCustomTool}
              placeholder="Outra ferramenta (ex.: mcp__server__tool) e Enter"
              spellCheck={false}
            />
          </div>

          <div className="field grow">
            <label>
              Prompt do sistema <small>{form.prompt.split('\n').length} linhas</small>
            </label>
            <textarea
              className="mono prompt"
              value={form.prompt}
              onChange={(e) => patch({ prompt: e.target.value })}
              spellCheck={false}
            />
          </div>
        </div>

        <footer className="drawer-foot">
          {agent && (
            <div className="foot-actions">
              {confirmDelete ? (
                <>
                  <button className="btn danger" onClick={() => void onDelete(agent)}>
                    Confirmar exclusão
                  </button>
                  <button className="btn ghost" onClick={() => setConfirmDelete(false)}>
                    Cancelar
                  </button>
                </>
              ) : (
                <button className="btn ghost danger-text" onClick={() => setConfirmDelete(true)}>
                  <TrashIcon /> Excluir
                </button>
              )}
              {copyOptions.length > 0 && (
                <div className="copy-group">
                  <select value={copyTarget} onChange={(e) => setCopyTarget(e.target.value)}>
                    <option value="">Copiar para...</option>
                    {copyOptions.map((scope) => (
                      <option key={scope.id} value={scope.id}>
                        {scope.label}
                      </option>
                    ))}
                  </select>
                  <button
                    className="btn ghost"
                    disabled={!copyTarget}
                    onClick={() => void onCopy(agent, copyTarget)}
                    aria-label="Copiar agente"
                  >
                    <CopyIcon />
                  </button>
                </div>
              )}
            </div>
          )}
          <button className="btn primary" disabled={!dirty || saving} onClick={() => void save()}>
            {saving ? 'Salvando...' : agent ? 'Salvar' : 'Criar agente'}
          </button>
        </footer>
      </aside>
    </div>
  )
}
