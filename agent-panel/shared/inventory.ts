// Modelo único do inventário: tudo o que molda o Claude Code (skills, comandos, hooks, MCPs…)
// aparece como um `Item`, para a interface tratar os tipos da mesma forma.

export type ItemKind = 'agent' | 'skill' | 'command' | 'hook' | 'mcp' | 'plugin' | 'rule'

/** De onde o item vem: usuário (~/.claude), projeto, plugin ou sincronizado pela conta. */
export type ItemSource = 'user' | 'project' | 'plugin' | 'synced'

export interface Item {
  id: string
  kind: ItemKind
  name: string
  description: string
  source: ItemSource
  /** Rótulo legível da origem: "Global", nome do projeto ou do plugin. */
  origin: string
  path: string
  enabled: boolean
  /** Skill ou comando de usuário/projeto: o Orbita pode editar, excluir e versionar. */
  editable?: boolean
  /** Id do item que sobrescreve este (mesmo nome em escopo de maior prioridade). */
  shadowedBy?: string
  /** Avisos de leitura (arquivo malformado, frontmatter ausente…). */
  warnings?: string[]
  meta: Record<string, unknown>
}

export interface Inventory {
  items: Item[]
}

/** Projeto que o Claude Code já abriu (~/.claude.json) mas que o Orbita ainda não registrou. */
export interface DiscoveredProject {
  path: string
  name: string
  /** Tem pasta .claude própria (agentes, skills ou configurações locais). */
  hasClaudeDir: boolean
  mcpCount: number
  lastStartTime: number
}

/** Skills e comandos editáveis pelo Orbita (usuário e projeto). */
export type EditableKind = 'skill' | 'command'

export interface ItemInput {
  kind: EditableKind
  /** `global` ou o id de um projeto registrado (só na criação). */
  scopeId?: string
  /** Só na criação; depois do nome criado ele não muda. */
  name?: string
  description: string
  body: string
  /** Campos extras do frontmatter permitidos para o tipo (ex.: `allowed-tools`). */
  fields: Record<string, string>
  /** `mtime` lido junto com o item: se o arquivo mudou no disco, a escrita é recusada. */
  mtime?: number
}

export interface ItemVersion {
  version: string
  createdAt: string
  bytes: number
}

/** Campos de frontmatter que o editor expõe, além de `name` e `description`. */
export const EDITABLE_FIELDS: Record<EditableKind, { key: string; label: string; hint: string }[]> = {
  skill: [{ key: 'allowed-tools', label: 'Ferramentas permitidas', hint: 'Read, Grep, Bash(git log:*)' }],
  command: [
    { key: 'argument-hint', label: 'Dica de argumento', hint: '[arquivo] [opções]' },
    { key: 'allowed-tools', label: 'Ferramentas permitidas', hint: 'Bash(git status:*), Read' },
    { key: 'model', label: 'Modelo', hint: 'sonnet, opus ou haiku (vazio herda)' },
  ],
}
