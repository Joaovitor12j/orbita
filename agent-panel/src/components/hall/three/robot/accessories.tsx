import { useFrame } from '@react-three/fiber'
import { useRef } from 'react'
import type { Group, Mesh } from 'three'
import { cyl, dome, rbox, sph, torus } from './geometry'
import type { Palette } from './materials'

type Hot = (hex: string, k?: number) => string | import('three').Color

interface Props {
  pal: Palette
  hot: Hot
}

/** Lupa na mão esquerda (Read, Grep, Glob): cabo, aro e lente luminosa. */
export function Magnifier({ pal, hot }: Props) {
  return (
    <group position={[0, -0.07, 0.03]} rotation={[-0.9, 0, 0]}>
      <mesh geometry={cyl(0.014, 0.014, 0.16, 8)} material={pal.dark} position={[0, -0.04, 0]} />
      <mesh geometry={torus(0.075, 0.014, 28)} material={pal.metal} position={[0, -0.18, 0]} />
      <mesh position={[0, -0.18, 0]} material={pal.glow(hot('#38bdf8', 1.6))}>
        <circleGeometry args={[0.07, 24]} />
      </mesh>
    </group>
  )
}

/** Caneta na mão direita (Edit, Write, NotebookEdit, TodoWrite): corpo e ponta amarela luminosa. */
export function Pen({ pal, hot }: Props) {
  return (
    <group position={[0, -0.06, 0.02]} rotation={[-0.8, 0, 0]}>
      <mesh geometry={cyl(0.014, 0.014, 0.2, 8)} material={pal.metal} position={[0, -0.04, 0]} />
      <mesh geometry={cyl(0.003, 0.014, 0.05, 8)} material={pal.glow(hot('#facc15', 2.2))} position={[0, -0.165, 0]} />
    </group>
  )
}

/** Terminal no antebraço direito (Bash): tela verde com cursor piscando. */
export function Terminal({ pal, hot }: Props) {
  const cursor = useRef<Mesh>(null)
  useFrame((state) => {
    if (cursor.current) cursor.current.visible = Math.floor(state.clock.elapsedTime * 2) % 2 === 0
  })
  return (
    <group position={[0.075, -0.1, 0]}>
      <mesh geometry={rbox(0.035, 0.15, 0.12, 0.012)} material={pal.dark} />
      <mesh position={[0.019, 0, 0]} material={pal.glow(hot('#4ade80', 1.3))}>
        <boxGeometry args={[0.004, 0.11, 0.09]} />
      </mesh>
      {[0.03, 0.005, -0.02].map((y, i) => (
        <mesh key={y} position={[0.022, y, -0.01 + i * 0.004]} material={pal.dark}>
          <boxGeometry args={[0.003, 0.008, 0.04 - i * 0.008]} />
        </mesh>
      ))}
      <mesh ref={cursor} position={[0.022, -0.045, -0.025]} material={pal.dark}>
        <boxGeometry args={[0.003, 0.012, 0.012]} />
      </mesh>
    </group>
  )
}

/** Antena parabólica nas costas (WebFetch, WebSearch): gira devagar. */
export function Dish({ pal, hot }: Props) {
  const spin = useRef<Group>(null)
  useFrame((_, dt) => {
    if (spin.current) spin.current.rotation.y += dt * 0.7
  })
  return (
    <group position={[0, 0.45, -0.2]}>
      <mesh geometry={cyl(0.012, 0.016, 0.1, 8)} material={pal.dark} position={[0, -0.04, 0]} />
      <group ref={spin} position={[0, 0.03, 0]}>
        <group rotation={[-1.0, 0, 0]}>
          <mesh geometry={dome(0.14, 22)} material={pal.metal} rotation={[Math.PI, 0, 0]} scale={[1, 0.45, 1]} />
          <mesh geometry={cyl(0.006, 0.006, 0.12, 6)} material={pal.dark} position={[0, 0.06, 0]} />
          <mesh geometry={sph(0.018, 10)} material={pal.glow(hot('#38bdf8', 2.2))} position={[0, 0.125, 0]} />
        </group>
      </group>
    </group>
  )
}
