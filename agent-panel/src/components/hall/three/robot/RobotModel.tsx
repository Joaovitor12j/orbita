import { useFrame } from '@react-three/fiber'
import { createRef, useEffect, useMemo, useRef, type MutableRefObject } from 'react'
import { Color, MeshBasicMaterial, type Group } from 'three'
import type { Agent } from '../../../../../shared/types'
import { colorOf } from '../../../../constants'
import { Dish, Magnifier, Pen, Terminal } from './accessories'
import { cyl, rbox, sph, torus } from './geometry'
import { paletteFor, type Palette } from './materials'
import { corePulse, pose, type Motion, type Parts } from './rig'
import { variantOf, type Variant } from './variants'
import { useHot } from '../glow'

const SIDES = [-1, 1] as const
const GREY = '#475569'

const makeParts = (): Parts => ({
  hip: createRef(), torso: createRef(), head: createRef(), antenna: createRef(), eyeL: createRef(), eyeR: createRef(),
  shoulderL: createRef(), shoulderR: createRef(), elbowL: createRef(), elbowR: createRef(),
  legL: createRef(), legR: createRef(), kneeL: createRef(), kneeR: createRef(),
})

interface LimbProps {
  v: Variant
  pal: Palette
  hull: ReturnType<Palette['hull']>
  parts: Parts
}

function Leg({ side, v, pal, hull, parts }: LimbProps & { side: -1 | 1 }) {
  const thigh = v.legLen * 0.5
  const shin = v.legLen * 0.5
  const l = v.limb
  return (
    <group ref={side < 0 ? parts.legL : parts.legR} position={[side * 0.115 * v.torsoW, -0.03, 0]}>
      <mesh geometry={sph(0.048 * l)} material={pal.dark} />
      <mesh geometry={cyl(0.04 * l, 0.035 * l, thigh, 10)} material={pal.steel} position={[0, -thigh / 2, 0]} />
      <mesh geometry={rbox(0.085 * l, thigh * 0.55, 0.02, 0.008)} material={hull} position={[0, -thigh * 0.5, 0.04 * l]} />
      <group ref={side < 0 ? parts.kneeL : parts.kneeR} position={[0, -thigh, 0]}>
        <mesh geometry={sph(0.042 * l)} material={pal.dark} />
        <mesh geometry={rbox(0.08 * l, shin, 0.09 * l, 0.02)} material={pal.steel} position={[0, -shin / 2, 0]} />
        <mesh geometry={rbox(0.06 * l, shin * 0.6, 0.02, 0.008)} material={hull} position={[0, -shin * 0.5, 0.05 * l]} />
        <group position={[0, -shin, 0.02]}>
          <mesh geometry={rbox(0.115 * l, 0.06, 0.2, 0.025)} material={pal.dark} position={[0, -0.03, 0.035]} />
          <mesh geometry={rbox(0.1 * l, 0.03, 0.07, 0.012)} material={hull} position={[0, -0.012, 0.1]} />
          {v.thrusters && (
            <mesh geometry={cyl(0.022, 0.03, 0.04, 10)} material={pal.metal} position={[0, -0.03, -0.075]} rotation={[Math.PI / 2, 0, 0]} />
          )}
        </group>
      </group>
    </group>
  )
}

function Arm({ side, v, pal, hull, parts, tools, hot }: LimbProps & { side: -1 | 1; tools: ToolSet; hot: Hot }) {
  const l = v.limb
  const left = side < 0
  return (
    <group ref={left ? parts.shoulderL : parts.shoulderR} position={[side * (0.23 * v.torsoW + 0.075), 0.37, 0]}>
      <mesh geometry={sph(0.056 * l)} material={pal.dark} />
      {v.shoulder > 0 && (
        <>
          <mesh geometry={rbox(v.shoulder + 0.07, 0.09, 0.2, 0.03)} material={hull} position={[side * 0.025, 0.05, 0]} />
          <mesh geometry={rbox(v.shoulder + 0.075, 0.016, 0.205, 0.006)} material={v.gold ? pal.gold : pal.steel} position={[side * 0.025, 0.1, 0]} />
        </>
      )}
      <mesh geometry={cyl(0.036 * l, 0.032 * l, 0.17, 10)} material={pal.steel} position={[0, -0.105, 0]} />
      <group ref={left ? parts.elbowL : parts.elbowR} position={[0, -0.2, 0]}>
        <mesh geometry={sph(0.042 * l)} material={pal.dark} />
        <mesh geometry={rbox(0.07 * l, 0.17, 0.08 * l, 0.02)} material={pal.metal} position={[0, -0.1, 0]} />
        <mesh geometry={rbox(0.074 * l, 0.05, 0.085 * l, 0.015)} material={hull} position={[0, -0.04, 0]} />
        {!left && tools.bash && <Terminal pal={pal} hot={hot} />}
        <group position={[0, -0.2, 0]}>
          <mesh geometry={rbox(0.07 * l, 0.055, 0.075 * l, 0.015)} material={pal.dark} position={[0, -0.02, 0]} />
          {[-1, 1].map((c) => (
            <mesh key={c} geometry={rbox(0.02, 0.07, 0.03, 0.006)} material={pal.dark} position={[c * 0.026 * l, -0.075, 0.01]} />
          ))}
          {left && tools.read && <Magnifier pal={pal} hot={hot} />}
          {!left && tools.edit && <Pen pal={pal} hot={hot} />}
        </group>
      </group>
    </group>
  )
}

