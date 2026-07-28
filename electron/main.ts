import { app, BrowserWindow, dialog, ipcMain, net, protocol, shell } from 'electron'
import { promises as fsp } from 'fs'
import { createServer } from 'http'
import type { AddressInfo } from 'net'
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

const APP_MIME: Record<string, string> = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.webm': 'video/webm',
  '.mp4': 'video/mp4',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.map': 'application/json'
}

/** Origine http du rendu packagé (serveur local). null tant que non démarré. */
let appServerOrigin: string | null = null

/** Sert le rendu buildé (out/renderer, y compris dans l'asar) sur 127.0.0.1.
 *  Une VRAIE origine http est indispensable pour les embeds YouTube (Claude FM) :
 *  YouTube refuse file:// et les schemes custom (erreur 153). */
function startAppServer(): Promise<string> {
  const rendererDir = join(__dirname, '../renderer')
  return new Promise((resolve, reject) => {
    const server = createServer((req, res) => {
      void (async () => {
        try {
          let rel = decodeURIComponent((req.url ?? '/').split('?')[0])
          if (rel === '/' || rel === '') rel = '/index.html'
          const file = join(rendererDir, rel.replace(/^(\.\.[/\\])+/, ''))
          const data = await fsp.readFile(file)
          const ext = file.slice(file.lastIndexOf('.')).toLowerCase()
          res.writeHead(200, { 'content-type': APP_MIME[ext] ?? 'application/octet-stream' })
          res.end(data)
        } catch {
          res.writeHead(404)
          res.end('Not found')
        }
      })()
    })
    server.on('error', reject)
    // Port éphémère, lié à la boucle locale uniquement.
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address() as AddressInfo
      resolve(`http://127.0.0.1:${addr.port}`)
    })
  })
}

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

/* Radio : une seule radio pour toute l'app. L'état vit ici (source de vérité) ;
   toutes les fenêtres l'affichent et le pilotent, mais une seule — le « porteur »
   — produit réellement le son (un flux audio / une iframe ne peut vivre que dans
   une fenêtre). Si le porteur se ferme, la lecture est reprise par une autre. */
const radio: { index: number | null; isPlaying: boolean; ownerId: number | null } = {
  index: null,
  isPlaying: false,
  ownerId: null
}

function broadcastRadio(): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (win.webContents.isDestroyed()) continue
    win.webContents.send('radio:state', {
      index: radio.index,
      isPlaying: radio.isPlaying,
      isOwner: win.webContents.id === radio.ownerId
    })
  }
}

function registerRadioHandlers(): void {
  ipcMain.handle('radio:getState', (event) => ({
    index: radio.index,
    isPlaying: radio.isPlaying,
    isOwner: event.sender.id === radio.ownerId
  }))

  // Première fenêtre : sème la station mémorisée côté renderer (localStorage).
  ipcMain.on('radio:seed', (_event, index: number) => {
    if (radio.index === null) radio.index = index
  })

  ipcMain.on('radio:play', (event, index?: number) => {
    if (typeof index === 'number') radio.index = index
    radio.isPlaying = true
    radio.ownerId = event.sender.id // la fenêtre qui demande devient porteuse
    broadcastRadio()
  })

  ipcMain.on('radio:pause', () => {
    radio.isPlaying = false
    broadcastRadio()
  })
}

/** Le porteur se ferme : passer la main à une autre fenêtre pour ne pas couper. */
function handleRadioWindowClosed(id: number): void {
  if (radio.ownerId !== id) return
  const next = BrowserWindow.getAllWindows().find((w) => !w.webContents.isDestroyed())
  radio.ownerId = next ? next.webContents.id : null
  if (!next) radio.isPlaying = false
  broadcastRadio()
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
      // Radio : autorise la lecture auto (flux <audio> + iframe Claude FM).
      autoplayPolicy: 'no-user-gesture-required',
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
    handleRadioWindowClosed(id)
  })

  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  if (process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else if (appServerOrigin) {
    // Origine http locale plutôt que file:// → embeds YouTube (Claude FM) OK.
    win.loadURL(`${appServerOrigin}/index.html`)
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

app.whenReady().then(async () => {
  registerFileProtocol()
  registerFsHandlers()
  registerPtyHandlers()
  registerSearchHandlers()
  registerClaudeHandlers()
  registerRadioHandlers()
  registerPdfHandler()
  setupMenu({ onNewWindow: () => createWindow({ isNew: true }) })
  // En prod (pas de dev server), on sert le rendu en http local pour une origine
  // valide (YouTube/Claude FM). Ignoré en dev où ELECTRON_RENDERER_URL est défini.
  if (!process.env['ELECTRON_RENDERER_URL']) {
    try {
      appServerOrigin = await startAppServer()
    } catch (e) {
      console.error('serveur rendu local indisponible, repli file://', e)
    }
  }
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
