import { app, BrowserWindow, dialog, ipcMain, net, protocol, shell } from 'electron'
import { randomUUID } from 'crypto'
import { promises as fsp } from 'fs'
import { createServer } from 'http'
import type { AddressInfo } from 'net'
import { join, resolve } from 'path'
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
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.bmp': 'image/bmp',
  '.ico': 'image/x-icon',
  '.webm': 'video/webm',
  '.mp4': 'video/mp4',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.map': 'application/json'
}

/** Origine http du serveur local. null tant que non démarré. */
let appServerOrigin: string | null = null

/* Jeton secret exigé pour servir un document de l'utilisateur : le serveur
   n'écoute que sur la boucle locale, mais tout processus de la machine pourrait
   sinon lire n'importe quel fichier via ce port. */
const docToken = randomUUID()

/** Sert le rendu buildé (out/renderer, y compris dans l'asar) et, sous
 *  `/__doc/<jeton>/<chemin>`, les documents de l'utilisateur pour l'aperçu HTML.
 *  Une VRAIE origine http est indispensable aux embeds YouTube (Claude FM, qui
 *  refuse file:// et les schemes custom, erreur 153) et permet aux aperçus HTML
 *  d'exécuter leur JavaScript dans une iframe isolée. */
function startAppServer(): Promise<string> {
  const rendererDir = join(__dirname, '../renderer')
  const docPrefix = `/__doc/${docToken}`
  return new Promise((resolve, reject) => {
    const server = createServer((req, res) => {
      void (async () => {
        try {
          const rawPath = decodeURIComponent((req.url ?? '/').split('?')[0])
          let file: string
          if (rawPath.startsWith('/__doc/')) {
            if (!rawPath.startsWith(docPrefix + '/')) {
              res.writeHead(403)
              res.end('Forbidden')
              return
            }
            // Chemin absolu du document ; sur Windows, « /C:/x » → « C:/x ».
            const docPath = rawPath.slice(docPrefix.length)
            file = /^\/[a-zA-Z]:\//.test(docPath) ? docPath.slice(1) : docPath
          } else {
            const rel = rawPath === '/' || rawPath === '' ? '/index.html' : rawPath
            file = join(rendererDir, rel.replace(/^(\.\.[/\\])+/, ''))
          }
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

/** URL d'aperçu d'un document local (null si le serveur n'a pas démarré).
 *  Le chemin est conservé tel quel dans l'URL : les ressources relatives du
 *  document (css, images, polices) se résolvent donc naturellement. */
function docUrl(path: string): string | null {
  if (!appServerOrigin) return null
  // Windows : « C:\dossier\page.html » → « /C:/dossier/page.html ».
  const urlPath = path.replace(/\\/g, '/').replace(/^(?![/])/, '/')
  return `${appServerOrigin}/__doc/${docToken}${encodeURI(urlPath)}`
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
    // La barre de titre est dessinée par l'app (onglets + boutons). macOS :
    // feux natifs incrustés ; Windows : contrôles natifs en surimpression, à
    // droite (le renderer réserve l'espace correspondant, voir --wco-right).
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'hidden',
    trafficLightPosition: { x: 14, y: 13 },
    ...(process.platform === 'win32'
      ? {
          titleBarOverlay: { color: '#141617', symbolColor: '#e7e8e7', height: 40 }
        }
      : {}),
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

// macOS : double-clic sur un .md dans le Finder.
app.on('open-file', (event, path) => {
  event.preventDefault()
  if (ready) createWindow({ openTarget: path })
  else openQueue.push(path)
})

/** Windows/Linux : le fichier ouvert arrive en argument de ligne de commande. */
function fileFromArgv(argv: string[]): string | null {
  const arg = argv
    .slice(1)
    .find((a) => !a.startsWith('-') && /\.(md|markdown|txt)$/i.test(a))
  return arg ? resolve(arg) : null
}

// Une seule instance sur Windows : les ouvertures suivantes sont transmises à
// l'instance en cours (sinon chaque double-clic lancerait une app séparée, avec
// un serveur local et une radio de plus).
if (process.platform !== 'darwin') {
  if (!app.requestSingleInstanceLock()) {
    app.quit()
  } else {
    app.on('second-instance', (_event, argv) => {
      const target = fileFromArgv(argv)
      if (target) createWindow({ openTarget: target })
      else {
        const win = BrowserWindow.getAllWindows()[0]
        if (win) {
          if (win.isMinimized()) win.restore()
          win.focus()
        }
      }
    })
  }
}

app.whenReady().then(async () => {
  registerFileProtocol()
  registerFsHandlers()
  registerPtyHandlers()
  registerSearchHandlers()
  registerClaudeHandlers()
  registerRadioHandlers()
  registerPdfHandler()
  setupMenu({ onNewWindow: () => createWindow({ isNew: true }) })
  // Serveur local : sert le rendu en prod (origine http valide pour YouTube /
  // Claude FM) et, dans les deux modes, les documents de l'aperçu HTML.
  try {
    appServerOrigin = await startAppServer()
  } catch (e) {
    console.error('serveur local indisponible', e)
  }
  ipcMain.handle('doc:url', (_event, path: string) => docUrl(path))

  // Windows : la surimpression des contrôles natifs suit le thème de l'app.
  ipcMain.on('window:titleBarTheme', (event, theme: 'dark' | 'light') => {
    if (process.platform !== 'win32') return
    const win = BrowserWindow.fromWebContents(event.sender)
    win?.setTitleBarOverlay(
      theme === 'light'
        ? { color: '#fafafa', symbolColor: '#242525', height: 40 }
        : { color: '#141617', symbolColor: '#e7e8e7', height: 40 }
    )
  })
  ready = true

  // Fichier passé au lancement : file d'attente macOS, ou argv (Windows/Linux).
  const argvTarget = process.platform === 'darwin' ? null : fileFromArgv(process.argv)
  if (openQueue.length > 0) {
    openQueue.forEach((p) => createWindow({ openTarget: p }))
    openQueue.length = 0
  } else if (argvTarget) {
    createWindow({ openTarget: argvTarget })
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
