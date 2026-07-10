import { app, ipcMain } from 'electron'
import * as pty from 'node-pty'
import { homedir } from 'os'

/** Un pty par fenêtre (webContents.id). */
const byWin = new Map<number, pty.IPty>()

function killProc(id: number): void {
  // On retire l'entrée avant kill() : l'onExit du processus tué voit qu'il
  // n'est plus le processus courant de la fenêtre et n'envoie pas pty:exit.
  const p = byWin.get(id)
  byWin.delete(id)
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
  killProc(id)
}

export function registerPtyHandlers(): void {
  ipcMain.handle('pty:spawn', (event, opts: { cwd?: string; cols: number; rows: number }): void => {
    const id = event.sender.id
    killProc(id)
    const shell =
      process.env['SHELL'] || (process.platform === 'win32' ? 'powershell.exe' : '/bin/zsh')
    const p = pty.spawn(shell, [], {
      name: 'xterm-256color',
      cwd: opts.cwd || homedir(),
      env: shellEnv(),
      cols: opts.cols,
      rows: opts.rows
    })
    byWin.set(id, p)
    const sender = event.sender
    p.onData((data) => {
      if (byWin.get(id) === p && !sender.isDestroyed()) sender.send('pty:data', data)
    })
    p.onExit(({ exitCode }) => {
      if (byWin.get(id) !== p) return // tué volontairement (relance) : silencieux
      byWin.delete(id)
      if (!sender.isDestroyed()) sender.send('pty:exit', exitCode)
    })
  })

  ipcMain.on('pty:input', (event, data: string) => {
    byWin.get(event.sender.id)?.write(data)
  })

  ipcMain.on('pty:resize', (event, cols: number, rows: number) => {
    const p = byWin.get(event.sender.id)
    if (p && cols > 0 && rows > 0) p.resize(cols, rows)
  })

  ipcMain.handle('pty:kill', (event) => killProc(event.sender.id))

  app.on('before-quit', () => {
    for (const id of [...byWin.keys()]) killProc(id)
  })
}
