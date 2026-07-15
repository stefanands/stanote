import { app, BrowserWindow, dialog, ipcMain, net, protocol, shell } from 'electron'
import { promises as fsp } from 'fs'
import { join } from 'path'
import { pathToFileURL } from 'url'

// Protocole interne servant les fichiers du disque à la visionneuse HTML :
// une iframe `stanote-file://local/<chemin>` a une vraie URL de base, donc les
// CSS/images/polices en chemins relatifs du document se chargent (impossible
// avec srcDoc). À déclarer avant app.whenReady.
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'stanote-file',
    privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true }
  }
])

function registerFileProtocol(): void {
  protocol.handle('stanote-file', (request) => {
    const { pathname } = new URL(request.url)
    return net.fetch(pathToFileURL(decodeURIComponent(pathname)).toString())
  })
}
import { registerFsHandlers, disposeFsForWebContents } from './fs'
import { registerPtyHandlers, disposePtyForWebContents } from './pty'
import { registerSearchHandlers, disposeSearchForWebContents } from './search'
import { registerClaudeHandlers, disposeClaudeForWebContents } from './claude'
import { registerContextMenu } from './contextMenu'
import { setupMenu } from './menu'

/** Rend un HTML d'impression en PDF via une fenêtre hors-écran, puis propose
 *  de l'enregistrer. Retourne true si le fichier a été écrit. */
function registerPdfHandler(): void {
  ipcMain.handle('pdf:export', async (event, html: string, defaultName: string): Promise<boolean> => {
    const off = new BrowserWindow({ show: false, webPreferences: { sandbox: false } })
    try {
      await off.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html))
      const pdf = await off.webContents.printToPDF({
        printBackground: true,
        pageSize: 'A4',
        margins: { marginType: 'custom', top: 0.6, bottom: 0.6, left: 0.6, right: 0.6 }
      })
      const parent = BrowserWindow.fromWebContents(event.sender) ?? undefined
      const res = await dialog.showSaveDialog(parent!, {
        defaultPath: `${defaultName}.pdf`,
        filters: [{ name: 'PDF', extensions: ['pdf'] }]
      })
      if (res.canceled || !res.filePath) return false
      await fsp.writeFile(res.filePath, pdf)
      return true
    } finally {
      off.destroy()
    }
  })
}

interface WindowOpts {
  /** Fenêtre créée à la demande (Nouvelle fenêtre) : ne restaure pas le dernier dossier. */
  isNew?: boolean
  /** Ouvre ce fichier (et son dossier parent) au démarrage de la fenêtre. */
  openTarget?: string
}

export function createWindow(opts: WindowOpts = {}): void {
  const additionalArguments: string[] = []
  if (opts.isNew) additionalArguments.push('--stanote-new')
  if (opts.openTarget) additionalArguments.push(`--stanote-open=${opts.openTarget}`)

  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 800,
    minHeight: 500,
    title: 'Stanote',
    backgroundColor: '#141617',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    trafficLightPosition: { x: 14, y: 13 },
    webPreferences: {
      preload: join(__dirname, '../preload/preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      additionalArguments
    }
  })

  const id = win.webContents.id
  registerContextMenu(win.webContents)
  // Langues du correcteur (macOS gère automatiquement via l'OS).
  if (process.platform !== 'darwin') {
    try {
      win.webContents.session.setSpellCheckerLanguages(['fr', 'en-US'])
    } catch {
      // langue non disponible : on garde la valeur par défaut
    }
  }
  win.webContents.on('destroyed', () => {
    disposeFsForWebContents(id)
    disposePtyForWebContents(id)
    disposeSearchForWebContents(id)
    disposeClaudeForWebContents(id)
  })

  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  if (process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

// File d'attente des fichiers ouverts via l'OS (double-clic sur un .md) avant
// que l'app soit prête ; l'événement open-file peut précéder app.whenReady.
let ready = false
const openQueue: string[] = []

app.on('open-file', (event, path) => {
  event.preventDefault()
  if (ready) createWindow({ openTarget: path })
  else openQueue.push(path)
})

app.whenReady().then(() => {
  registerFileProtocol()
  registerFsHandlers()
  registerPtyHandlers()
  registerSearchHandlers()
  registerClaudeHandlers()
  registerPdfHandler()
  setupMenu({ onNewWindow: () => createWindow({ isNew: true }) })
  ready = true

  if (openQueue.length > 0) {
    openQueue.forEach((p) => createWindow({ openTarget: p }))
    openQueue.length = 0
  } else {
    createWindow()
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
