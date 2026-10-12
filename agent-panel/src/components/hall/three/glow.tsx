import { createContext, useContext } from 'react'
import { Color } from 'three'

/** Liga o brilho (bloom). Sem ele, as cores "quentes" voltam ao tom original para não estourar no branco. */
export const GlowContext = createContext(false)

const cache = new Map<string, Color>()

/**
 * Devolve a cor com intensidade acima de 1 quando o bloom está ativo: o bloom é seletivo e só
 * realça o que passa do limiar de luminância; o resto da cena (iluminada) fica abaixo dele.
 */
export function useHot() {
  const on = useContext(GlowContext)
  return (hex: string, k = 2.4): string | Color => {
    if (!on) return hex
    const key = `${hex}:${k}`
    let color = cache.get(key)
    if (!color) {
      color = new Color(hex).multiplyScalar(k)
      cache.set(key, color)
    }
    return color
  }
}
