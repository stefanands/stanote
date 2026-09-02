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

/* Un hôte par onglet de terminal. Chacun vit dans un élément DOM détaché,
   ré-attaché au panneau visible : il survit au démontage React (changement
   d'onglet, de disposition, passage en mode Claude…). */
interface Host {
  el: HTMLDivElement
  term: Terminal
  fit: FitAddon
  spawned: boolean
}

const hosts = new Map<string, Host>()
let detachedHolder: HTMLDivElement | null = null
let exitedLabel = ''

/* Un seul abonnement pour toute la fenêtre : les messages portent l'id de
   l'onglet, on les aiguille vers le bon terminal. */
window.stancode.pty.onData((termId, data) => hosts.get(termId)?.term.write(data))
window.stancode.pty.onExit((termId) => {
  hosts.get(termId)?.term.write(`\r\n\x1b[90m${exitedLabel}\x1b[0m\r\n`)
})

export function getTerminalHost(id: string, theme: Theme, exitedText: string): HTMLDivElement {
  exitedLabel = exitedText
  const existing = hosts.get(id)
  if (existing) return existing.el

  const el = document.createElement('div')
  el.className = 'terminal-host'
  const term = new Terminal({
    fontFamily: 'Menlo, Monaco, "Courier New", monospace',
    fontSize: 13,
    scrollback: 5000,
    macOptionIsMeta: true,
    theme: XTERM_THEMES[theme]
  })
  const fit = new FitAddon()
  term.loadAddon(fit)
  term.open(el)
  term.onData((data) => window.stancode.pty.input(id, data))
  term.onResize(({ cols, rows }) => window.stancode.pty.resize(id, cols, rows))
  new ResizeObserver(() => fitTerminal(id)).observe(el)

  hosts.set(id, { el, term, fit, spawned: false })
  return el
}

/** Sort l'hôte du DOM visible sans le détruire (changement d'onglet). */
export function detachTerminalHost(id: string): void {
  const host = hosts.get(id)
  if (!host) return
  if (!detachedHolder) detachedHolder = document.createElement('div')
  detachedHolder.appendChild(host.el)
}

export function fitTerminal(id: string): void {
  const host = hosts.get(id)
  if (host && host.el.clientWidth > 40 && host.el.clientHeight > 40) host.fit.fit()
}

/** À la ré-attache (retour du mode Claude, changement d'onglet ou de
 *  disposition) : recale la grille et force un rendu complet, sinon
 *  l'affichage peut rester vide jusqu'au prochain redimensionnement. */
export function refreshTerminal(id: string): void {
  fitTerminal(id)
  const host = hosts.get(id)
  if (host) {
    host.term.refresh(0, host.term.rows - 1)
    host.term.scrollToBottom()
  }
}

export function spawnTerminalIfNeeded(id: string): void {
  const host = hosts.get(id)
  if (!host || host.spawned) return
  host.spawned = true
  host.fit.fit()
  void window.stancode.pty.spawn(id, {
    cwd: useWorkspace.getState().rootPath ?? undefined,
    cols: host.term.cols,
    rows: host.term.rows
  })
}

export function restartTerminal(id: string): void {
  const host = hosts.get(id)
  if (!host) return
  host.term.clear()
  host.fit.fit()
  void window.stancode.pty.spawn(id, {
    cwd: useWorkspace.getState().rootPath ?? undefined,
    cols: host.term.cols,
    rows: host.term.rows
  })
}

/** Ferme un onglet : tue le shell et détruit l'instance xterm. */
export function disposeTerminal(id: string): void {
  const host = hosts.get(id)
  if (!host) return
  void window.stancode.pty.kill(id)
  host.term.dispose()
  host.el.remove()
  hosts.delete(id)
}

export function setTerminalTheme(theme: Theme): void {
  for (const host of hosts.values()) host.term.options.theme = XTERM_THEMES[theme]
}