type Hot = ReturnType<typeof useHot>

interface ToolSet {
  bash: boolean
  read: boolean
  edit: boolean
  web: boolean
}

/**
 * Robô sci-fi articulado. A cor do agente vai no casco (placas, ombreiras, faixas e núcleo);
 * o resto é aço e metal neutros. Proporções e peças variam por modelo (`variants.ts`).
 */
export function RobotModel({ agent, dim, motion }: { agent: Agent; dim: boolean; motion: MutableRefObject<Motion> }) {
  const hot = useHot()
  const v = variantOf(agent.model)
  const visitor = agent.scopeId === 'visitor'
  const pal = paletteFor(dim ? 0.25 : visitor ? 0.7 : 1)
  const hex = agent.enabled ? colorOf(agent.color) : GREY
  const hull = pal.hull(agent.enabled ? hex : '#64748b')
  const parts = useMemo(makeParts, [])
  const has = (...names: string[]) => agent.tools.some((t) => names.includes(t))
  const tools: ToolSet = {
    bash: has('Bash'),
    read: has('Read', 'Grep', 'Glob'),
    edit: has('Edit', 'Write', 'NotebookEdit', 'TodoWrite'),
    web: has('WebFetch', 'WebSearch'),
  }

  // Núcleo do peito: material próprio, pulsa por robô.
  const coreMat = useMemo(() => new MeshBasicMaterial({ toneMapped: false }), [])
  useEffect(() => () => coreMat.dispose(), [coreMat])
  coreMat.transparent = dim || visitor
  coreMat.opacity = dim ? 0.25 : visitor ? 0.7 : 1
  const base = useRef(new Color())
  base.current.set(hot(hex, 2.4))

  const hipY = v.legLen + 0.09
  useFrame((state, dt) => {
    const t = state.clock.elapsedTime
    pose(parts, motion.current, t, Math.min(dt, 0.1), hipY)
    coreMat.color.copy(base.current).multiplyScalar(corePulse(motion.current, t))
  })

  const tw = v.torsoW
  const hs = v.headScale
  const eyeMat = pal.glow(hot(hex, 2.6))
  const trim = v.gold ? pal.gold : pal.steel

  return (
    <group>
      <group ref={parts.hip} position={[0, hipY, 0]}>
        <mesh geometry={rbox(0.3 * tw, 0.1, 0.2, 0.03)} material={pal.dark} />
        {SIDES.map((s) => (
          <Leg key={s} side={s} v={v} pal={pal} hull={hull} parts={parts} />
        ))}

        <group ref={parts.torso} position={[0, 0.04, 0]}>
          <mesh geometry={rbox(0.26 * tw, 0.08, 0.18, 0.02)} material={pal.dark} position={[0, 0.02, 0]} />
          <mesh geometry={rbox(0.46 * tw, 0.34, 0.3, 0.06)} material={hull} position={[0, 0.24, 0]} />
          <mesh geometry={rbox(0.34 * tw, 0.22, 0.04, 0.02)} material={pal.steel} position={[0, 0.26, 0.152]} />
          <mesh geometry={rbox(0.4 * tw, 0.012, 0.012, 0.004)} material={pal.dark} position={[0, 0.15, 0.152]} />
          <mesh geometry={rbox(0.4 * tw, 0.012, 0.012, 0.004)} material={pal.dark} position={[0, 0.36, 0.152]} />
          <mesh geometry={cyl(v.core, v.core, 0.025, 20)} material={coreMat} position={[0, 0.27, 0.178]} rotation={[Math.PI / 2, 0, 0]} />
          <mesh geometry={torus(v.core * 1.55, 0.009, 28)} material={trim} position={[0, 0.27, 0.173]} />
          <mesh geometry={sph(v.core * 0.38, 12)} material={pal.glow(hot('#ffffff', 2.6))} position={[0, 0.27, 0.19]} />
          {v.id === 'opus' && <mesh geometry={torus(v.core * 2.2, 0.007, 32)} material={pal.glow(hot(hex, 1.8))} position={[0, 0.27, 0.168]} />}
          {SIDES.map((s) => (
            <mesh key={s} geometry={rbox(0.012, 0.15, 0.012, 0.004)} material={pal.glow(hot(hex, 2.2))} position={[s * 0.185 * tw, 0.26, 0.153]} />
          ))}
          <mesh geometry={rbox(0.3 * tw, 0.26, 0.1, 0.03)} material={pal.steel} position={[0, 0.26, -0.2]} />
          {[-0.07, 0.07].map((x) => (
            <mesh key={x} geometry={cyl(0.028, 0.034, 0.06, 10)} material={pal.dark} position={[x, 0.1, -0.22]} />
          ))}
          {tools.web && <Dish pal={pal} hot={hot} />}

          {SIDES.map((s) => (
            <Arm key={s} side={s} v={v} pal={pal} hull={hull} parts={parts} tools={tools} hot={hot} />
          ))}

          <mesh geometry={cyl(0.045, 0.055, 0.07, 10)} material={pal.dark} position={[0, 0.44, 0]} />
          <group ref={parts.head} position={[0, 0.47, 0]}>
            <mesh geometry={rbox(0.34 * hs, 0.26 * hs, 0.3 * hs, 0.06)} material={pal.metal} position={[0, 0.13 * hs, 0]} />
            <mesh geometry={rbox(0.32 * hs, 0.05 * hs, 0.28 * hs, 0.02)} material={hull} position={[0, 0.265 * hs, 0]} />
            <mesh
              geometry={rbox((v.slimVisor ? 0.27 : 0.29) * hs, (v.slimVisor ? 0.07 : 0.13) * hs, 0.02, 0.01)}
              material={pal.visor}
              position={[0, 0.13 * hs, 0.152 * hs]}
            />
            {SIDES.map((s) => (
              <group key={s} ref={s < 0 ? parts.eyeL : parts.eyeR} position={[s * 0.075 * hs, 0.13 * hs, 0.166 * hs]}>
                <mesh geometry={rbox(0.07 * hs, v.slimVisor ? 0.035 : 0.06 * hs, 0.012, 0.006)} material={eyeMat} />
              </group>
            ))}
            {SIDES.map((s) => (
              <group key={s} position={[s * 0.19 * hs, 0.12 * hs, 0]}>
                <mesh geometry={cyl(0.052, 0.052, 0.05, 14)} material={hull} rotation={[0, 0, Math.PI / 2]} />
                <mesh geometry={cyl(0.026, 0.026, 0.055, 12)} material={pal.dark} rotation={[0, 0, Math.PI / 2]} />
              </group>
            ))}
            {v.crest && (
              <>
                <mesh geometry={rbox(0.06, 0.075, 0.25 * hs, 0.02)} material={pal.gold} position={[0, 0.31 * hs, 0]} />
                {SIDES.map((s) => (
                  <mesh key={s} geometry={rbox(0.03, 0.08, 0.18 * hs, 0.01)} material={trim} position={[s * 0.1, 0.3 * hs, -0.02]} rotation={[0, 0, s * -0.35]} />
                ))}
              </>
            )}
            <group ref={parts.antenna} position={[0, 0.29 * hs, -0.05]}>
              {(v.antennas === 2 ? SIDES : ([0] as const)).map((s) => (
                <group key={s} position={[s * 0.1 * hs, v.crest ? 0.05 : 0, 0]}>
                  <mesh geometry={cyl(0.008, 0.012, 0.14, 8)} material={pal.dark} position={[0, 0.07, 0]} />
                  <mesh geometry={sph(0.026, 12)} material={eyeMat} position={[0, 0.15, 0]} />
                </group>
              ))}
            </group>
          </group>
        </group>
      </group>
    </group>
  )
}

