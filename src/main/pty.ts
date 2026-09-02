import { app, ipcMain } from 'electron'
import * as pty from 'node-pty'
import { homedir } from 'os'

/** Plusieurs terminaux par fenêtre : Map<webContents.id, Map<idOnglet, pty>>. */
const byWin = new Map<number, Map<string, pty.IPty>>()

function terminalsOf(winId: number): Map<string, pty.IPty> {
  let m = byWin.get(winId)
  if (!m) {
    m = new Map()
    byWin.set(winId, m)
  }
  return m
}

function killProc(winId: number, termId: string): void {
  // On retire l'entrée avant kill() : l'onExit du processus tué voit qu'il
  // n'est plus le processus courant de l'onglet et n'envoie pas pty:exit.
  const terms = byWin.get(winId)
  if (!terms) return
  const p = terms.get(termId)
  terms.delete(termId)
  try {
    p?.kill()
  } catch {
    // déjà mort
  }
}

/** Env nettoyé pour le shell : les variables injectées par npm/electron-vite
 *  en dev (npm_config_*, …) rendent nvm et npm grognons dans le terminal. */
function shellEnv(): Record<string, string> {
  const env: Record<string, string> = {}
  for (const [key, value] of Object.entries(process.env)) {
    if (value === undefined) continue
    if (key.startsWith('npm_') || key.startsWith('ELECTRON_') || key.startsWith('VITE_')) continue
    env[key] = value
  }
  return env
}

export function disposePtyForWebContents(id: number): void {
  const terms = byWin.get(id)
  if (!terms) return
  for (const termId of [...terms.keys()]) killProc(id, termId)
  byWin.delete(id)
}

export function registerPtyHandlers(): void {
  ipcMain.handle(
    'pty:spawn',
    (event, termId: string, opts: { cwd?: string; cols: number; rows: number }): void => {
      const winId = event.sender.id
      killProc(winId, termId) // relance éventuelle du même onglet
      // Windows : ignorer SHELL (git-bash le renseigne avec un chemin unix
      // inexploitable par pty.spawn) et prendre PowerShell.
      const shell =
        process.platform === 'win32' ? 'powershell.exe' : process.env['SHELL'] || '/bin/zsh'
      const p = pty.spawn(shell, [], {
        name: 'xterm-256color',
        cwd: opts.cwd || homedir(),
        env: shellEnv(),
        cols: opts.cols,
        rows: opts.rows
      })
      terminalsOf(winId).set(termId, p)
      const sender = event.sender
      p.onData((data) => {
        if (byWin.get(winId)?.get(termId) === p && !sender.isDestroyed())
          sender.send('pty:data', termId, data)
      })
      p.onExit(({ exitCode }) => {
        const terms = byWin.get(winId)
        if (terms?.get(termId) !== p) return // tué volontairement : silencieux
        terms.delete(termId)
        if (!sender.isDestroyed()) sender.send('pty:exit', termId, exitCode)
      })
    }
  )

  ipcMain.on('pty:input', (event, termId: string, data: string) => {
    byWin.get(event.sender.id)?.get(termId)?.write(data)
  })

  ipcMain.on('pty:resize', (event, termId: string, cols: number, rows: number) => {
    const p = byWin.get(event.sender.id)?.get(termId)
    if (p && cols > 0 && rows > 0) p.resize(cols, rows)
  })

  ipcMain.handle('pty:kill', (event, termId: string) => killProc(event.sender.id, termId))

  app.on('before-quit', () => {
    for (const winId of [...byWin.keys()]) disposePtyForWebContents(winId)
  })
}
