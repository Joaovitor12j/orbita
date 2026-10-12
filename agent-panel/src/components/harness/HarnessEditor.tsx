import { useEffect, useMemo, useState } from 'react'
import { EFFORTS, HARNESS_MODELS, PERMISSION_MODES, emptyHarness, type Harness, type HarnessInput, type HarnessRef } from '../../../shared/harness'
import type { Item } from '../../../shared/inventory'
import type { Project } from '../../../shared/types'
import { CloseIcon, TrashIcon } from '../Icons'
import { PickList, type PickOption } from './PickList'

interface Props {
  harness: Harness | null
  inventory: Item[]
  projects: Project[]
  onSave: (input: HarnessInput, id?: string) => Promise<boolean>
  onDelete: (harness: Harness) => Promise<void>
  onClose: () => void
}

const toInput = (h: Harness | null): HarnessInput => {
  if (!h) return emptyHarness()
  const { id: _id, updatedAt: _u, ...rest } = h
  return rest
}

const refOf = (item: Item): HarnessRef => ({ id: item.id, name: item.name, origin: item.origin })

export function HarnessEditor({ harness, inventory, projects, onSave, onDelete, onClose }: Props) {
  const initial = useMemo(() => toInput(harness), [harness])
  const [form, setForm] = useState<HarnessInput>(initial)
  const [saving, setSaving] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const patch = (next: Partial<HarnessInput>) => setForm((f) => ({ ...f, ...next }))
  const dirty = JSON.stringify(form) !== JSON.stringify(initial)

  const requestClose = () => {
    if (!dirty || window.confirm('Descartar as alterações?')) onClose()
  }
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && requestClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  // Plugins instalados (um por identificador), com o estado atual para comparar.
  const plugins = useMemo(() => {
    const map = new Map<string, Item>()
    for (const i of inventory) if (i.kind === 'plugin' && !map.has(String(i.meta.key))) map.set(String(i.meta.key), i)
    return [...map.values()].sort((a, b) => a.name.localeCompare(b.name))
  }, [inventory])

  const skillOptions = useMemo<PickOption[]>(() => {
    const names = new Map<string, Item>()
    for (const i of inventory) if (i.kind === 'skill' && i.source !== 'plugin' && !names.has(i.name)) names.set(i.name, i)
    return [...names.values()].map((i) => ({ id: i.name, label: i.name, sub: i.origin }))
  }, [inventory])

  const mcpItems = useMemo(() => inventory.filter((i) => i.kind === 'mcp' && i.meta.type !== 'connector'), [inventory])
  const agentItems = useMemo(() => inventory.filter((i) => i.kind === 'agent'), [inventory])
  const mcpOptions = mcpItems.map((i) => ({ id: i.id, label: i.name, sub: i.origin }))
  const agentOptions = agentItems.map((i) => ({ id: i.id, label: i.name, sub: i.origin }))

  const toggleRef = (list: HarnessRef[], items: Item[], id: string) => {
    if (list.some((r) => r.id === id)) return list.filter((r) => r.id !== id)
    const item = items.find((i) => i.id === id)
    return item ? [...list, refOf(item)] : list
  }

  // Referências que sumiram do inventário continuam visíveis para o usuário poder removê-las.
  const missing = (list: HarnessRef[], items: Item[]) => list.filter((r) => !items.some((i) => i.id === r.id))

  const setPlugin = (key: string, value: string) => {
    const next = { ...form.plugins }
    if (value === '') delete next[key]
    else next[key] = value === 'on'
    patch({ plugins: next })
  }

  const save = async () => {
    setSaving(true)
    await onSave(form, harness?.id)
    setSaving(false)
  }

  const canSave = dirty && form.name.trim() !== '' && !saving

  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && requestClose()}>
      <aside className="drawer wide" role="dialog" aria-label={harness ? `Editar ${harness.name}` : 'Novo harness'}>
        <header className="drawer-head">
          <div>
            <h2>{harness ? harness.name : 'Novo harness'}</h2>
            <p className="path">Perfil de sessão do Claude Code: nada é alterado nos seus arquivos até você lançar.</p>
          </div>
          <button className="icon-btn" onClick={requestClose} aria-label="Fechar">
            <CloseIcon />
          </button>
        </header>

        <div className="drawer-body">
          <div className="field">
            <label>Nome</label>
            <input value={form.name} onChange={(e) => patch({ name: e.target.value })} placeholder="Dev backend" autoFocus />
          </div>
          <div className="field">
            <label>Descrição</label>
            <input value={form.description} onChange={(e) => patch({ description: e.target.value })} placeholder="Para que serve este perfil" />
          </div>

          <h3 className="group-title">Execução</h3>
          <div className="field">
            <label>Projeto</label>
            <select value={form.projectId} onChange={(e) => patch({ projectId: e.target.value })}>
              <option value="">Diretório atual do terminal</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
          <div className="field-row three">
            <div className="field">
              <label>Modelo</label>
              <select value={form.model} onChange={(e) => patch({ model: e.target.value })}>
                {HARNESS_MODELS.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>Esforço</label>
              <select value={form.effort} onChange={(e) => patch({ effort: e.target.value })}>
                {EFFORTS.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>Permissões</label>
              <select value={form.permissionMode} onChange={(e) => patch({ permissionMode: e.target.value })}>
                {PERMISSION_MODES.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="field-row">
            <div className="field">
              <label>Ferramentas permitidas</label>
              <input value={form.allowedTools} onChange={(e) => patch({ allowedTools: e.target.value })} placeholder="Bash(git status:*), Read" spellCheck={false} />
            </div>
            <div className="field">
              <label>Ferramentas negadas</label>
              <input value={form.disallowedTools} onChange={(e) => patch({ disallowedTools: e.target.value })} placeholder="WebFetch" spellCheck={false} />
            </div>
          </div>
          <div className="field">
            <label>
              Instruções adicionais <small>anexadas ao prompt do sistema</small>
            </label>
            <textarea rows={3} value={form.instructions} onChange={(e) => patch({ instructions: e.target.value })} placeholder="Ex.: responda sempre em português e prefira mudanças pequenas" />
          </div>

          <h3 className="group-title">Plugins nesta sessão</h3>
          <ul className="plugin-rows">
            {plugins.map((p) => {
              const key = String(p.meta.key)
              const current = key in form.plugins ? (form.plugins[key] ? 'on' : 'off') : ''
              return (
                <li key={key}>
                  <span className="pick-label">{p.name}</span>
                  <small>
                    {p.origin} · hoje {p.enabled ? 'ligado' : 'desligado'}
                  </small>
                  <select value={current} onChange={(e) => setPlugin(key, e.target.value)} aria-label={`Plugin ${p.name}`}>
                    <option value="">Herdar</option>
                    <option value="on">Ligar</option>
                    <option value="off">Desligar</option>
                  </select>
                </li>
              )
            })}
            {plugins.length === 0 && <li className="pick-empty">Nenhum plugin instalado</li>}
          </ul>

          <h3 className="group-title">
            Skills desligadas <small>{form.skillsOff.length} selecionadas</small>
          </h3>
          <PickList
            options={skillOptions}
            selected={new Set(form.skillsOff)}
            onToggle={(name) => patch({ skillsOff: form.skillsOff.includes(name) ? form.skillsOff.filter((s) => s !== name) : [...form.skillsOff, name] })}
            placeholder="Filtrar skills"
          />

          <h3 className="group-title">Servidores MCP</h3>
          <div className="segmented" role="group" aria-label="Modo MCP">
            <button className={form.mcp.mode === 'inherit' ? 'active' : ''} onClick={() => patch({ mcp: { ...form.mcp, mode: 'inherit' } })}>
              Manter os de sempre
            </button>
            <button className={form.mcp.mode === 'only' ? 'active' : ''} onClick={() => patch({ mcp: { ...form.mcp, mode: 'only' } })}>
              Somente os escolhidos
            </button>
          </div>
          {form.mcp.mode === 'only' ? (
            <>
              <p className="hint-text">
                Só estes servidores ficam disponíveis (inclui os conectores claude.ai e os de plugins fora). O Orbita grava as credenciais em um arquivo
                com permissão 0600 na pasta do harness; o comando não as mostra.
              </p>
              <PickList
                options={mcpOptions}
                selected={new Set(form.mcp.servers.map((r) => r.id))}
                onToggle={(id) => patch({ mcp: { ...form.mcp, servers: toggleRef(form.mcp.servers, mcpItems, id) } })}
                placeholder="Filtrar servidores"
              />
              {missing(form.mcp.servers, mcpItems).map((r) => (
                <p key={r.id} className="notice warn">
                  {r.name} ({r.origin}) não existe mais.{' '}
                  <button className="link" onClick={() => patch({ mcp: { ...form.mcp, servers: form.mcp.servers.filter((x) => x.id !== r.id) } })}>
                    Remover
                  </button>
                </p>
              ))}
            </>
          ) : (
            <p className="hint-text">A sessão usa os servidores MCP configurados normalmente.</p>
          )}

          <h3 className="group-title">
            Agentes extras <small>{form.agents.length} selecionados</small>
          </h3>
          <p className="hint-text">Entram só nesta sessão, como um plugin gerado pelo Orbita (nomes ficam com o prefixo do harness).</p>
          <PickList
            options={agentOptions}
            selected={new Set(form.agents.map((r) => r.id))}
            onToggle={(id) => patch({ agents: toggleRef(form.agents, agentItems, id) })}
            placeholder="Filtrar agentes"
          />
          {missing(form.agents, agentItems).map((r) => (
            <p key={r.id} className="notice warn">
              {r.name} ({r.origin}) não existe mais.{' '}
              <button className="link" onClick={() => patch({ agents: form.agents.filter((x) => x.id !== r.id) })}>
                Remover
              </button>
            </p>
          ))}
        </div>

        <footer className="drawer-foot">
          {harness && (
            <div className="foot-actions">
              {confirmDelete ? (
                <>
                  <button className="btn danger" onClick={() => void onDelete(harness)}>
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
            </div>
          )}
          <button className="btn primary" disabled={!canSave} onClick={() => void save()}>
            {saving ? 'Salvando...' : harness ? 'Salvar' : 'Criar harness'}
          </button>
        </footer>
      </aside>
    </div>
  )
}
