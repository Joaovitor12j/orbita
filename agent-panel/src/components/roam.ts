// Simulação do passeio dos robôs no piso: andam entre pontos, conversam, visitam a bancada e a mesa.
// Posições em ladrilhos; o desenho anima o deslocamento com transição CSS.

export interface Tile {
  x: number
  y: number
}

export interface Roamer {
  x: number
  y: number
  fx: number
  fy: number
  t0: number
  dur: number
  until: number
  home: Tile
  say?: { text: string; from: number; until: number }
}

export interface RoamWorld {
  size: number
  center: number
  tableClear: number
  bench: Tile
}

const SPEED = 1.15 // ladrilhos por segundo
const CHAT = ['bom dia', 'compilou?', 'olha isso', 'vamos lá', 'ping', 'sem erros', 'merge?', 'café?']
const TABLE = ['conselho?', 'hmm…', 'pauta nova?']
const BENCH = ['montando…', 'aperta aqui', 'quase pronto']

const rand = (min: number, max: number) => min + Math.random() * (max - min)
const pick = <T,>(items: T[]) => items[Math.floor(Math.random() * items.length)]!

export const current = (r: Roamer, now: number): Tile => {
  if (!r.dur) return { x: r.x, y: r.y }
  const p = Math.min(1, Math.max(0, (now - r.t0) / r.dur))
  return { x: r.fx + (r.x - r.fx) * p, y: r.fy + (r.y - r.fy) * p }
}

export const isWalking = (r: Roamer, now: number) => now < r.t0 + r.dur

export const create = (home: Tile, now: number): Roamer => ({
  x: home.x, y: home.y, fx: home.x, fy: home.y, t0: now, dur: 0, until: now + rand(1500, 6000), home: { ...home },
})

// Mantém o ponto dentro do piso e fora da mesa.
const clamp = (t: Tile, w: RoamWorld): Tile => {
  const x = Math.min(w.size - 1.4, Math.max(1, t.x))
  const y = Math.min(w.size - 1.4, Math.max(1, t.y))
  const dx = x - w.center
  const dy = y - w.center
  const d = Math.hypot(dx, dy)
  if (d >= w.tableClear) return { x, y }
  const k = w.tableClear / (d || 1)
  return { x: w.center + dx * k, y: w.center + dy * k }
}

const walkTo = (r: Roamer, target: Tile, now: number) => {
  const from = current(r, now)
  r.fx = from.x
  r.fy = from.y
  r.x = target.x
  r.y = target.y
  r.t0 = now
  r.dur = (Math.hypot(target.x - from.x, target.y - from.y) / SPEED) * 1000
  return now + r.dur
}

const say = (r: Roamer, text: string, from: number, ms: number) => {
  r.say = { text, from, until: from + ms }
}

/** Avança um passo da simulação. Devolve true se algo mudou e o salão precisa redesenhar. */
export function step(
  roamers: Map<string, Roamer>,
  homes: Map<string, Tile>,
  free: Set<string>,
  world: RoamWorld,
  state: { benchUntil: number },
  now: number,
): boolean {
  let changed = false
  for (const id of roamers.keys()) {
    if (!homes.has(id)) {
      roamers.delete(id)
      changed = true
    }
  }

  const crowded = (spot: Tile, self: string) =>
    [...roamers.entries()].some(([id, r]) => id !== self && Math.hypot(r.x - spot.x, r.y - spot.y) < 1.1)

  for (const [id, home] of homes) {
    let r = roamers.get(id)
    if (!r) {
      r = create(home, now)
      roamers.set(id, r)
    }
    const walking = isWalking(r, now)
    const visible = Boolean(r.say && now >= r.say.from && now < r.say.until)
    if (r.say && now >= r.say.until) {
      r.say = undefined
      changed = true
    }
    if (walking || visible) changed = true
    if (r.dur && !walking) {
      // Chegou: fixa a posição e dispara um último redesenho.
      r.fx = r.x
      r.fy = r.y
      r.dur = 0
      changed = true
    }

    const moved = r.home.x !== home.x || r.home.y !== home.y
    if (moved || !free.has(id)) {
      r.home = { ...home }
      if (Math.hypot(r.x - home.x, r.y - home.y) > 0.05 && !walking) {
        r.until = walkTo(r, home, now) + 200
        changed = true
      }
      continue
    }
    if (walking || now < r.until) continue

    const roll = Math.random()
    const away = Math.hypot(r.x - home.x, r.y - home.y) > 0.8
    let arrive = now

    if (roll < 0.22 && away) {
      arrive = walkTo(r, home, now)
    } else if (roll < 0.55) {
      const spot = clamp({ x: home.x + rand(-2.4, 2.4), y: home.y + rand(-2.4, 2.4) }, world)
      if (crowded(spot, id)) {
        r.until = now + 800
        continue
      }
      arrive = walkTo(r, spot, now)
    } else if (roll < 0.82) {
      const partners = [...roamers.entries()].filter(([pid, p]) => pid !== id && free.has(pid) && !isWalking(p, now) && !p.say)
      const near = partners.sort(([, a], [, b]) => Math.hypot(a.x - r!.x, a.y - r!.y) - Math.hypot(b.x - r!.x, b.y - r!.y))[0]
      if (!near) {
        r.until = now + 1500
        continue
      }
      const [, partner] = near
      const spot = clamp({ x: partner.x + (Math.random() < 0.5 ? -0.95 : 0.95), y: partner.y + rand(-0.3, 0.3) }, world)
      arrive = walkTo(r, spot, now)
      say(r, pick(CHAT), arrive + 200, 3200)
      say(partner, pick(CHAT), arrive + 1200, 3000)
      partner.until = Math.max(partner.until, arrive + 4500)
    } else if (roll < 0.92) {
      const angle = rand(0, Math.PI * 2)
      const spot = clamp({ x: world.center + Math.cos(angle) * 3.7, y: world.center + Math.sin(angle) * 3.7 }, world)
      arrive = walkTo(r, spot, now)
      say(r, pick(TABLE), arrive + 200, 3000)
    } else if (now > state.benchUntil) {
      const spot = clamp({ x: world.bench.x + 1.9, y: world.bench.y - 0.3 }, world)
      arrive = walkTo(r, spot, now)
      say(r, pick(BENCH), arrive + 200, 3500)
      state.benchUntil = arrive + 4500
    } else {
      r.until = now + 1500
      continue
    }
    r.until = Math.max(r.until, arrive + rand(3000, 8000))
    changed = true
  }
  return changed
}
