import { useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react'
import { type Activity, type Agent, type AgentInput } from '../../shared/types'
import type { ScopeOption } from './AgentDrawer'
import { Bench } from './Bench'
import { HallInfo } from './hall/HallInfo'
import { Robot, modelScale } from './Robot'
import { BENCH_TILE, CENTER, N, SEATS, TABLE_RADIUS, TH, TW, bubbleText, buildWings, hash, matchAgent, project, seatKey, seatsAfterDrop, seatTiles, visitorAgent, visitorTile } from './hall/layout'
import { current, isWalking, step, type Roamer, type Tile } from './roam'

const WALL = 120
const SNAP = 48
const ROBOT_SCALE = 1.15
const VIEW = { x: -30, y: 10, w: 1060, h: 700 }
const MAX_ZOOM = 3.5

interface View {
  x: number
  y: number
  w: number
}

const FIT: View = { x: VIEW.x, y: VIEW.y, w: VIEW.w }

// Mantém a janela de visão dentro do cenário (com folga) para não se perder ao arrastar.
const clampView = (v: View): View => {
  const w = Math.min(VIEW.w, Math.max(VIEW.w / MAX_ZOOM, v.w))
  const h = (w * VIEW.h) / VIEW.w
  const slack = 60
  return {
    w,
    x: Math.min(VIEW.x + VIEW.w - w + slack, Math.max(VIEW.x - slack, v.x)),
    y: Math.min(VIEW.y + VIEW.h - h + slack, Math.max(VIEW.y - slack, v.y)),
  }
}

const seatPoints = seatTiles.map((t) => project(t.x, t.y))

const motes = Array.from({ length: 16 }, (_, i) => ({
  x: 60 + ((i * 197) % 880),
  y: 150 + ((i * 131) % 440),
  r: 1 + (i % 3) * 0.5,
  d: (i * 3) % 11,
  t: 9 + (i % 5) * 2,
}))


function Wall({ side }: { side: 'right' | 'left' }) {
  const a = project(0, 0)
  const b = side === 'right' ? project(N, 0) : project(0, N)
  const at = (t: number, h: number) => `${a.x + (b.x - a.x) * t},${a.y + (b.y - a.y) * t - h}`
  const windows = [0.08, 0.37, 0.66]
  return (
    <g>
      <polygon points={`${at(0, 0)} ${at(1, 0)} ${at(1, WALL)} ${at(0, WALL)}`} fill={side === 'right' ? '#1e293b' : '#172033'} />
      <polygon points={`${at(0, 0)} ${at(1, 0)} ${at(1, 10)} ${at(0, 10)}`} fill="#334155" />
      {windows.map((t, i) => (
        <g key={t}>
          <polygon points={`${at(t, 36)} ${at(t + 0.26, 36)} ${at(t + 0.26, 100)} ${at(t, 100)}`} fill="url(#space)" stroke="#475569" strokeWidth="3" />
          {[0, 1, 2, 3].map((s) => {
            const [px, py] = at(t + 0.03 + ((s * 37 + i * 11) % 14) / 100, 44 + ((s * 23 + i * 17) % 48)).split(',').map(Number)
            return <circle key={s} cx={px} cy={py} r={s % 2 ? 0.9 : 1.4} fill="#e2e8f0" className="star" style={{ animationDelay: `-${(s * 3 + i * 5) % 7}s` }} />
          })}
        </g>
      ))}
      {side === 'right' && (
        <>
          <clipPath id="earth-clip">
            <polygon points={`${at(0.37, 36)} ${at(0.63, 36)} ${at(0.63, 100)} ${at(0.37, 100)}`} />
          </clipPath>
          <g clipPath="url(#earth-clip)">
            <circle cx={a.x + (b.x - a.x) * 0.5} cy={a.y + (b.y - a.y) * 0.5 + 6} r="46" fill="#1d4ed8" />
            <path d={`M${a.x + (b.x - a.x) * 0.42} ${a.y + (b.y - a.y) * 0.42 - 8} q18 -14 34 2 q-10 14 -26 10z`} fill="#16a34a" opacity=".8" />
          </g>
        </>
      )}
    </g>
  )
}

function Table({ working }: { working: number }) {
  const c = project(CENTER, CENTER)
  const rx = TABLE_RADIUS * Math.SQRT2 * (TW / 2)
  const ry = TABLE_RADIUS * Math.SQRT2 * (TH / 2)
  const top = c.y - 30
  return (
    <g>
      <ellipse cx={c.x} cy={c.y + 4} rx={rx + 10} ry={ry + 6} fill="#000" opacity=".35" />
      <rect x={c.x - 14} y={top} width="28" height="30" fill="#334155" />
      <path d={`M${c.x - rx} ${top} v14 a${rx} ${ry} 0 0 0 ${rx * 2} 0 v-14z`} fill="#1e293b" />
      <ellipse cx={c.x} cy={top} rx={rx} ry={ry} fill="url(#tabletop)" stroke="#38bdf8" strokeWidth="2" />
      <ellipse cx={c.x} cy={top} rx={rx * 0.62} ry={ry * 0.62} fill="none" stroke="#38bdf8" strokeOpacity=".5" strokeDasharray="4 5" />
      <ellipse cx={c.x} cy={top - 4} rx={rx * 0.26} ry={ry * 0.26} fill="#38bdf8" opacity=".35" className="holo" />
      <ellipse cx={c.x} cy={top} rx={rx * 0.84} ry={ry * 0.84} fill="none" stroke="#38bdf8" strokeOpacity=".35" strokeWidth="1.5" strokeDasharray="14 10" className="table-spin" />
      <text x={c.x} y={top + 1} textAnchor="middle" className="table-label">
        CONSELHO
      </text>
      <text x={c.x} y={top + 12} textAnchor="middle" className={`table-count ${working ? 'on' : ''}`}>
        {working ? `${working} em ação` : 'em repouso'}
      </text>
    </g>
  )
}

function Chair({ occupied, active }: { occupied: boolean; active: boolean }) {
  return (
    <g>
      <ellipse cx="0" cy="3" rx="18" ry="8" fill="#000" opacity=".3" />
      <path d="M-14 -8 q14 -26 28 0z" fill="#334155" />
      <ellipse cx="0" cy="-8" rx="16" ry="8" fill={active ? '#38bdf8' : '#475569'} stroke={occupied ? '#38bdf8' : '#64748b'} strokeWidth="1.5" className={occupied || active ? '' : 'chair-empty'} />
    </g>
  )
}

interface DragState {
  agent: Agent
  x: number
  y: number
  fromSeat: number
  startX: number
  startY: number
  moved: boolean
}

export interface HallProps {
  agents: Agent[]
  visibleIds: Set<string>
  seats: (string | null)[]
  activity: Activity[]
  selectedId?: string
  onSeatsChange: (seats: (string | null)[]) => void
  onOpen: (agent: Agent) => void
  onToggle: (agent: Agent) => void
  scopes: ScopeOption[]
  defaultScope: string
  onBuild: (input: AgentInput) => Promise<boolean>
}

export function Hall({ agents, visibleIds, seats, activity, selectedId, onSeatsChange, onOpen, onToggle, scopes, defaultScope, onBuild }: HallProps) {
  const svgRef = useRef<SVGSVGElement>(null)
  const [drag, setDrag] = useState<DragState | null>(null)
  const [hoverId, setHoverId] = useState<string | null>(null)
  const [benchOpen, setBenchOpen] = useState(false)
  const [view, setView] = useState<View>(FIT)
  const viewRef = useRef<View>(FIT)
  const [panning, setPanning] = useState(false)
  const [follow, setFollow] = useState(false)
  const animRef = useRef(0)
  const positionsRef = useRef(new Map<string, { x: number; y: number }>())
  const seenWorking = useRef<Set<string> | null>(null)
  const roamers = useRef(new Map<string, Roamer>())
  const homesRef = useRef(new Map<string, Tile>())
  const freeRef = useRef(new Set<string>())
  const roamState = useRef({ benchUntil: 0 })
  const [, setTick] = useState(0)
  const dragRef = useRef<DragState | null>(null)

  const byKey = useMemo(() => new Map(agents.map((a) => [seatKey(a), a])), [agents])
  const cleanSeats = useMemo(() => seats.map((key) => (key && byKey.has(key) ? key : null)), [seats, byKey])

  // Liga cada subagente em execução ao robô de mesmo nome; o escopo do projeto da sessão tem prioridade.
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

  const toSvg = (event: { clientX: number; clientY: number }) => {
    const svg = svgRef.current
    const matrix = svg?.getScreenCTM()
    if (!svg || !matrix) return { x: 0, y: 0 }
    const point = svg.createSVGPoint()
    point.x = event.clientX
    point.y = event.clientY
    const mapped = point.matrixTransform(matrix.inverse())
    return { x: mapped.x, y: mapped.y }
  }

  const commitView = (next: View) => {
    const clamped = clampView(next)
    viewRef.current = clamped
    setView(clamped)
  }

  // Qualquer gesto do usuário interrompe a animação da câmera.
  const applyView = (next: View) => {
    if (animRef.current) cancelAnimationFrame(animRef.current)
    animRef.current = 0
    commitView(next)
  }

  const animateTo = (target: View) => {
    if (animRef.current) cancelAnimationFrame(animRef.current)
    const from = viewRef.current
    const goal = clampView(target)
    const start = performance.now()
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / 650)
      const k = 1 - Math.pow(1 - t, 3)
      commitView({ w: from.w + (goal.w - from.w) * k, x: from.x + (goal.x - from.x) * k, y: from.y + (goal.y - from.y) * k })
      animRef.current = t < 1 ? requestAnimationFrame(step) : 0
    }
    animRef.current = requestAnimationFrame(step)
  }

  const focusOn = (id: string) => {
    const spot = positionsRef.current.get(id)
    if (!spot) return
    const w = VIEW.w / 2.2
    const h = (w * VIEW.h) / VIEW.w
    animateTo({ w, x: spot.x - w / 2, y: spot.y - 50 - h / 2 })
  }

  // Aproxima ou afasta mantendo o ponto sob o cursor parado na tela.
  const zoomAt = (factor: number, anchor?: { x: number; y: number }) => {
    const v = viewRef.current
    const w = Math.min(VIEW.w, Math.max(VIEW.w / MAX_ZOOM, v.w / factor))
    const h = (v.w * VIEW.h) / VIEW.w
    const a = anchor ?? { x: v.x + v.w / 2, y: v.y + h / 2 }
    const ratio = w / v.w
    applyView({ w, x: a.x - (a.x - v.x) * ratio, y: a.y - (a.y - v.y) * ratio })
  }

  useEffect(() => {
    const svg = svgRef.current
    if (!svg) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const matrix = svg.getScreenCTM()
      if (!matrix) return
      const point = svg.createSVGPoint()
      point.x = e.clientX
      point.y = e.clientY
      const mapped = point.matrixTransform(matrix.inverse())
      zoomAt(Math.exp(-e.deltaY * 0.0015), { x: mapped.x, y: mapped.y })
    }
    svg.addEventListener('wheel', onWheel, { passive: false })
    return () => svg.removeEventListener('wheel', onWheel)
  }, [])

  const startPan = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (event.button !== 0 || (event.target as Element).closest('.robot-hit, .bench-hit')) return
    const svg = svgRef.current
    if (!svg) return
    const startX = event.clientX
    const startY = event.clientY
    const origin = viewRef.current
    const unitsPerPixel = origin.w / svg.clientWidth
    setPanning(true)
    const move = (e: PointerEvent) =>
      applyView({ ...origin, x: origin.x - (e.clientX - startX) * unitsPerPixel, y: origin.y - (e.clientY - startY) * unitsPerPixel })
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      setPanning(false)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  const nearestSeat = (x: number, y: number) => {
    let best = -1
    let bestDistance = SNAP
    seatPoints.forEach((p, i) => {
      const distance = Math.hypot(p.x - x, p.y - 8 - y)
      if (distance < bestDistance) {
        best = i
        bestDistance = distance
      }
    })
    return best
  }

  const drop = (agent: Agent, fromSeat: number, target: number) => {
    const next = seatsAfterDrop(cleanSeats, seatKey(agent), fromSeat, target)
    if (next) onSeatsChange(next)
  }

  const startDrag = (event: ReactPointerEvent, agent: Agent, fromSeat: number) => {
    if (event.button !== 0) return
    event.preventDefault()
    const p = toSvg(event)
    const state: DragState = { agent, x: p.x, y: p.y, fromSeat, startX: p.x, startY: p.y, moved: false }
    dragRef.current = state
    setDrag(state)

    const move = (e: PointerEvent) => {
      const current = dragRef.current
      if (!current) return
      const q = toSvg(e)
      const moved = current.moved || Math.hypot(q.x - current.startX, q.y - current.startY) > 5
      const next = { ...current, x: q.x, y: q.y, moved }
      dragRef.current = next
      setDrag(next)
    }
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      const current = dragRef.current
      dragRef.current = null
      setDrag(null)
      if (!current) return
      if (current.moved) drop(agent, current.fromSeat, nearestSeat(current.x, current.y))
      else onOpen(agent)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  const handlers = (agent: Agent, fromSeat: number) => ({
    onPointerDown: (e: ReactPointerEvent) => startDrag(e, agent, fromSeat),
    onPointerEnter: () => setHoverId(agent.id),
    onPointerLeave: () => setHoverId(null),
    onContextMenu: (e: React.MouseEvent) => {
      e.preventDefault()
      onToggle(agent)
    },
  })

  const unit = (agent: Agent, act: Activity | undefined, wander: boolean, seed: number, extra?: { walking?: boolean; say?: string }) => {
    const scale = modelScale(agent.model) * ROBOT_SCALE
    const bubble = act ? bubbleText(act) : (extra?.say ?? '')
    const animated = agent.enabled && !act
    const content = (
      <>
        {act && <ellipse cx="0" cy="2" rx="30" ry="12" className="work-glow" />}
        {act && <ellipse cx="0" cy="2" rx="24" ry="10" className="work-ring" />}
        <g transform={`scale(${scale})`}>
          <g className="arrive">
          <g className={act ? 'bob working' : extra?.walking ? 'bob walking' : animated ? 'bob' : ''} style={{ animationDelay: `-${seed % 4}s` }}>
            <Robot agent={agent} />
          </g>
          </g>
        </g>
        <text y="16" textAnchor="middle" className="robot-label">
          {agent.name}
        </text>
        {bubble && (
          <g transform={`translate(0 ${-82 * scale})`} className={act ? 'bubble' : 'bubble say'}>
            <rect x={-bubble.length * 2.75 - 8} y="-20" width={bubble.length * 5.5 + 16} height="18" rx="9" />
            <path d="M-4 -2 L0 5 L4 -2z" />
            <text y="-7.5" textAnchor="middle">
              {bubble}
            </text>
          </g>
        )}
      </>
    )
    if (!wander || !animated) return content
    const dx = ((seed % 21) - 10) * 0.8
    const dy = (((seed >> 3) % 11) - 5) * 0.5
    const style = { '--dx': `${dx}px`, '--dy': `${dy}px`, '--d': `${6 + (seed % 5)}s`, animationDelay: `-${seed % 7}s` } as CSSProperties
    return (
      <g className="wander" style={style}>
        {content}
      </g>
    )
  }

  const seatedKeys = new Set(cleanSeats.filter((key): key is string => Boolean(key)))
  // O robô arrastado continua no cálculo do piso, para os demais não mudarem de lugar enquanto ele é movido.
  const floorAgents = agents.filter((a) => !seatedKeys.has(seatKey(a)))
  const wings = buildWings(floorAgents)
  const dropSeat = drag?.moved ? nearestSeat(drag.x, drag.y) : -1

  const items: { key: string; depth: number; node: ReactNode }[] = [{ key: 'table', depth: CENTER * 2, node: <Table working={workingById.size + visitors.length} /> }]

  const positions = new Map<string, { x: number; y: number }>()
  const dim = (agent: Agent) => (visibleIds.has(agent.id) ? '' : 'dim')

  seatTiles.forEach((tile, i) => {
    const p = seatPoints[i]!
    const key = cleanSeats[i]
    const agent = key ? byKey.get(key) : undefined
    const shown = agent && agent.id !== drag?.agent.id ? agent : undefined
    if (shown) positions.set(shown.id, p)
    items.push({
      key: `seat-${i}`,
      depth: tile.x + tile.y,
      node: (
        <g transform={`translate(${p.x} ${p.y})`}>
          <Chair occupied={Boolean(shown)} active={dropSeat === i} />
          {shown && (
            <g transform="translate(0 -6)" className={`robot-hit ${selectedId === shown.id ? 'selected' : ''} ${dim(shown)}`} {...handlers(shown, i)}>
              {unit(shown, workingById.get(shown.id), false, hash(shown.id))}
            </g>
          )}
        </g>
      ),
    })
  })

  const homes = new Map<string, Tile>()
  const free = new Set<string>()
  const now = performance.now()
  for (const wing of wings) {
    for (const { agent, x, y } of wing.placements) {
      homes.set(agent.id, { x, y })
      if (agent.enabled && !workingById.has(agent.id) && agent.id !== drag?.agent.id) free.add(agent.id)
      if (agent.id === drag?.agent.id) continue
      const roamer = roamers.current.get(agent.id)
      const target = roamer ? { x: roamer.x, y: roamer.y } : { x, y }
      const at = roamer ? current(roamer, now) : target
      const walking = Boolean(roamer && isWalking(roamer, now))
      const say = roamer?.say && now >= roamer.say.from && now < roamer.say.until ? roamer.say.text : ''
      const p = project(target.x, target.y)
      positions.set(agent.id, p)
      items.push({
        key: agent.id,
        depth: at.x + at.y,
        node: (
          <g style={{ transform: `translate(${p.x}px, ${p.y}px)`, transition: walking ? `transform ${roamer!.dur}ms linear` : 'none' }}>
            <g className={`robot-hit ${selectedId === agent.id ? 'selected' : ''} ${dim(agent)}`} {...handlers(agent, -1)}>
              {unit(agent, workingById.get(agent.id), false, hash(agent.id), { walking, say })}
            </g>
          </g>
        ),
      })
    }
  }
  homesRef.current = homes
  freeRef.current = free

  const benchPoint = project(BENCH_TILE.x, BENCH_TILE.y)
  items.push({
    key: 'bench',
    depth: BENCH_TILE.x + BENCH_TILE.y,
    node: (
      <g
        transform={`translate(${benchPoint.x} ${benchPoint.y})`}
        className={`bench-hit ${benchOpen ? 'open' : ''}`}
        role="button"
        tabIndex={0}
        aria-label="Abrir a bancada de montagem"
        onClick={() => setBenchOpen((open) => !open)}
        onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && setBenchOpen((open) => !open)}
      >
        <ellipse cx="0" cy="6" rx="46" ry="16" fill="#000" opacity=".35" />
        <path d="M-40 -6 L0 -26 L40 -6 L0 14z" fill="#334155" stroke="#38bdf8" strokeWidth="1.5" />
        <path d="M-40 -6 L0 14 V30 L-40 10z" fill="#1e293b" />
        <path d="M40 -6 L0 14 V30 L40 10z" fill="#0f172a" />
        <ellipse cx="0" cy="-8" rx="16" ry="6" className="bench-ring" />
        <line x1="0" y1="-8" x2="0" y2="-40" stroke="#94a3b8" strokeWidth="3" strokeLinecap="round" />
        <line x1="0" y1="-40" x2="14" y2="-30" stroke="#94a3b8" strokeWidth="3" strokeLinecap="round" />
        <circle cx="14" cy="-29" r="3" fill="#38bdf8" className="blink" />
        <text y="44" textAnchor="middle" className="robot-label">
          bancada
        </text>
      </g>
    ),
  })

  // Visitantes: subagentes embutidos (Explore, general-purpose…) sem arquivo .md, presentes só enquanto trabalham.
  visitors.slice(0, 6).forEach((act, i) => {
    const tile = visitorTile(i)
    const p = project(tile.x, tile.y)
    const agent = visitorAgent(act)
    positions.set(agent.id, p)
    items.push({
      key: agent.id,
      depth: tile.x + tile.y,
      node: (
        <g
          transform={`translate(${p.x} ${p.y})`}
          onPointerEnter={() => setHoverId(agent.id)}
          onPointerLeave={() => setHoverId(null)}
        >
          {unit(agent, act, false, hash(agent.id))}
        </g>
      ),
    })
  })

  items.sort((a, b) => a.depth - b.depth)
  positionsRef.current = positions

  // Robô que representa uma atividade: o agente de mesmo nome ou, sem arquivo .md, o visitante.
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

  const hoverVisitor = visitors.find((v) => `visitor:${v.agentId}` === hoverId)
  const hover = hoverVisitor ? visitorAgent(hoverVisitor) : agents.find((a) => a.id === hoverId)
  const hoverActivity = hoverVisitor ?? (hover ? workingById.get(hover.id) : undefined)
  const feed = activity.slice(0, 4)
  const floor = [project(0, 0), project(N, 0), project(N, N), project(0, N)].map((p) => `${p.x},${p.y}`).join(' ')
  const ring = project(CENTER, CENTER)
  const pad = project(visitorTile(0).x, visitorTile(0).y)

  return (
    <div className="hall">
      <svg
        ref={svgRef}
        viewBox={`${view.x} ${view.y} ${view.w} ${(view.w * VIEW.h) / VIEW.w}`}
        className={`hall-svg ${panning ? 'panning' : ''}`}
        onPointerDown={startPan}
        onDoubleClick={(e) => !(e.target as Element).closest('.robot-hit, .bench-hit') && applyView(FIT)} role="img" aria-label="Salão dos agentes">
        <defs>
          <linearGradient id="floorgrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#1e293b" />
            <stop offset="1" stopColor="#0f172a" />
          </linearGradient>
          <linearGradient id="space" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#020617" />
            <stop offset="1" stopColor="#1e1b4b" />
          </linearGradient>
          <radialGradient id="glow">
            <stop offset="0" stopColor="#38bdf8" stopOpacity=".28" />
            <stop offset="1" stopColor="#38bdf8" stopOpacity="0" />
          </radialGradient>
          <radialGradient id="workglow">
            <stop offset="0" stopColor="#38bdf8" stopOpacity=".55" />
            <stop offset="1" stopColor="#38bdf8" stopOpacity="0" />
          </radialGradient>
          <radialGradient id="tabletop">
            <stop offset="0" stopColor="#334155" />
            <stop offset="1" stopColor="#1e293b" />
          </radialGradient>
        </defs>

        <Wall side="left" />
        <Wall side="right" />
        <polygon points={floor} fill="url(#floorgrad)" stroke="#334155" strokeWidth="3" />
        {Array.from({ length: N - 1 }, (_, i) => {
          const a = project(i + 1, 0)
          const b = project(i + 1, N)
          const c = project(0, i + 1)
          const d = project(N, i + 1)
          return (
            <g key={i} stroke="#475569" strokeOpacity=".22">
              <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} />
              <line x1={c.x} y1={c.y} x2={d.x} y2={d.y} />
            </g>
          )
        })}
        <ellipse cx={ring.x} cy={ring.y} rx={4 * Math.SQRT2 * (TW / 2)} ry={4 * Math.SQRT2 * (TH / 2)} fill="none" stroke="#38bdf8" strokeOpacity=".25" strokeWidth="2" strokeDasharray="2 8" />
        <ellipse cx={ring.x} cy={ring.y} rx="330" ry="170" fill="url(#glow)" pointerEvents="none" />
        {wings.map((wing) => {
          const pts = wing.placements.map((pl) => project(pl.x, pl.y))
          const frontPoint = pts.reduce((best, q) => (q.y > best.y ? q : best), pts[0]!)
          const cx = frontPoint.x
          const front = frontPoint.y
          return (
            <g key={wing.key} pointerEvents="none">
              {wing.placements.map((pl) => {
                const q = project(pl.x, pl.y)
                const w = TW * 0.78
                const h = TH * 0.78
                return (
                  <polygon
                    key={pl.agent.id}
                    points={`${q.x},${q.y - h / 2} ${q.x + w / 2},${q.y} ${q.x},${q.y + h / 2} ${q.x - w / 2},${q.y}`}
                    fill={`hsl(${wing.hue} 70% 60% / .18)`}
                    stroke={`hsl(${wing.hue} 70% 65% / .55)`}
                    strokeWidth="1"
                  />
                )
              })}
              <text x={cx} y={front + 30} textAnchor="middle" className="wing-label" style={{ fill: `hsl(${wing.hue} 80% 75%)` }}>
                ALA · {wing.label.toUpperCase()}
              </text>
            </g>
          )
        })}
        {cleanSeats.map((key, i) => {
          const agent = key ? byKey.get(key) : undefined
          if (!agent || !workingById.has(agent.id)) return null
          const q = seatPoints[i]!
          return <line key={`beam-${i}`} x1={q.x} y1={q.y - 20} x2={ring.x} y2={ring.y - 30} className="beam" pointerEvents="none" />
        })}
        <text x={pad.x} y={pad.y + 34} textAnchor="middle" className="pad-label">
          DOCA DE VISITANTES
        </text>

        {items.map((item) => (
          <g key={item.key}>{item.node}</g>
        ))}

        {motes.map((m, i) => (
          <circle key={i} cx={m.x} cy={m.y} r={m.r} className="mote" style={{ animationDelay: `-${m.d}s`, animationDuration: `${m.t}s` }} pointerEvents="none" />
        ))}

        {drag && drag.moved && (
          <g transform={`translate(${drag.x} ${drag.y + 10})`} className="dragging" pointerEvents="none">
            <g transform={`scale(${modelScale(drag.agent.model) * ROBOT_SCALE})`}>
              <Robot agent={drag.agent} />
            </g>
          </g>
        )}
      </svg>

      <div className="hall-zoom" role="group" aria-label="Zoom do salão">
        <button type="button" onClick={() => zoomAt(1.4)} aria-label="Aproximar" disabled={view.w <= VIEW.w / MAX_ZOOM + 0.5}>
          +
        </button>
        <button type="button" onClick={() => zoomAt(1 / 1.4)} aria-label="Afastar" disabled={view.w >= VIEW.w - 0.5}>
          −
        </button>
        <button type="button" className={follow ? 'on' : ''} aria-pressed={follow} onClick={() => setFollow((f) => !f)} aria-label="Seguir a atividade" title="Seguir a atividade: a câmera vai até quem começa a trabalhar">
          ◎
        </button>
        <button type="button" onClick={() => applyView(FIT)} aria-label="Ver o salão inteiro" title="Ver o salão inteiro">
          ⤢
        </button>
      </div>
      {benchOpen && <Bench scopes={scopes} defaultScope={defaultScope} onBuild={onBuild} onClose={() => setBenchOpen(false)} />}

      <HallInfo
        hover={hover}
        hoverActivity={hoverActivity}
        feed={feed}
        canFocus={(act) => positions.has(robotOf(act))}
        onFocus={(act) => focusOn(robotOf(act))}
      />
    </div>
  )
}
