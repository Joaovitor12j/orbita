/** Silhueta e acabamento do robô por modelo do agente (haiku = batedor, sonnet = padrão, opus = comandante). */
export interface Variant {
  id: 'haiku' | 'sonnet' | 'opus' | 'neutral'
  /** Altura total aproximada (para balões e hitbox). */
  height: number
  headScale: number
  torsoW: number
  limb: number
  legLen: number
  /** Largura da ombreira; 0 = sem ombreira. */
  shoulder: number
  crest: boolean
  antennas: 1 | 2
  thrusters: boolean
  gold: boolean
  slimVisor: boolean
  core: number
}

const SONNET: Variant = {
  id: 'sonnet', height: 1.38, headScale: 1, torsoW: 1, limb: 1, legLen: 0.34, shoulder: 0.11,
  crest: false, antennas: 1, thrusters: false, gold: false, slimVisor: false, core: 0.06,
}

const VARIANTS: Record<string, Variant> = {
  haiku: {
    id: 'haiku', height: 1.32, headScale: 1.22, torsoW: 0.88, limb: 0.82, legLen: 0.3, shoulder: 0,
    crest: false, antennas: 1, thrusters: true, gold: false, slimVisor: true, core: 0.045,
  },
  sonnet: SONNET,
  opus: {
    id: 'opus', height: 1.62, headScale: 1.05, torsoW: 1.24, limb: 1.22, legLen: 0.37, shoulder: 0.2,
    crest: true, antennas: 2, thrusters: false, gold: true, slimVisor: false, core: 0.08,
  },
}

export const variantOf = (model: string): Variant => VARIANTS[model] ?? { ...SONNET, id: 'neutral' }
