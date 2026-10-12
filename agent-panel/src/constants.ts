export const AGENT_COLORS: Record<string, string> = {
  red: '#f87171',
  orange: '#fb923c',
  yellow: '#facc15',
  green: '#4ade80',
  cyan: '#22d3ee',
  blue: '#60a5fa',
  purple: '#a78bfa',
  pink: '#f472b6',
}

export const DEFAULT_COLOR = '#64748b'

export const MODELS = [
  { value: '', label: 'Herdar' },
  { value: 'sonnet', label: 'Sonnet' },
  { value: 'opus', label: 'Opus' },
  { value: 'haiku', label: 'Haiku' },
]

export const KNOWN_TOOLS = [
  'Read',
  'Write',
  'Edit',
  'Glob',
  'Grep',
  'Bash',
  'WebFetch',
  'WebSearch',
  'NotebookEdit',
  'TodoWrite',
]

export const colorOf = (name: string) => AGENT_COLORS[name] ?? DEFAULT_COLOR

export const modelLabel = (value: string) =>
  MODELS.find((m) => m.value === value)?.label ?? (value || 'Herdar')
