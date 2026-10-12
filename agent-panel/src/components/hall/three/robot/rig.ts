import type { Group, Object3D } from 'three'
import type { RefObject } from 'react'

export type PartRef = RefObject<Group | null>

/** Articulações animadas do robô. */
export interface Parts {
  hip: PartRef
  torso: PartRef
  head: PartRef
  antenna: PartRef
  eyeL: PartRef
  eyeR: PartRef
  shoulderL: PartRef
  shoulderR: PartRef
  elbowL: PartRef
  elbowR: PartRef
  legL: PartRef
  legR: PartRef
  kneeL: PartRef
  kneeR: PartRef
}

export interface Motion {
  walking: boolean
  working: boolean
  enabled: boolean
  ghost: boolean
  seed: number
}

let reduced: boolean | null = null
/** Com `prefers-reduced-motion`, o robô mantém poses mas sem os movimentos espontâneos. */
const calmMode = () => (reduced ??= typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches)

const damp = (from: number, to: number, lambda: number, dt: number) => from + (to - from) * (1 - Math.exp(-lambda * dt))

type Axis = 'x' | 'y' | 'z'

/** Pose procedural de um quadro: andar, trabalhar (digitando), ocioso, desligado e carregado no arrasto. */
export function pose(parts: Parts, m: Motion, t: number, dt: number, hipY: number) {
  const calm = calmMode()
  const rot = (ref: PartRef, axis: Axis, target: number, lambda = 10) => {
    const o: Object3D | null = ref.current
    if (o) o.rotation[axis] = damp(o.rotation[axis], target, lambda, dt)
  }
  const scaleY = (ref: PartRef, target: number, lambda = 30) => {
    const o = ref.current
    if (o) o.scale.y = damp(o.scale.y, target, lambda, dt)
  }

  const swing = Math.sin(t * 9 + m.seed)
  const tilt = m.walking ? 0.08 : m.working ? 0.05 : m.enabled ? 0 : 0.12

  // Pernas
  let legL = 0
  let legR = 0
  let kneeL = 0
  let kneeR = 0
  if (m.ghost) {
    legL = Math.sin(t * 6) * 0.22
    legR = -Math.sin(t * 6) * 0.22
    kneeL = 0.3
    kneeR = 0.3
  } else if (m.walking) {
    legL = swing * 0.7
    legR = -swing * 0.7
    kneeL = Math.max(0, -swing) * 0.85
    kneeR = Math.max(0, swing) * 0.85
  }
  rot(parts.legL, 'x', legL, 14)
  rot(parts.legR, 'x', legR, 14)
  rot(parts.kneeL, 'x', kneeL, 14)
  rot(parts.kneeR, 'x', kneeR, 14)

  // Braços
  let shL = 0
  let shR = 0
  let shLz = -0.07
  let shRz = 0.07
  let elL = -0.15
  let elR = -0.15
  if (m.ghost) {
    shLz = -2.3
    shRz = 2.3
    elL = 0
    elR = 0
  } else if (m.walking) {
    shL = -swing * 0.6
    shR = swing * 0.6
    elL = -0.45
    elR = -0.45
  } else if (m.working) {
    shL = -1.05
    shR = -1.05
    shLz = -0.12
    shRz = 0.12
    elL = -0.75 + Math.sin(t * 14) * 0.24
    elR = -0.75 + Math.sin(t * 14 + Math.PI) * 0.24
  } else if (m.enabled) {
    shL = calm ? 0 : Math.sin(t * 1.3 + m.seed) * 0.05
    shR = calm ? 0 : Math.sin(t * 1.3 + m.seed + 1) * 0.05
  } else {
    shL = 0.12
    shR = 0.12
    elL = -0.1
    elR = -0.1
  }
  rot(parts.shoulderL, 'x', shL, 12)
  rot(parts.shoulderR, 'x', shR, 12)
  rot(parts.shoulderL, 'z', shLz, 12)
  rot(parts.shoulderR, 'z', shRz, 12)
  rot(parts.elbowL, 'x', elL, 16)
  rot(parts.elbowR, 'x', elR, 16)

  // Tronco, quadril e cabeça
  const hip = parts.hip.current
  if (hip) {
    const bob = m.walking ? Math.abs(Math.cos(t * 9 + m.seed)) * 0.035 : 0
    hip.position.y = damp(hip.position.y || hipY, hipY + bob, 20, dt)
  }
  rot(parts.torso, 'x', tilt, 8)
  rot(parts.torso, 'z', m.walking ? swing * 0.04 : 0, 8)
  const torso = parts.torso.current
  if (torso) torso.scale.y = m.enabled && !m.walking && !calm ? 1 + Math.sin(t * 1.8 + m.seed) * 0.012 : 1

  let headX = 0
  let headY = 0
  if (!m.enabled) headX = 0.62
  else if (m.working) headX = 0.24
  else if (m.ghost) headX = -0.2
  else if (!calm) headY = Math.sin(t * 0.45 + m.seed) * Math.sin(t * 0.21 + m.seed * 1.3) * 0.75
  rot(parts.head, 'x', headX, 8)
  rot(parts.head, 'y', headY, 5)

  // Antena e olhos
  const antenna = parts.antenna.current
  if (antenna) antenna.rotation.z = m.enabled && !calm ? Math.sin(t * 2.4 + m.seed) * 0.09 : 0
  const blinking = (t + m.seed * 0.37) % 3.8 < 0.13
  const eye = !m.enabled ? 0.12 : blinking && !calm ? 0.1 : 1
  scaleY(parts.eyeL, eye)
  scaleY(parts.eyeR, eye)
}

/** Intensidade do núcleo luminoso do peito (0 = apagado). */
export const corePulse = (m: Motion, t: number) =>
  !m.enabled ? 0 : m.working ? 0.85 + 0.5 * Math.sin(t * 7) : 0.85 + 0.15 * Math.sin(t * 2 + m.seed)
