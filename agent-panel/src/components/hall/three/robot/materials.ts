import { Color, MeshBasicMaterial, MeshStandardMaterial } from 'three'

/**
 * Materiais compartilhados do robô. Cada nível de opacidade (normal, visitante, esmaecido) tem a
 * sua própria paleta, criada uma vez; as peças só trocam de paleta, nunca de material.
 */
export interface Palette {
  steel: MeshStandardMaterial
  dark: MeshStandardMaterial
  metal: MeshStandardMaterial
  visor: MeshStandardMaterial
  gold: MeshStandardMaterial
  glass: MeshStandardMaterial
  hull: (hex: string) => MeshStandardMaterial
  /** Material luminoso (não é afetado pela iluminação nem pelo tone mapping). */
  glow: (color: Color | string) => MeshBasicMaterial
}

const palettes = new Map<number, Palette>()

export function paletteFor(opacity: number): Palette {
  const cached = palettes.get(opacity)
  if (cached) return cached

  const fade = <M extends MeshStandardMaterial | MeshBasicMaterial>(m: M): M => {
    if (opacity < 1) {
      m.transparent = true
      m.opacity = opacity
    }
    return m
  }
  const std = (color: string, metalness: number, roughness: number) => fade(new MeshStandardMaterial({ color, metalness, roughness }))

  const hulls = new Map<string, MeshStandardMaterial>()
  const glows = new Map<string, MeshBasicMaterial>()

  const palette: Palette = {
    steel: std('#334155', 0.75, 0.42),
    dark: std('#151b2b', 0.6, 0.5),
    metal: std('#b4bfd0', 0.8, 0.32),
    visor: std('#04060c', 0.95, 0.12),
    gold: std('#d9a62e', 0.95, 0.28),
    glass: fade(new MeshStandardMaterial({ color: '#7dd3fc', metalness: 0.1, roughness: 0.05, transparent: true, opacity: 0.35 * opacity })),
    hull(hex) {
      let m = hulls.get(hex)
      if (!m) {
        m = std(hex, 0.45, 0.38)
        hulls.set(hex, m)
      }
      return m
    },
    glow(color) {
      const c = typeof color === 'string' ? new Color(color) : color
      const key = `${c.r.toFixed(2)},${c.g.toFixed(2)},${c.b.toFixed(2)}`
      let m = glows.get(key)
      if (!m) {
        m = fade(new MeshBasicMaterial({ color: c.clone(), toneMapped: false }))
        glows.set(key, m)
      }
      return m
    },
  }
  palettes.set(opacity, palette)
  return palette
}
