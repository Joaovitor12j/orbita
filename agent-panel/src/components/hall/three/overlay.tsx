import { useFrame } from '@react-three/fiber'
import { createContext, useContext, useEffect, useId, useRef, useSyncExternalStore, type RefObject } from 'react'
import { Vector3, type Object3D } from 'three'

// Rótulos em DOM comum sobre o canvas, posicionados por projeção a cada frame.
// Substitui o <Html> do drei, que abre uma raiz React por rótulo e falha ao desmontar.

interface LabelSpec {
  object: RefObject<Object3D | null>
  className: string
  text: string
}

export class LabelStore {
  readonly specs = new Map<string, LabelSpec>()
  readonly els = new Map<string, HTMLElement>()
  private listeners = new Set<() => void>()
  version = 0

  subscribe = (listener: () => void) => {
    this.listeners.add(listener)
    return () => void this.listeners.delete(listener)
  }
  getVersion = () => this.version

  set(id: string, spec: LabelSpec) {
    this.specs.set(id, spec)
    this.emit()
  }
  remove(id: string) {
    this.specs.delete(id)
    this.els.delete(id)
    this.emit()
  }
  private emit() {
    this.version++
    this.listeners.forEach((l) => l())
  }
}

export const LabelContext = createContext<LabelStore | null>(null)

/** Âncora no mundo 3D com um texto flutuante; `position` é relativo ao pai. */
export function Label({ position = [0, 0, 0], className, text }: { position?: [number, number, number]; className: string; text: string }) {
  const store = useContext(LabelContext)
  const ref = useRef<Object3D>(null)
  const id = useId()
  useEffect(() => {
    if (!store) return
    store.set(id, { object: ref, className, text })
    return () => store.remove(id)
  }, [store, id, className, text])
  return <object3D ref={ref} position={position} />
}

/** Camada DOM dos rótulos; fica por cima do canvas e não captura o mouse. */
export function LabelLayer({ store }: { store: LabelStore }) {
  useSyncExternalStore(store.subscribe, store.getVersion)
  return (
    <div className="h3-overlay" aria-hidden="true">
      {[...store.specs.entries()].map(([id, spec]) => (
        <div
          key={id}
          className="h3-anchor"
          ref={(el) => {
            if (el) store.els.set(id, el)
            else store.els.delete(id)
          }}
        >
          <div className={spec.className}>{spec.text}</div>
        </div>
      ))}
    </div>
  )
}

/** Dentro do <Canvas>: projeta cada âncora na tela e move o rótulo correspondente. */
export function LabelSync({ store }: { store: LabelStore }) {
  const point = useRef(new Vector3())
  useFrame(({ camera, gl }) => {
    const width = gl.domElement.clientWidth
    const height = gl.domElement.clientHeight
    for (const [id, spec] of store.specs) {
      const el = store.els.get(id)
      const object = spec.object.current
      if (!el || !object) continue
      object.getWorldPosition(point.current).project(camera)
      const behind = point.current.z > 1
      el.style.visibility = behind ? 'hidden' : 'visible'
      if (behind) continue
      el.style.transform = `translate(${((point.current.x + 1) / 2) * width}px, ${((1 - point.current.y) / 2) * height}px) translate(-50%, -50%)`
      el.style.zIndex = String(Math.round((1 - point.current.z) * 10000))
    }
  })
  return null
}
