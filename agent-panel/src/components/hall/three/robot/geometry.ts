import { BufferGeometry, CylinderGeometry, SphereGeometry, TorusGeometry } from 'three'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'

// Geometrias compartilhadas: criadas uma vez e reusadas por todos os robôs.
const cache = new Map<string, BufferGeometry>()

const get = <T extends BufferGeometry>(key: string, make: () => T): T => {
  let geometry = cache.get(key) as T | undefined
  if (!geometry) {
    geometry = make()
    cache.set(key, geometry)
  }
  return geometry
}

const k = (n: number) => Math.round(n * 1000) / 1000

/** Caixa de bordas arredondadas (largura, altura, profundidade, raio). */
export const rbox = (w: number, h: number, d: number, r = 0.025) =>
  get(`rb${k(w)},${k(h)},${k(d)},${k(r)}`, () => new RoundedBoxGeometry(w, h, d, 2, Math.min(r, w / 2 - 0.001, h / 2 - 0.001, d / 2 - 0.001)))

export const cyl = (top: number, bottom: number, h: number, seg = 14) =>
  get(`cy${k(top)},${k(bottom)},${k(h)},${seg}`, () => new CylinderGeometry(top, bottom, h, seg))

export const sph = (r: number, seg = 14) => get(`sp${k(r)},${seg}`, () => new SphereGeometry(r, seg, Math.max(8, seg - 4)))

export const dome = (r: number, seg = 20) =>
  get(`dm${k(r)},${seg}`, () => new SphereGeometry(r, seg, 10, 0, Math.PI * 2, 0, Math.PI / 2))

export const torus = (r: number, tube: number, seg = 24) => get(`to${k(r)},${k(tube)},${seg}`, () => new TorusGeometry(r, tube, 8, seg))
