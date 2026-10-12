import { useFrame, type ThreeEvent } from '@react-three/fiber'
import { useRef, type MutableRefObject } from 'react'
import type { Group, Mesh, MeshBasicMaterial } from 'three'
import type { Agent } from '../../../../shared/types'
import { modelScale } from '../../Robot'
import { current, isWalking, type Roamer, type Tile } from '../../roam'
import { CENTER } from '../layout'
import { Label } from './overlay'
import { RobotModel } from './robot/RobotModel'
import type { Motion } from './robot/rig'
import { variantOf } from './robot/variants'
import { useHot } from './glow'

const DEFAULT_YAW = Math.PI / 4 // de frente para a câmera inicial

const turn = (from: number, to: number, k: number) => {
  const delta = ((((to - from) % (Math.PI * 2)) + Math.PI * 3) % (Math.PI * 2)) - Math.PI
  return from + delta * Math.min(1, k)
}

export interface UnitProps {
  agent: Agent
  tile: Tile
  /** Altura do apoio (cadeira). */
  y?: number
  /** Direção fixa; sem ela o robô olha para onde anda ou para a câmera. */
  yaw?: number
  roamers?: MutableRefObject<Map<string, Roamer>>
  working?: boolean
  dim?: boolean
  selected?: boolean
  hovered?: boolean
  seed?: number
  bubble?: string
  saying?: boolean
  /** Robô carregado pelo cursor: levantado e sem eventos. */
  ghost?: boolean
  onDown?: (e: ThreeEvent<PointerEvent>) => void
  onOver?: () => void
  onOut?: () => void
  onContext?: () => void
}

/** Posiciona, anima e rotula um robô; a posição vem do ladrilho ou do passeio (`roamers`). */
export function RobotUnit({
  agent, tile, y = 0, yaw, roamers, working = false, dim = false, selected = false, hovered = false, seed = 0,
  bubble = '', saying = false, ghost = false, onDown, onOver, onOut, onContext,
}: UnitProps) {
  const hot = useHot()
  const root = useRef<Group>(null)
  const model = useRef<Group>(null)
  const ring = useRef<Mesh>(null)
  const facing = useRef(yaw ?? DEFAULT_YAW)
  const scale = modelScale(agent.model)
  const variant = variantOf(agent.model)
  const motion = useRef<Motion>({ walking: false, working, enabled: agent.enabled, ghost, seed: seed % 997 })
  motion.current.working = working
  motion.current.enabled = agent.enabled
  motion.current.ghost = ghost
  motion.current.seed = seed % 997

  useFrame((state, dt) => {
    const g = root.current
    const m = model.current
    if (!g || !m) return
    const now = performance.now()
    const roamer = roamers?.current.get(agent.id)
    const at = roamer ? current(roamer, now) : tile
    const walking = Boolean(roamer && isWalking(roamer, now))
    motion.current.walking = walking
    g.position.set(at.x - CENTER, y + (ghost ? 0.35 : 0), at.y - CENTER)

    const target = yaw ?? (walking && roamer ? Math.atan2(roamer.x - roamer.fx, roamer.y - roamer.fy) : facing.current)
    facing.current = turn(facing.current, target, dt * 8)
    m.rotation.y = facing.current

    const t = state.clock.elapsedTime
    const material = ring.current?.material as MeshBasicMaterial | undefined
    if (material) material.opacity = 0.35 + 0.25 * Math.sin(t * 4)
  })

  const lift = (variant.height + 0.25) * scale
  return (
    <group ref={root}>
      {working && (
        <>
          <mesh rotation-x={-Math.PI / 2} position-y={0.02}>
            <circleGeometry args={[0.75, 32]} />
            <meshBasicMaterial color="#38bdf8" transparent opacity={0.16} depthWrite={false} />
          </mesh>
          <mesh ref={ring} rotation-x={-Math.PI / 2} position-y={0.03}>
            <ringGeometry args={[0.5, 0.58, 40]} />
            <meshBasicMaterial color={hot('#38bdf8', 2)} transparent opacity={0.5} depthWrite={false} toneMapped={false} />
          </mesh>
        </>
      )}
      {(selected || hovered) && !ghost && (
        <mesh rotation-x={-Math.PI / 2} position-y={0.035}>
          <ringGeometry args={[0.46, 0.5, 40]} />
          <meshBasicMaterial color={hot(selected ? '#7dd3fc' : '#38bdf8', 1.8)} transparent opacity={selected ? 0.95 : 0.6} depthWrite={false} toneMapped={false} />
        </mesh>
      )}
      <group ref={model} scale={scale}>
        <RobotModel agent={agent} dim={dim} motion={motion} />
      </group>

      {!ghost && onDown && (
        <mesh
          position={[0, 0.6 * scale, 0]}
          onPointerDown={onDown}
          onPointerOver={(e) => {
            e.stopPropagation()
            document.body.style.cursor = 'grab'
            onOver?.()
          }}
          onPointerOut={() => {
            document.body.style.cursor = ''
            onOut?.()
          }}
          onContextMenu={(e) => {
            e.stopPropagation()
            e.nativeEvent.preventDefault()
            onContext?.()
          }}
        >
          <cylinderGeometry args={[0.38 * scale * variant.torsoW ** 0.5, 0.38 * scale * variant.torsoW ** 0.5, (variant.height - 0.1) * scale, 10]} />
          <meshBasicMaterial transparent opacity={0} depthWrite={false} />
        </mesh>
      )}
      {!ghost && onOver && !onDown && (
        <mesh position={[0, 0.6 * scale, 0]} onPointerOver={onOver} onPointerOut={onOut}>
          <cylinderGeometry args={[0.38 * scale, 0.38 * scale, 1.25 * scale, 10]} />
          <meshBasicMaterial transparent opacity={0} depthWrite={false} />
        </mesh>
      )}

      {!ghost && <Label className="h3-label" text={agent.name} />}
      {!ghost && !agent.enabled && <Label position={[0.25 * scale, (variant.height - 0.2) * scale, 0]} className="h3-zzz" text="z z z" />}
      {bubble && !ghost && <Label position={[0, lift, 0]} className={saying ? 'h3-bubble say' : 'h3-bubble'} text={bubble} />}
    </group>
  )
}
