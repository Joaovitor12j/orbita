import { Line } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { useRef } from 'react'
import type { Mesh, MeshBasicMaterial } from 'three'
import { BENCH_TILE, CENTER, visitorTile, type Wing } from '../layout'
import { Label } from './overlay'
import { useHot } from './glow'

const TILE = 1.15
const half = TILE / 2

/** Quadrados no piso sob cada robô, coloridos por ala (escopo), e o rótulo da ala. */
export function Wings({ wings }: { wings: Wing[] }) {
  return (
    <group>
      {wings.map((wing) => {
        const front = wing.placements.reduce((best, p) => (p.x + p.y > best.x + best.y ? p : best), wing.placements[0]!)
        return (
          <group key={wing.key}>
            {wing.placements.map((p) => (
              <group key={p.agent.id} position={[p.x - CENTER, 0.012, p.y - CENTER]}>
                <mesh rotation-x={-Math.PI / 2}>
                  <planeGeometry args={[TILE, TILE]} />
                  <meshBasicMaterial color={`hsl(${wing.hue} 70% 60%)`} transparent opacity={0.17} depthWrite={false} />
                </mesh>
                <Line
                  points={[[-half, 0, -half], [half, 0, -half], [half, 0, half], [-half, 0, half], [-half, 0, -half]]}
                  color={`hsl(${wing.hue} 70% 65%)`}
                  lineWidth={1}
                  transparent
                  opacity={0.55}
                />
              </group>
            ))}
            <Label position={[front.x - CENTER + 0.5, 0.02, front.y - CENTER + 1.0]} className="h3-wing" text={`ALA · ${wing.label.toUpperCase()}`} />
          </group>
        )
      })}
    </group>
  )
}

/** Bancada de montagem: clique abre o painel de criação de agentes. */
export function Bench3D({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  const hot = useHot()
  const lamp = useRef<Mesh>(null)
  useFrame((state) => {
    const material = lamp.current?.material as MeshBasicMaterial | undefined
    if (material) material.opacity = 0.45 + 0.55 * Math.abs(Math.sin(state.clock.elapsedTime * 2.2))
  })
  return (
    <group
      position={[BENCH_TILE.x - CENTER, 0, BENCH_TILE.y - CENTER]}
      rotation-y={Math.PI / 4}
      onClick={(e) => {
        e.stopPropagation()
        onToggle()
      }}
      onPointerOver={() => (document.body.style.cursor = 'pointer')}
      onPointerOut={() => (document.body.style.cursor = '')}
    >
      <mesh position={[0, 0.3, 0]}>
        <boxGeometry args={[1.5, 0.6, 0.85]} />
        <meshStandardMaterial color="#26344a" roughness={0.6} metalness={0.3} />
      </mesh>
      <mesh position={[0, 0.62, 0]}>
        <boxGeometry args={[1.56, 0.06, 0.91]} />
        <meshStandardMaterial color="#334155" emissive={open ? '#38bdf8' : '#0c4a6e'} emissiveIntensity={open ? 0.8 : 0.35} />
      </mesh>
      <mesh rotation-x={-Math.PI / 2} position={[0, 0.655, 0]}>
        <ringGeometry args={[0.2, 0.26, 32]} />
        <meshBasicMaterial color={hot('#38bdf8')} toneMapped={false} />
      </mesh>
      <mesh position={[0.5, 1.05, 0]}>
        <cylinderGeometry args={[0.025, 0.025, 0.85, 8]} />
        <meshStandardMaterial color="#94a3b8" metalness={0.6} roughness={0.4} />
      </mesh>
      <mesh position={[0.3, 1.45, 0]} rotation-z={Math.PI / 2}>
        <cylinderGeometry args={[0.02, 0.02, 0.45, 8]} />
        <meshStandardMaterial color="#94a3b8" metalness={0.6} roughness={0.4} />
      </mesh>
      <mesh ref={lamp} position={[0.08, 1.42, 0]}>
        <sphereGeometry args={[0.06, 12, 12]} />
        <meshBasicMaterial color={hot('#38bdf8', 3)} transparent toneMapped={false} />
      </mesh>
      <Label position={[0, 0, 0.9]} className="h3-label" text="bancada" />
    </group>
  )
}

/** Doca onde pousam os subagentes embutidos (sem arquivo .md) enquanto trabalham. */
export function VisitorDock({ count }: { count: number }) {
  const hot = useHot()
  const first = visitorTile(0)
  return (
    <group>
      {Array.from({ length: Math.max(count, 1) }, (_, i) => {
        const t = visitorTile(i)
        return (
          <mesh key={i} rotation-x={-Math.PI / 2} position={[t.x - CENTER, 0.015, t.y - CENTER]}>
            <ringGeometry args={[0.5, 0.58, 32]} />
            <meshBasicMaterial color={hot('#a78bfa', 1.8)} transparent opacity={0.55} depthWrite={false} />
          </mesh>
        )
      })}
      <Label position={[first.x - CENTER - 1.4, 0.02, first.y - CENTER - 0.9]} className="h3-wing dock" text="DOCA DE VISITANTES" />
    </group>
  )
}
