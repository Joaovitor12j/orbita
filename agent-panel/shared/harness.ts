// Harness: um perfil nomeado do que molda uma sessão do Claude Code (modelo, plugins, MCPs, agentes…).
// Fica em ~/.config/orbita/harnesses.json; os arquivos gerados para o lançamento ficam em harnesses/<id>/.

/** Referência a um item do inventário; guarda o nome para exibir mesmo se o item sumir. */
export interface HarnessRef {
  id: string
  name: string
  origin: string
}

export interface Harness {
  id: string
  name: string
  description: string
  /** Projeto registrado onde a sessão roda; vazio = diretório atual do terminal. */
  projectId: string
  model: string
  effort: string
  permissionMode: string
  /** Texto anexado ao prompt do sistema (`--append-system-prompt`). */
  instructions: string
  allowedTools: string
  disallowedTools: string
  /** `plugin@marketplace` -> ligado/desligado nesta sessão; ausente = herda a configuração atual. */
  plugins: Record<string, boolean>
  /** Skills desligadas nesta sessão (`skillOverrides`). */
  skillsOff: string[]
  /** `inherit` mantém os MCPs de sempre; `only` usa somente os escolhidos (`--strict-mcp-config`). */
  mcp: { mode: 'inherit' | 'only'; servers: HarnessRef[] }
  /** Agentes extras carregados só nesta sessão. */
  agents: HarnessRef[]
  updatedAt: string
}

export type HarnessInput = Omit<Harness, 'id' | 'updatedAt'>

export interface PreparedFile {
  path: string
  purpose: string
}

export interface Prepared {
  command: string
  dir: string
  files: PreparedFile[]
  warnings: string[]
}

export const HARNESS_MODELS = [
  { value: '', label: 'Herdar' },
  { value: 'sonnet', label: 'Sonnet' },
  { value: 'opus', label: 'Opus' },
  { value: 'haiku', label: 'Haiku' },
  { value: 'fable', label: 'Fable' },
]

export const EFFORTS = [
  { value: '', label: 'Herdar' },
  { value: 'low', label: 'Baixo' },
  { value: 'medium', label: 'Médio' },
  { value: 'high', label: 'Alto' },
  { value: 'xhigh', label: 'Muito alto' },
  { value: 'max', label: 'Máximo' },
]

// `bypassPermissions` de propósito fica de fora: o Orbita não gera comandos que desligam as permissões.
export const PERMISSION_MODES = [
  { value: '', label: 'Herdar' },
  { value: 'manual', label: 'Manual (pergunta tudo)' },
  { value: 'acceptEdits', label: 'Aceitar edições' },
  { value: 'plan', label: 'Somente planejar' },
  { value: 'auto', label: 'Automático' },
  { value: 'dontAsk', label: 'Não perguntar (nega o que não for permitido)' },
]

export const emptyHarness = (): HarnessInput => ({
  name: '',
  description: '',
  projectId: '',
  model: '',
  effort: '',
  permissionMode: '',
  instructions: '',
  allowedTools: '',
  disallowedTools: '',
  plugins: {},
  skillsOff: [],
  mcp: { mode: 'inherit', servers: [] },
  agents: [],
})
