import { useEffect, useState } from 'react'
import { EDITABLE_FIELDS, type EditableKind, type Item, type ItemInput, type ItemVersion } from '../../../shared/inventory'
import { api } from '../../api'
import { CloseIcon, TrashIcon } from '../Icons'
import type { ScopeOption } from '../AgentDrawer'
import { TEMPLATES } from './templates'

interface Props {
  kind: EditableKind
  /** Item existente (edição) ou null (criação). */
  item: Item | null
  scopes: ScopeOption[]
  defaultScope: string
  onSave: (input: ItemInput, path?: string) => Promise<boolean>
  onDelete: (item: Item) => Promise<void>
  onRestore: (path: string, version: string) => Promise<void>
  onClose: () => void
}

const NAME_HINT = { skill: 'minha-skill', command: 'git:resumo' }
const DESCRIPTION_MAX = 1024
const label = { skill: 'skill', command: 'comando' } as const

const fieldsOf = (kind: EditableKind, item: Item | null) =>
  Object.fromEntries(EDITABLE_FIELDS[kind].map((f) => [f.key, item ? String(item.meta[f.key] ?? '') : '']))

export function ItemEditor({ kind, item, scopes, defaultScope, onSave, onDelete, onRestore, onClose }: Props) {
  const [name, setName] = useState('')
  const [scopeId, setScopeId] = useState(defaultScope)
  const [description, setDescription] = useState(item?.description ?? '')
  const [body, setBody] = useState(typeof item?.meta.body === 'string' ? item.meta.body : '')
  const [fields, setFields] = useState(() => fieldsOf(kind, item))
  const [template, setTemplate] = useState('')
  const [saving, setSaving] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [history, setHistory] = useState<ItemVersion[] | null>(null)

  const initial = item ? { description: item.description, body: String(item.meta.body ?? ''), fields: fieldsOf(kind, item) } : null
  const dirty = item
    ? description !== initial!.description || body !== initial!.body || JSON.stringify(fields) !== JSON.stringify(initial!.fields)
    : Boolean(name || description || body)

  // Esc fecha, mas não perde alterações sem avisar.
  const requestClose = () => {
    if (!dirty || window.confirm('Descartar as alterações?')) onClose()
  }
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && requestClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const applyTemplate = (id: string) => {
    setTemplate(id)
    const t = TEMPLATES[kind].find((x) => x.id === id)
    if (!t) return
    if ((description || body) && !window.confirm('Substituir a descrição e o conteúdo pelo template?')) return
    setDescription(t.description)
    setBody(t.body)
    setFields({ ...fieldsOf(kind, null), ...t.fields })
  }

  const save = async () => {
    setSaving(true)
    const mtime = typeof item?.meta.mtime === 'number' ? item.meta.mtime : undefined
    await onSave({ kind, scopeId, name: name.trim(), description, body, fields, mtime }, item?.path)
    setSaving(false)
  }

  const toggleHistory = async () => {
    if (history) return setHistory(null)
    setHistory(await api.listVersions(item!.path).catch(() => []))
  }

  const tooLong = description.length > DESCRIPTION_MAX
  const missingName = !item && !name.trim()
  const canSave = dirty && !saving && !tooLong && !missingName && description.trim() !== '' && body.trim() !== ''

  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && requestClose()}>
      <aside className="drawer" role="dialog" aria-label={item ? `Editar ${item.name}` : `Nova ${label[kind]}`}>
        <header className="drawer-head">
          <div>
            <h2>{item ? item.name : kind === 'skill' ? 'Nova skill' : 'Novo comando'}</h2>
            {item && <p className="path">{item.path}</p>}
          </div>
          <button className="icon-btn" onClick={requestClose} aria-label="Fechar">
            <CloseIcon />
          </button>
        </header>

        <div className="drawer-body">
          {!item && (
            <>
              <div className="field-row">
                <div className="field">
                  <label>Nome</label>
                  <input
                    value={name}
                    onChange={(e) => setName(e.target.value.toLowerCase().replace(kind === 'skill' ? /[^a-z0-9-]/g : /[^a-z0-9:-]/g, '-'))}
                    placeholder={NAME_HINT[kind]}
                    spellCheck={false}
                    autoFocus
                  />
                </div>
                <div className="field">
                  <label>Escopo</label>
                  <select value={scopeId} onChange={(e) => setScopeId(e.target.value)}>
                    {scopes.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="field">
                <label>Template</label>
                <select value={template} onChange={(e) => applyTemplate(e.target.value)}>
                  <option value="">Escolher um modelo…</option>
                  {TEMPLATES[kind].map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </div>
            </>
          )}

          <div className="field">
            <label>
              Descrição{' '}
              <small className={tooLong ? 'bad' : ''}>
                {description.length}/{DESCRIPTION_MAX}
              </small>
            </label>
            <textarea
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={kind === 'skill' ? 'O que faz e quando usar (é por ela que o Claude decide ativar a skill)' : 'O que o comando faz (aparece no /help)'}
            />
          </div>

          {EDITABLE_FIELDS[kind].map((f) => (
            <div className="field" key={f.key}>
              <label>{f.label}</label>
              <input value={fields[f.key] ?? ''} onChange={(e) => setFields({ ...fields, [f.key]: e.target.value })} placeholder={f.hint} spellCheck={false} />
            </div>
          ))}

          <div className="field grow">
            <label>
              Conteúdo <small>{body.split('\n').length} linhas</small>
            </label>
            <textarea className="mono prompt" value={body} onChange={(e) => setBody(e.target.value)} spellCheck={false} />
          </div>

          {history && (
            <div className="field">
              <label>Versões anteriores</label>
              {history.length === 0 ? (
                <p className="hint-text">Nenhuma versão anterior: o histórico começa na próxima alteração.</p>
              ) : (
                <ul className="versions">
                  {history.map((v) => (
                    <li key={v.version}>
                      <span>{new Date(v.createdAt).toLocaleString('pt-BR')}</span>
                      <small>{v.bytes} bytes</small>
                      <button className="btn ghost" onClick={() => void onRestore(item!.path, v.version)}>
                        Restaurar
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>

        <footer className="drawer-foot">
          {item && (
            <div className="foot-actions">
              {confirmDelete ? (
                <>
                  <button className="btn danger" onClick={() => void onDelete(item)}>
                    Confirmar exclusão
                  </button>
                  <button className="btn ghost" onClick={() => setConfirmDelete(false)}>
                    Cancelar
                  </button>
                </>
              ) : (
                <>
                  <button className="btn ghost danger-text" onClick={() => setConfirmDelete(true)}>
                    <TrashIcon /> Excluir
                  </button>
                  <button className="btn ghost" onClick={() => void toggleHistory()}>
                    {history ? 'Ocultar histórico' : 'Histórico'}
                  </button>
                </>
              )}
            </div>
          )}
          <button className="btn primary" disabled={!canSave} onClick={() => void save()}>
            {saving ? 'Salvando...' : item ? 'Salvar' : `Criar ${label[kind]}`}
          </button>
        </footer>
      </aside>
    </div>
  )
}
