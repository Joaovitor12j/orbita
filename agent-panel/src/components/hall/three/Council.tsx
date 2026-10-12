import { Line } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { useRef } from 'react'
import type { Group } from 'three'
import { CENTER, TABLE_RADIUS, seatTiles } from '../layout'
import { Label } from './overlay'
import { useHot } from './glow'

const facingCenter = (x: number, y: number) => Math.atan2(CENTER - x, CENTER - y)

export interface SeatState {
  occupied: boolean
  active: boolean
  working: boolean
}

/** Mesa redonda do Conselho com holograma, anéis giratórios e as cadeiras. */
export function Council({ working, seats }: { working: number; seats: SeatState[] }) {
  const hot = useHot()
  const spin = useRef<Group>(null)
  const holo = useRef<Group>(null)

  useFrame((state, dt) => {
    if (spin.current) spin.current.rotation.y += dt * (working ? 0.6 : 0.2)
    if (holo.current) {
      holo.current.rotation.y -= dt * (working ? 1.4 : 0.5)
      holo.current.position.y = 1.35 + Math.sin(state.clock.elapsedTime * 1.5) * 0.06
    }
  })

  return (
    <group>
      <mesh position={[0, 0.4, 0]}>
        <cylinderGeometry args={[0.32, 0.5, 0.8, 24]} />
        <meshStandardMaterial color="#334155" roughness={0.6} metalness={0.3} />
      </mesh>
      <mesh position={[0, 0.86, 0]}>
        <cylinderGeometry args={[TABLE_RADIUS, TABLE_RADIUS - 0.06, 0.14, 48]} />
        <meshStandardMaterial color="#26344a" roughness={0.45} metalness={0.4} />
      </mesh>
      <mesh rotation-x={-Math.PI / 2} position={[0, 0.935, 0]}>
        <ringGeometry args={[TABLE_RADIUS - 0.05, TABLE_RADIUS, 64]} />
        <meshBasicMaterial color={hot('#38bdf8')} toneMapped={false} />
      </mesh>
      <group ref={spin} position={[0, 0.94, 0]}>
        <mesh rotation-x={-Math.PI / 2}>
          <ringGeometry args={[1.12, 1.15, 48, 1]} />
          <meshBasicMaterial color={hot('#38bdf8')} transparent opacity={0.45} toneMapped={false} />
        </mesh>
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <mesh key={i} rotation-x={-Math.PI / 2} position={[Math.cos((i * Math.PI) / 3) * 1.13, 0.002, Math.sin((i * Math.PI) / 3) * 1.13]}>
            <circleGeometry args={[0.04, 8]} />
            <meshBasicMaterial color={hot('#7dd3fc')} toneMapped={false} />
          </mesh>
        ))}
      </group>
      <group ref={holo} position={[0, 1.35, 0]}>
        <mesh>
          <octahedronGeometry args={[0.28, 0]} />
          <meshBasicMaterial color={hot('#38bdf8')} wireframe transparent opacity={working ? 0.95 : 0.55} toneMapped={false} />
        </mesh>
        <mesh scale={0.12}>
          <octahedronGeometry args={[1, 0]} />
          <meshBasicMaterial color={hot('#bae6fd', 3)} toneMapped={false} />
        </mesh>
      </group>
      <pointLight position={[0, 1.6, 0]} color="#38bdf8" intensity={working ? 7 : 3} distance={9} decay={2} />

      <Label position={[0, 2.05, 0]} className="h3-table-title" text="CONSELHO" />
      <Label position={[0, 1.85, 0]} className={working ? 'h3-table-sub on' : 'h3-table-sub'} text={working ? `${working} em ação` : 'em repouso'} />

      {seatTiles.map((tile, i) => {
        const state = seats[i]
        const yaw = facingCenter(tile.x, tile.y)
        return (
          <group key={i} position={[tile.x - CENTER, 0, tile.y - CENTER]} rotation-y={yaw}>
            <mesh position={[0, 0.16, 0]}>
              <cylinderGeometry args={[0.04, 0.05, 0.32, 8]} />
              <meshStandardMaterial color="#475569" metalness={0.5} roughness={0.5} />
            </mesh>
            <mesh position={[0, 0.3, 0]}>
              <cylinderGeometry args={[0.3, 0.3, 0.07, 24]} />
              <meshStandardMaterial
                color={state?.active ? '#38bdf8' : '#475569'}
                emissive={state?.active ? '#38bdf8' : state?.occupied ? '#0c4a6e' : '#000000'}
                emissiveIntensity={state?.active ? 0.9 : 0.6}
                roughness={0.6}
              />
            </mesh>
            <mesh position={[0, 0.55, -0.27]} rotation-x={-0.12}>
              <boxGeometry args={[0.5, 0.42, 0.06]} />
              <meshStandardMaterial color="#334155" roughness={0.7} />
            </mesh>
          </group>
        )
      })}

      {seats.map((s, i) =>
        s.working ? (
          <Line
            key={`beam-${i}`}
            points={[
              [seatTiles[i]!.x - CENTER, 0.95, seatTiles[i]!.y - CENTER],
              [0, 1.3, 0],
            ]}
            color={hot('#38bdf8', 2)}
            lineWidth={1.6}
            dashed
            dashSize={0.18}
            gapSize={0.12}
            transparent
            opacity={0.8}
          />
        ) : null,
      )}
    </group>
  )
}
