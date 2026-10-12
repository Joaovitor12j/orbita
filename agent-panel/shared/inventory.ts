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
  /** Id do item que sobrescreve este (mesmo nome em escopo de maior prioridade). */
  shadowedBy?: string
  /** Avisos de leitura (arquivo malformado, frontmatter ausente…). */
  warnings?: string[]
  meta: Record<string, unknown>
}

export interface Inventory {
  items: Item[]
}
