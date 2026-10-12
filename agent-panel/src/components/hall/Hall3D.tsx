import { CameraControls } from '@react-three/drei'
import { Bloom, EffectComposer } from '@react-three/postprocessing'
import { Canvas, useThree, type ThreeEvent } from '@react-three/fiber'
import { useEffect, useMemo, useRef, useState, type ElementRef } from 'react'
import { Box3, Plane, Raycaster, Vector2, Vector3 } from 'three'
import type { Activity, Agent } from '../../../shared/types'
import type { HallProps } from '../Hall'
import { Bench } from '../Bench'
import { current, step, type Roamer, type Tile } from '../roam'
import { HallInfo } from './HallInfo'
import {
  BENCH_TILE, CENTER, N, bubbleText, buildWings, hash, matchAgent, nearestSeatTile, seatKey, seatTiles,
  seatsAfterDrop, visitorAgent, visitorTile,
} from './layout'
import { Council, type SeatState } from './three/Council'
import { GlowContext } from './three/glow'
import { LabelContext, LabelLayer, LabelStore, LabelSync } from './three/overlay'
import { Bench3D, VisitorDock, Wings } from './three/Props3D'
import { RobotUnit } from './three/Robot3D'
import { Room } from './three/Room'

type Controls = ElementRef<typeof CameraControls>

const SEAT_Y = 0.33
const DRAG_THRESHOLD = 0.3
const FIT_POSITION: [number, number, number] = [19.5, 17, 19.5]
const FIT_TARGET: [number, number, number] = [0, 0.6, 0]
const WORLD_BOUNDS = new Box3(new Vector3(-9, 0, -9), new Vector3(9, 3, 9))

interface DragState {
  agent: Agent
  x: number
  y: number
  fromSeat: number
  startX: number
  startY: number
  moved: boolean
}

type Projector = (clientX: number, clientY: number) => Tile | null

/** Ponte entre a tela e o piso: converte a posição do ponteiro em ladrilhos (raio contra o plano y=0). */
function PointerBridge({ projectRef }: { projectRef: { current: Projector } }) {
  const { camera, gl } = useThree()
  useEffect(() => {
    const raycaster = new Raycaster()
    const floor = new Plane(new Vector3(0, 1, 0), 0)
    const hit = new Vector3()
    projectRef.current = (clientX, clientY) => {
      const rect = gl.domElement.getBoundingClientRect()
      const ndc = new Vector2(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1)
      raycaster.setFromCamera(ndc, camera)
      return raycaster.ray.intersectPlane(floor, hit) ? { x: hit.x + CENTER, y: hit.z + CENTER } : null
    }
  }, [camera, gl, projectRef])
  return null
}

