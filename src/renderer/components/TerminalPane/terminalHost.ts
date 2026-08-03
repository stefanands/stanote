import { Terminal, type ITheme } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'
import { useWorkspace } from '../../stores/workspace'
import type { Theme } from '../../stores/theme'

// Palette neutralGraphite (night / day)
export const XTERM_THEMES: Record<Theme, ITheme> = {
  dark: {
    background: '#1c1f20',
    foreground: '#E7E8E7',
    cursor: '#87979F',
    selectionBackground: 'rgba(135, 151, 159, 0.32)'
  },
  light: {
    background: '#f5f5f5',
    foreground: '#242525',
    cursor: '#626D73',
    selectionBackground: 'rgba(98, 109, 115, 0.24)'
  }
}

// Instance unique par fenêtre (le module est propre à chaque renderer). Le
// terminal vit dans un élément DOM détaché, ré-attaché au panneau visible — il
// survit ainsi au démontage React (changement de disposition, masquage…).
let el: HTMLDivElement | null = null
let term: Terminal | null = null
let fit: FitAddon | null = null
let spawned = false
let detachedHolder: HTMLDivElement | null = null

export function getTerminalHost(theme: Theme, exitedText: string): HTMLDivElement {
  if (el && term) return el
  el = document.createElement('div')
  el.className = 'terminal-host'
  term = new Terminal({
    fontFamily: 'Menlo, Monaco, "Courier New", monospace',
    fontSize: 13,
    scrollback: 5000,
    macOptionIsMeta: true,
    theme: XTERM_THEMES[theme]
  })
  fit = new FitAddon()
  term.loadAddon(fit)
  term.open(el)
  term.onData((data) => window.stancode.pty.input(data))
  term.onResize(({ cols, rows }) => window.stancode.pty.resize(cols, rows))
  window.stancode.pty.onData((data) => term?.write(data))
  window.stancode.pty.onExit(() => term?.write(`\r\n\x1b[90m${exitedText}\x1b[0m\r\n`))
  new ResizeObserver(() => fitTerminal()).observe(el)
  return el
}

/** Sort l'hôte du DOM visible sans le détruire (démontage du panneau). */
export function detachTerminalHost(): void {
  if (!el) return
  if (!detachedHolder) detachedHolder = document.createElement('div')
  detachedHolder.appendChild(el)
}

export function fitTerminal(): void {
  if (el && el.clientWidth > 40 && el.clientHeight > 40) fit?.fit()
}

/** À la ré-attache (retour du mode Claude, changement de disposition) :
 *  recale la grille et force un rendu complet, sinon l'affichage peut rester
 *  vide jusqu'au prochain redimensionnement. */
export function refreshTerminal(): void {
  fitTerminal()
  if (term) {
    term.refresh(0, term.rows - 1)
    term.scrollToBottom()
  }
}

export function spawnTerminalIfNeeded(): void {
  if (spawned || !term) return
  spawned = true
  fit?.fit()
  window.stancode.pty.spawn({
    cwd: useWorkspace.getState().rootPath ?? undefined,
    cols: term.cols,
    rows: term.rows
  })
}

export function restartTerminal(): void {
  if (!term) return
  term.clear()
  fit?.fit()
  window.stancode.pty.spawn({
    cwd: useWorkspace.getState().rootPath ?? undefined,
    cols: term.cols,
    rows: term.rows
  })
}

export function setTerminalTheme(theme: Theme): void {
  if (term) term.options.theme = XTERM_THEMES[theme]
}
