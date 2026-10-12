import type { ItemKind } from '../../../shared/inventory'

/** `agent` abre a visão de agentes (Salão/Lista); os demais abrem o inventário. */
export type SectionId = ItemKind | 'harness'

export interface Section {
  kind: SectionId
  label: string
  singular: string
  empty: string
}

export const SECTIONS: Section[] = [
  { kind: 'harness', label: 'Harness', singular: 'harness', empty: 'Nenhum harness criado ainda.' },
  { kind: 'agent', label: 'Agentes', singular: 'agente', empty: 'Nenhum agente encontrado.' },
  { kind: 'skill', label: 'Skills', singular: 'skill', empty: 'Nenhuma skill neste escopo.' },
  { kind: 'command', label: 'Comandos', singular: 'comando', empty: 'Nenhum comando neste escopo.' },
  { kind: 'hook', label: 'Hooks', singular: 'hook', empty: 'Nenhum hook configurado neste escopo.' },
  { kind: 'mcp', label: 'MCPs', singular: 'servidor MCP', empty: 'Nenhum servidor MCP neste escopo.' },
  { kind: 'plugin', label: 'Plugins', singular: 'plugin', empty: 'Nenhum plugin neste escopo.' },
  { kind: 'rule', label: 'Regras', singular: 'regra', empty: 'Nenhuma regra ou CLAUDE.md neste escopo.' },
]

export const sectionOf = (kind: SectionId) => SECTIONS.find((s) => s.kind === kind) ?? SECTIONS[0]!

export const META_LABELS: Record<string, string> = {
  type: 'Tipo',
  scope: 'Declarado em',
  command: 'Comando',
  args: 'Argumentos',
  url: 'URL',
  env: 'Variáveis de ambiente (valores ocultos)',
  headers: 'Cabeçalhos (valores ocultos)',
  event: 'Evento',
  matcher: 'Filtro (matcher)',
  timeout: 'Timeout (s)',
  version: 'Versão',
  author: 'Autor',
  marketplace: 'Marketplace',
  key: 'Identificador',
  fullName: 'Nome no Claude Code',
  installation: 'Instalação',
  projectPath: 'Projeto de instalação',
  counts: 'Conteúdo',
  tools: 'Ferramentas',
  model: 'Modelo',
  color: 'Cor',
  paths: 'Aplica-se a',
  bytes: 'Tamanho (bytes)',
}

// Não aparecem na lista de propriedades (o corpo tem área própria).
export const HIDDEN_META = new Set(['body', 'agentId', 'plugin', 'mtime'])

// Valores de metadados que são códigos internos, exibidos em português.
export const META_VALUES: Record<string, Record<string, string>> = {
  scope: {
    user: 'Usuário (~/.claude.json)',
    local: 'Local ao projeto (~/.claude.json)',
    project: 'Compartilhado no projeto (.mcp.json)',
    plugin: 'Plugin',
    connector: 'Conector da conta claude.ai',
    account: 'Conta claude.ai (sincronizado)',
  },
}