export function Hall3D({ agents, visibleIds, seats, activity, selectedId, onSeatsChange, onOpen, onToggle, scopes, defaultScope, onBuild }: HallProps) {
  const labels = useMemo(() => new LabelStore(), [])
  const controlsRef = useRef<Controls>(null)
  const projectRef = useRef<Projector>(() => null)
  const [drag, setDrag] = useState<DragState | null>(null)
  const dragRef = useRef<DragState | null>(null)
  const [hoverId, setHoverId] = useState<string | null>(null)
  const [benchOpen, setBenchOpen] = useState(false)
  const [follow, setFollow] = useState(false)
  const [glow, setGlow] = useState(() => {
    try {
      return localStorage.getItem('orbita-glow') !== 'off'
    } catch {
      return true
    }
  })
  const [, setTick] = useState(0)
  const positionsRef = useRef(new Map<string, Tile>())
  const seenWorking = useRef<Set<string> | null>(null)
  const roamers = useRef(new Map<string, Roamer>())
  const homesRef = useRef(new Map<string, Tile>())
  const freeRef = useRef(new Set<string>())
  const roamState = useRef({ benchUntil: 0 })

  const byKey = useMemo(() => new Map(agents.map((a) => [seatKey(a), a])), [agents])
  const cleanSeats = useMemo(() => seats.map((key) => (key && byKey.has(key) ? key : null)), [seats, byKey])

  const { workingById, visitors } = useMemo(() => {
    const workingById = new Map<string, Activity>()
    const visitors: Activity[] = []
    for (const act of activity) {
      if (act.status !== 'working') continue
      const agent = matchAgent(agents, act)
      if (!agent) visitors.push(act)
      else if (!workingById.has(agent.id)) workingById.set(agent.id, act)
    }
    return { workingById, visitors }
  }, [activity, agents])

  // ---- câmera -------------------------------------------------------------------------------
  const toggleGlow = () =>
    setGlow((on) => {
      try {
        localStorage.setItem('orbita-glow', on ? 'off' : 'on')
      } catch {
        /* sem armazenamento: vale só nesta sessão */
      }
      return !on
    })

  const fit = () => void controlsRef.current?.setLookAt(...FIT_POSITION, ...FIT_TARGET, true)

  const zoom = (factor: number) => {
    const controls = controlsRef.current
    if (controls) void controls.dollyTo(controls.distance / factor, true)
  }

  const focusOn = (id: string) => {
    const controls = controlsRef.current
    const roamer = roamers.current.get(id)
    const spot = roamer ? current(roamer, performance.now()) : positionsRef.current.get(id)
    if (!controls || !spot) return
    const px = spot.x - CENTER
    const pz = spot.y - CENTER
    const offset = controls.getPosition(new Vector3()).sub(controls.getTarget(new Vector3())).setLength(9)
    void controls.setLookAt(px + offset.x, Math.max(offset.y, 3), pz + offset.z, px, 0.7, pz, true)
  }

  // ---- arrastar para uma cadeira ------------------------------------------------------------
  const startDrag = (event: ThreeEvent<PointerEvent>, agent: Agent, fromSeat: number) => {
    if (event.button !== 0) return
    event.stopPropagation()
    const start = projectRef.current(event.nativeEvent.clientX, event.nativeEvent.clientY) ?? { x: CENTER, y: CENTER }
    const controls = controlsRef.current
    if (controls) controls.enabled = false
    const state: DragState = { agent, x: start.x, y: start.y, fromSeat, startX: start.x, startY: start.y, moved: false }
    dragRef.current = state
    setDrag(state)

    const move = (e: PointerEvent) => {
      const c = dragRef.current
      const p = projectRef.current(e.clientX, e.clientY)
      if (!c || !p) return
      const moved = c.moved || Math.hypot(p.x - c.startX, p.y - c.startY) > DRAG_THRESHOLD
      const next = { ...c, x: p.x, y: p.y, moved }
      dragRef.current = next
      setDrag(next)
    }
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', up)
      if (controls) controls.enabled = true
      const c = dragRef.current
      dragRef.current = null
      setDrag(null)
      if (!c) return
      if (!c.moved) return onOpen(agent)
      const next = seatsAfterDrop(cleanSeats, seatKey(agent), c.fromSeat, nearestSeatTile(c.x, c.y))
      if (next) onSeatsChange(next)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', up)
  }

  const handlers = (agent: Agent, fromSeat: number) => ({
    onDown: (e: ThreeEvent<PointerEvent>) => startDrag(e, agent, fromSeat),
    onOver: () => setHoverId(agent.id),
    onOut: () => setHoverId((id) => (id === agent.id ? null : id)),
    onContext: () => onToggle(agent),
  })

  // ---- composição da cena -------------------------------------------------------------------
  const seatedKeys = new Set(cleanSeats.filter((key): key is string => Boolean(key)))
  const floorAgents = agents.filter((a) => !seatedKeys.has(seatKey(a)))
  const wings = buildWings(floorAgents)
  const dropSeat = drag?.moved ? nearestSeatTile(drag.x, drag.y) : -1
  const now = performance.now()

  const positions = new Map<string, Tile>()
  const homes = new Map<string, Tile>()
  const free = new Set<string>()

  const seatStates: SeatState[] = seatTiles.map((_, i) => {
    const key = cleanSeats[i]
    const agent = key ? byKey.get(key) : undefined
    return {
      occupied: Boolean(agent && agent.id !== drag?.agent.id),
      active: dropSeat === i,
      working: Boolean(agent && workingById.has(agent.id)),
    }
  })

  const seatedUnits = seatTiles.map((tile, i) => {
    const key = cleanSeats[i]
    const agent = key ? byKey.get(key) : undefined
    if (!agent || agent.id === drag?.agent.id) return null
    positions.set(agent.id, tile)
    const act = workingById.get(agent.id)
    return (
      <RobotUnit
        key={agent.id}
        agent={agent}
        tile={tile}
        y={SEAT_Y}
        yaw={Math.atan2(CENTER - tile.x, CENTER - tile.y)}
        working={Boolean(act)}
        dim={!visibleIds.has(agent.id)}
        selected={selectedId === agent.id}
        hovered={hoverId === agent.id}
        seed={hash(agent.id)}
        bubble={act ? bubbleText(act) : ''}
        {...handlers(agent, i)}
      />
    )
  })

  const floorUnits = wings.flatMap((wing) =>
    wing.placements.map(({ agent, x, y }) => {
      homes.set(agent.id, { x, y })
      if (agent.enabled && !workingById.has(agent.id) && agent.id !== drag?.agent.id) free.add(agent.id)
      if (agent.id === drag?.agent.id) return null
      const roamer = roamers.current.get(agent.id)
      positions.set(agent.id, roamer ? { x: roamer.x, y: roamer.y } : { x, y })
      const act = workingById.get(agent.id)
      const say = roamer?.say && now >= roamer.say.from && now < roamer.say.until ? roamer.say.text : ''
      return (
        <RobotUnit
          key={agent.id}
          agent={agent}
          tile={{ x, y }}
          roamers={roamers}
          working={Boolean(act)}
          dim={!visibleIds.has(agent.id)}
          selected={selectedId === agent.id}
          hovered={hoverId === agent.id}
          seed={hash(agent.id)}
          bubble={act ? bubbleText(act) : say}
          saying={!act && Boolean(say)}
          {...handlers(agent, -1)}
        />
      )
    }),
  )
  homesRef.current = homes
  freeRef.current = free

  const visitorUnits = visitors.slice(0, 6).map((act, i) => {
    const agent = visitorAgent(act)
    const tile = visitorTile(i)
    positions.set(agent.id, tile)
    return (
      <RobotUnit
        key={agent.id}
        agent={agent}
        tile={tile}
        working
        seed={hash(agent.id)}
        bubble={bubbleText(act)}
        onOver={() => setHoverId(agent.id)}
        onOut={() => setHoverId((id) => (id === agent.id ? null : id))}
      />
    )
  })
  positionsRef.current = positions

  const robotOf = (act: Activity) => matchAgent(agents, act)?.id ?? `visitor:${act.agentId}`

  // Passeio dos robôs ociosos; desligado quando o usuário prefere menos movimento.
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const world = { size: N, center: CENTER, tableClear: 3.5, bench: BENCH_TILE }
    const timer = window.setInterval(() => {
      if (document.hidden) return
      if (step(roamers.current, homesRef.current, freeRef.current, world, roamState.current, performance.now())) setTick((t) => t + 1)
    }, 400)
    return () => window.clearInterval(timer)
  }, [])

  // Modo seguir: a câmera vai até o subagente que acabou de começar a trabalhar.
  useEffect(() => {
    const working = new Set(activity.filter((a) => a.status === 'working').map((a) => a.agentId))
    const seen = seenWorking.current
    seenWorking.current = working
    if (!follow || !seen) return
    const fresh = activity.find((a) => a.status === 'working' && !seen.has(a.agentId))
    if (fresh) focusOn(robotOf(fresh))
  }, [activity])

  useEffect(() => {
    controlsRef.current?.setBoundary(WORLD_BOUNDS)
    return () => void (document.body.style.cursor = '')
  }, [])

  const hoverVisitor = visitors.find((v) => `visitor:${v.agentId}` === hoverId)
  const hover = hoverVisitor ? visitorAgent(hoverVisitor) : agents.find((a) => a.id === hoverId)
  const hoverActivity = hoverVisitor ?? (hover ? workingById.get(hover.id) : undefined)

  return (
    <div className="hall">
      <div className="hall-canvas" onContextMenu={(e) => e.preventDefault()} role="img" aria-label="Salão 3D dos agentes">
        <Canvas camera={{ position: FIT_POSITION, fov: 32, near: 0.1, far: 300 }} dpr={[1, 2]}>
         <GlowContext.Provider value={glow}>
         <LabelContext.Provider value={labels}>
          <LabelSync store={labels} />
          <ambientLight intensity={0.9} />
          <directionalLight position={[8, 14, 6]} intensity={1.6} />
          <hemisphereLight args={['#93c5fd', '#0f172a', 0.5]} />
          <Room />
          <Wings wings={wings} />
          <Council working={workingById.size + visitors.length} seats={seatStates} />
          <Bench3D open={benchOpen} onToggle={() => setBenchOpen((open) => !open)} />
          <VisitorDock count={visitors.length} />
          {seatedUnits}
          {floorUnits}
          {visitorUnits}
          {drag?.moved && <RobotUnit agent={drag.agent} tile={{ x: drag.x, y: drag.y }} ghost />}
          <PointerBridge projectRef={projectRef} />
          <CameraControls
            ref={controlsRef}
            makeDefault
            minDistance={5}
            maxDistance={40}
            minPolarAngle={0.15}
            maxPolarAngle={1.4}
            smoothTime={0.18}
          />
         </LabelContext.Provider>
          {glow && (
            <EffectComposer multisampling={4}>
              <Bloom mipmapBlur intensity={0.9} luminanceThreshold={1} luminanceSmoothing={0.2} radius={0.7} />
            </EffectComposer>
          )}
         </GlowContext.Provider>
        </Canvas>
        <LabelLayer store={labels} />
      </div>

      <div className="hall-zoom" role="group" aria-label="Câmera do salão">
        <button type="button" onClick={() => zoom(1.4)} aria-label="Aproximar">
          +
        </button>
        <button type="button" onClick={() => zoom(1 / 1.4)} aria-label="Afastar">
          −
        </button>
        <button type="button" className={follow ? 'on' : ''} aria-pressed={follow} onClick={() => setFollow((f) => !f)} aria-label="Seguir a atividade" title="Seguir a atividade: a câmera vai até quem começa a trabalhar">
          ◎
        </button>
        <button type="button" className={glow ? 'on' : ''} aria-pressed={glow} onClick={toggleGlow} aria-label="Brilho neon" title="Brilho neon (bloom): desligue em máquinas mais lentas">
          ✦
        </button>
        <button type="button" onClick={fit} aria-label="Ver o salão inteiro" title="Ver o salão inteiro">
          ⤢
        </button>
      </div>
      {benchOpen && <Bench scopes={scopes} defaultScope={defaultScope} onBuild={onBuild} onClose={() => setBenchOpen(false)} />}

      <HallInfo
        hover={hover}
        hoverActivity={hoverActivity}
        feed={activity.slice(0, 4)}
        canFocus={(act) => positions.has(robotOf(act))}
        onFocus={(act) => focusOn(robotOf(act))}
      />
    </div>
  )
}
