export type Tone = 'live' | 'idle' | 'warn' | 'bad' | 'done'

export interface StateInfo {
  label: string
  tone: Tone
  hint: string
}

// Estados que o Claude Code expõe em `claude agents --json`; os desconhecidos aparecem como vieram.
const STATES: Record<string, StateInfo> = {
  busy: { label: 'trabalhando', tone: 'live', hint: 'Processando agora' },
  working: { label: 'trabalhando', tone: 'live', hint: 'Processando agora' },
  running: { label: 'em execução', tone: 'live', hint: 'Em execução' },
  idle: { label: 'ocioso', tone: 'idle', hint: 'Aguardando um novo pedido' },
  blocked: { label: 'bloqueada', tone: 'warn', hint: 'Parada, provavelmente aguardando uma permissão ou resposta' },
  failed: { label: 'falhou', tone: 'bad', hint: 'Terminou com erro' },
  done: { label: 'concluída', tone: 'done', hint: 'Terminou normalmente' },
}

export const stateInfo = (state: string): StateInfo => STATES[state] ?? { label: state, tone: 'idle', hint: 'Estado informado pelo Claude Code' }

const rtf = new Intl.RelativeTimeFormat('pt-BR', { numeric: 'auto' })
export const relative = (ms: number, now = Date.now()) => {
  const seconds = Math.round((ms - now) / 1000)
  const abs = Math.abs(seconds)
  if (abs < 60) return rtf.format(seconds, 'second')
  if (abs < 3600) return rtf.format(Math.round(seconds / 60), 'minute')
  if (abs < 86_400) return rtf.format(Math.round(seconds / 3600), 'hour')
  return rtf.format(Math.round(seconds / 86_400), 'day')
}
