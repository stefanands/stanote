import { create } from 'zustand'

export interface FontPair {
  id: string
  label: string
  title: string
  body: string
}

/** SF Pro = police d'interface système (San Francisco sur macOS). */
const SF_PRO = "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Inter', 'Segoe UI', system-ui, sans-serif"

/** Paires titre/corps pour l'affichage markdown uniquement. Les titres sont
 *  toujours rendus en gras (voir index.css). Polices système macOS, chacune
 *  suivie de son équivalent libre embarqué dans l'app (main.tsx), qui prend
 *  le relais sous Windows : Inter pour SF Pro et Optima, Jost pour Futura,
 *  Playfair Display pour Didot. */
const OPTIMA = '"Optima", "Inter", "Segoe UI", system-ui, sans-serif'

export const FONT_PAIRS: FontPair[] = [
  { id: 'sfpro', label: 'SF Pro', title: SF_PRO, body: SF_PRO },
  {
    id: 'didot-optima',
    label: 'Didot · Optima',
    title: '"Didot", "Bodoni 72", "Playfair Display", Georgia, serif',
    body: OPTIMA
  },
  {
    id: 'futura-optima',
    label: 'Futura · Optima',
    title: '"Futura", "Jost", "Trebuchet MS", system-ui, sans-serif',
    body: OPTIMA
  },
  {
    id: 'optima-sfpro',
    label: 'Optima · SF Pro',
    title: OPTIMA,
    body: SF_PRO
  }
]

function detectIndex(): number {
  const stored = Number(localStorage.getItem('stanote:fontPair'))
  return Number.isInteger(stored) && stored >= 0 && stored < FONT_PAIRS.length ? stored : 0
}

interface FontState {
  index: number
  cycle: () => void
}

export const useFont = create<FontState>((set, get) => ({
  index: detectIndex(),
  cycle: () => {
    const next = (get().index + 1) % FONT_PAIRS.length
    localStorage.setItem('stanote:fontPair', String(next))
    set({ index: next })
  }
}))

export function applyFont(index: number): void {
  const pair = FONT_PAIRS[index]
  const root = document.documentElement
  root.style.setProperty('--font-title', pair.title)
  root.style.setProperty('--font-body', pair.body)
}
