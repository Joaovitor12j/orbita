import { parse, stringify } from 'yaml'

const FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/

export interface ParsedAgentFile {
  meta: Record<string, unknown>
  prompt: string
}

export function parseAgentFile(raw: string): ParsedAgentFile {
  const match = FRONTMATTER.exec(raw)
  if (!match) return { meta: {}, prompt: raw.trim() }

  let meta: Record<string, unknown> = {}
  try {
    const parsed = parse(match[1] ?? '')
    if (parsed && typeof parsed === 'object') meta = parsed as Record<string, unknown>
  } catch {
    meta = {}
  }
  return { meta, prompt: (match[2] ?? '').trim() }
}

export function serializeAgentFile(meta: Record<string, unknown>, prompt: string): string {
  const yaml = stringify(meta, { lineWidth: 0 }).trimEnd()
  return `---\n${yaml}\n---\n\n${prompt.trim()}\n`
}

export function normalizeTools(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String).map((t) => t.trim()).filter(Boolean)
  if (typeof value === 'string') return value.split(',').map((t) => t.trim()).filter(Boolean)
  return []
}
