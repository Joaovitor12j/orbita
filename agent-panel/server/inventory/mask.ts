// Segredos nunca saem do servidor: MCPs e hooks podem trazer chaves em headers, env, argumentos e URLs.

export const HIDDEN = '••••••'
const SECRET = /(key|token|secret|passw(or)?d|auth|credential|bearer|cookie|session)/i

const isSecretName = (name: string) => SECRET.test(name)

/** Mantém os nomes e esconde todos os valores (headers, env). */
export const maskRecord = (value: unknown): Record<string, string> => {
  if (!value || typeof value !== 'object') return {}
  return Object.fromEntries(Object.keys(value).map((k) => [k, HIDDEN]))
}

/** Esconde o que parece segredo num trecho de texto (comando de hook, argumento). */
export const maskText = (text: string) =>
  text
    .replace(/(Bearer|Basic)\s+[\w.~+/=-]+/gi, `$1 ${HIDDEN}`)
    .replace(/(-{1,2}[\w-]*(?:key|token|secret|passw(?:or)?d|auth)[\w-]*)(=|\s+)(?!-)(\S+)/gi, `$1$2${HIDDEN}`)
    .replace(/\b([A-Za-z0-9_]*(?:KEY|TOKEN|SECRET|PASSWORD|PASSWD)[A-Za-z0-9_]*)=("[^"]*"|'[^']*'|\S+)/gi, `$1=${HIDDEN}`)
    .replace(/\b(?:sk|ctx7sk|gho|ghp|ghs|github_pat|xox[abpr]|AKIA)[-_][\w-]{8,}/g, HIDDEN)

/** Argumentos de linha de comando: esconde o valor que segue uma flag sensível. */
export const maskArgs = (args: unknown): string[] => {
  if (!Array.isArray(args)) return []
  const out: string[] = []
  let hideNext = false
  for (const raw of args.map(String)) {
    if (hideNext && !raw.startsWith('-')) {
      out.push(HIDDEN)
      hideNext = false
      continue
    }
    hideNext = false
    const flag = /^(-{1,2}[\w-]+)$/.exec(raw)
    if (flag && isSecretName(flag[1]!)) hideNext = true
    out.push(maskText(raw))
  }
  return out
}

export const maskUrl = (value: unknown): string => {
  if (typeof value !== 'string') return ''
  try {
    const url = new URL(value)
    if (url.username) url.username = HIDDEN
    if (url.password) url.password = HIDDEN
    for (const key of [...url.searchParams.keys()]) url.searchParams.set(key, HIDDEN)
    return decodeURIComponent(url.toString())
  } catch {
    return maskText(value)
  }
}
