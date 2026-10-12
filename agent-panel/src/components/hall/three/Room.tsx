import { Stars } from '@react-three/drei'
import { N } from '../layout'
import { useHot } from './glow'

const HALF = N / 2
const WALL_H = 4
const WINDOWS = [0.08, 0.37, 0.66].map((t) => ({ t, center: (t + 0.13) * N - HALF }))

const stars = Array.from({ length: 12 }, (_, i) => ({
  u: ((i * 37) % 100) / 100,
  v: ((i * 53) % 100) / 100,
  r: i % 2 ? 0.02 : 0.03,
}))

function Window({ center, earth }: { center: number; earth: boolean }) {
  const hot = useHot()
  const w = 0.26 * N
  return (
    <group position={[center, 2.25, 0.01]}>
      <mesh>
        <planeGeometry args={[w, 2.1]} />
        <meshBasicMaterial color="#0a0830" />
      </mesh>
      {stars.map((s, i) => (
        <mesh key={i} position={[(s.u - 0.5) * (w - 0.3), (s.v - 0.5) * 1.8, 0.01]}>
          <circleGeometry args={[s.r, 6]} />
          <meshBasicMaterial color={hot('#e2e8f0', 2.2)} toneMapped={false} />
        </mesh>
      ))}
      {earth && (
        <group position={[0.2, -0.1, 0.03]} scale={[1, 1, 0.06]}>
          <mesh>
            <sphereGeometry args={[0.95, 32, 24]} />
            <meshStandardMaterial color="#1d4ed8" emissive="#1e3a8a" emissiveIntensity={0.5} roughness={0.8} />
          </mesh>
          <mesh position={[-0.2, 0.25, 0.8]} scale={[0.42, 0.22, 0.3]}>
            <sphereGeometry args={[1, 16, 12]} />
            <meshStandardMaterial color="#16a34a" roughness={1} />
          </mesh>
          <mesh position={[0.35, -0.2, 0.8]} scale={[0.3, 0.16, 0.3]}>
            <sphereGeometry args={[1, 16, 12]} />
            <meshStandardMaterial color="#16a34a" roughness={1} />
          </mesh>
        </group>
      )}
      {[
        [0, 1.08, w + 0.16, 0.12],
        [0, -1.08, w + 0.16, 0.12],
        [-w / 2 - 0.04, 0, 0.12, 2.2],
        [w / 2 + 0.04, 0, 0.12, 2.2],
      ].map(([x, y, fw, fh], i) => (
        <mesh key={i} position={[x!, y!, 0.04]}>
          <boxGeometry args={[fw!, fh!, 0.08]} />
          <meshStandardMaterial color="#475569" roughness={0.6} />
        </mesh>
      ))}
    </group>
  )
}

function WallWithWindows({ rotationY, tint }: { rotationY: number; tint: string }) {
  return (
    <group rotation-y={rotationY}>
      <mesh position={[0, WALL_H / 2, -0.15]}>
        <boxGeometry args={[N + 0.6, WALL_H, 0.3]} />
        <meshStandardMaterial color={tint} roughness={0.9} />
      </mesh>
      <mesh position={[0, 0.16, 0.02]}>
        <boxGeometry args={[N, 0.32, 0.06]} />
        <meshStandardMaterial color="#334155" roughness={0.7} />
      </mesh>
      {WINDOWS.map((win, i) => (
        <Window key={win.t} center={win.center} earth={rotationY === 0 && i === 1} />
      ))}
    </group>
  )
}

/** Estação: piso com grade, duas paredes com janelas para o espaço e o céu estrelado ao redor. */
export function Room() {
  const hot = useHot()
  return (
    <>
      <color attach="background" args={['#030615']} />
      <Stars radius={70} depth={40} count={1800} factor={3.5} fade speed={0.4} />

      <mesh position={[0, -0.15, 0]}>
        <boxGeometry args={[N, 0.3, N]} />
        <meshStandardMaterial color="#1b2638" roughness={0.85} />
      </mesh>
      <gridHelper args={[N, N, '#334155', '#334155']} position={[0, 0.005, 0]} />
      <mesh rotation-x={-Math.PI / 2} position={[0, 0.01, 0]}>
        <ringGeometry args={[3.96, 4.04, 96]} />
        <meshBasicMaterial color={hot('#38bdf8', 1.6)} transparent opacity={0.28} depthWrite={false} />
      </mesh>

      <group position={[0, 0, -HALF]}>
        <WallWithWindows rotationY={0} tint="#1e293b" />
      </group>
      <group position={[-HALF, 0, 0]}>
        <WallWithWindows rotationY={Math.PI / 2} tint="#172033" />
      </group>
    </>
  )
}
