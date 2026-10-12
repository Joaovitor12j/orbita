import { TABLE_SEATS, type Activity, type Agent } from '../../../shared/types'

// Geometria e posicionamento do salão, independentes do renderizador (SVG 2D ou three.js).
// Posições em ladrilhos (x, y) sobre um piso N x N; `project` converte para a tela isométrica do 2D.

export const TW = 64
export const TH = 32
export const N = 16
export const OX = 500
export const OY = 150
export const SEATS = TABLE_SEATS
export const CENTER = N / 2
export const SEAT_RADIUS = 2.6
export const TABLE_RADIUS = 1.55
export const BUBBLE_MAX = 34

export const BENCH_TILE = { x: 1.2, y: N - 1.4 }
export const VISITOR_START = -Math.PI / 4

export const project = (x: number, y: number) => ({ x: OX + ((x - y) * TW) / 2, y: OY + ((x + y) * TH) / 2 })

export const seatTiles = Array.from({ length: SEATS }, (_, i) => {
  const angle = -Math.PI / 2 + (i * 2 * Math.PI) / SEATS
  return { x: CENTER + SEAT_RADIUS * Math.cos(angle), y: CENTER + SEAT_RADIUS * Math.sin(angle) }
})

// Vagas do piso em volta da mesa, ordenadas por ângulo a partir da doca de visitantes:
// cada ala (escopo) ocupa um trecho contíguo e os robôs nunca dividem a mesma vaga.
export const floorSlots = (() => {
  const slots: { x: number; y: number; angle: number; radius: number }[] = []
  for (let gx = 1.2; gx <= N - 1; gx += 1.5) {
    for (let gy = 1.2; gy <= N - 1; gy += 1.5) {
      const radius = Math.hypot(gx - CENTER, gy - CENTER)
      const nearBench = Math.hypot(gx - BENCH_TILE.x, gy - BENCH_TILE.y) < 2.7
      if (radius <= 3.7 || gx > N - 2.4 || nearBench) continue
      const angle = (Math.atan2(gy - CENTER, gx - CENTER) - VISITOR_START + 2 * Math.PI) % (2 * Math.PI)
      slots.push({ x: gx, y: gy, angle, radius })
    }
  }
  return slots.sort((a, b) => a.angle - b.angle || a.radius - b.radius)
})()

export interface Placement {
  agent: Agent
  x: number
  y: number
}

export interface Wing {
  key: string
  label: string
  hue: number
  placements: Placement[]
}

export const hash = (text: string) => {
  let h = 0
  for (let i = 0; i < text.length; i++) h = (h * 31 + text.charCodeAt(i)) | 0
  return Math.abs(h)
}

/** Cada cadeira guarda `scopeId:nome`, que sobrevive a ligar/desligar o agente. */
export const seatKey = (agent: Agent) => `${agent.scopeId}:${agent.name}`

// Liga um subagente em execução ao robô de mesmo nome; o escopo do projeto da sessão tem prioridade.
export const matchAgent = (agents: Agent[], act: Activity) => {
  const candidates = agents.filter((a) => a.name === act.agentType)
  return candidates.find((a) => a.scopeLabel === act.project) ?? candidates.find((a) => a.scopeId === 'global') ?? candidates[0]
}

// Distância na tela com peso maior na vertical: é onde os robôs altos mais se cobrem.
const screenGap = (a: { x: number; y: number }, b: { x: number; y: number }) => {
  const p = project(a.x, a.y)
  const q = project(b.x, b.y)
  return Math.hypot(p.x - q.x, (p.y - q.y) * 1.7)
}

export const buildWings = (agents: Agent[]): Wing[] => {
  const groups = new Map<string, Agent[]>()
  for (const agent of agents) groups.set(agent.scopeId, [...(groups.get(agent.scopeId) ?? []), agent])
  const ordered = [...groups.entries()].sort(([a], [b]) => (a === 'global' ? -1 : b === 'global' ? 1 : a.localeCompare(b)))
  const total = agents.length + ordered.length
  const len = floorSlots.length
  const taken: { x: number; y: number }[] = []
  let cursor = 0

  return ordered.map(([key, members]) => {
    // Cada ala ganha um setor do anel proporcional ao seu tamanho; dentro dele, cada robô
    // escolhe a vaga mais distante dos já posicionados.
    const from = Math.floor((cursor * len) / total)
    const to = Math.max(from + members.length, Math.floor(((cursor + members.length) * len) / total))
    const sector = Array.from({ length: to - from }, (_, i) => floorSlots[(from + i) % len]!)
    const placements = members
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((agent) => {
        let best = sector[0]!
        let bestScore = -1
        for (const slot of sector) {
          if (taken.some((t) => t.x === slot.x && t.y === slot.y)) continue
          const score = taken.length ? Math.min(...taken.map((t) => screenGap(slot, t))) : slot.radius
          if (score > bestScore) {
            best = slot
            bestScore = score
          }
        }
        // Sem vagas livres no setor, a volta seguinte desloca o robô para não empilhar.
        const lap = bestScore < 0 ? 0.6 : 0
        const spot = { x: best.x + lap, y: best.y + lap }
        taken.push(spot)
        return { agent, ...spot }
      })
    cursor += members.length + 1
    return { key, label: members[0]!.scopeLabel, hue: hash(key) % 360, placements }
  })
}

export const visitorAgent = (activity: Activity): Agent => ({
  id: `visitor:${activity.agentId}`,
  name: activity.agentType,
  description: activity.description,
  tools: [],
  model: '',
  color: '',
  prompt: '',
  enabled: true,
  scopeId: 'visitor',
  scopeLabel: 'Visitante',
  path: '',
  updatedAt: activity.updatedAt,
})

export const bubbleText = (activity: Activity) => {
  const text = activity.tool ? `${activity.tool}${activity.detail ? ` · ${activity.detail}` : ''}` : 'pensando…'
  return text.length > BUBBLE_MAX ? `${text.slice(0, BUBBLE_MAX - 1)}…` : text
}

/** Posição do i-ésimo visitante na doca (ladrilhos). */
export const visitorTile = (i: number) => ({ x: N - 0.7, y: 1.6 + i * 1.6 })

/** Distância máxima (em ladrilhos) entre o ponto solto e a cadeira para o robô encaixar. */
export const SEAT_SNAP = 1.1

export const nearestSeatTile = (x: number, y: number) => {
  let best = -1
  let bestDistance = SEAT_SNAP
  seatTiles.forEach((t, i) => {
    const distance = Math.hypot(t.x - x, t.y - y)
    if (distance < bestDistance) {
      best = i
      bestDistance = distance
    }
  })
  return best
}

/** Cadeiras após soltar um robô: `target` -1 = fora das cadeiras. Devolve null quando nada muda. */
export const seatsAfterDrop = (seats: (string | null)[], key: string, fromSeat: number, target: number) => {
  const next = [...seats]
  if (target >= 0) {
    const occupant = next[target]
    if (fromSeat >= 0) next[fromSeat] = occupant && occupant !== key ? occupant : null
    next[target] = key
  } else if (fromSeat >= 0) {
    next[fromSeat] = null
  } else {
    return null
  }
  return next
}
