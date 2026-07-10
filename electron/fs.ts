import { dialog, ipcMain, shell, type WebContents } from 'electron'
import { promises as fsp } from 'fs'
import { basename, dirname, join } from 'path'
import chokidar, { type FSWatcher } from 'chokidar'
import type { TreeNode, WorkspaceInfo } from '../shared/types'

const IGNORED = /(^|[/\\])(\.git|node_modules|\.DS_Store)([/\\]|$)/

/** Horodatage des écritures faites par l'app, pour ignorer nos propres
 *  événements chokidar (sinon chaque auto-save recharge l'éditeur).
 *  Global (indexé par chemin) : partagé sans risque entre fenêtres. */
const recentWrites = new Map<string, number>()
const SELF_WRITE_WINDOW_MS = 1000

/** État du système de fichiers propre à chaque fenêtre (webContents.id). */
interface WinFs {
  watcher: FSWatcher | null
  root: string | null
  refreshTimer: NodeJS.Timeout | null
}
const byWin = new Map<number, WinFs>()

function getWin(id: number): WinFs {
  let w = byWin.get(id)
  if (!w) {
    w = { watcher: null, root: null, refreshTimer: null }
    byWin.set(id, w)
  }
  return w
}

async function readTree(dirPath: string): Promise<TreeNode[]> {
  const entries = await fsp.readdir(dirPath, { withFileTypes: true })
  const nodes: TreeNode[] = []
  for (const entry of entries) {
    const fullPath = join(dirPath, entry.name)
    if (IGNORED.test(fullPath)) continue
    if (entry.isDirectory()) {
      nodes.push({
        name: entry.name,
        path: fullPath,
        type: 'dir',
        children: await readTree(fullPath)
      })
    } else if (entry.isFile()) {
      nodes.push({ name: entry.name, path: fullPath, type: 'file' })
    }
  }
  nodes.sort((a, b) =>
    a.type === b.type
      ? a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
      : a.type === 'dir'
        ? -1
        : 1
  )
  return nodes
}

function scheduleTreeRefresh(sender: WebContents): void {
  const win = getWin(sender.id)
  if (win.refreshTimer) clearTimeout(win.refreshTimer)
  win.refreshTimer = setTimeout(async () => {
    if (!win.root || sender.isDestroyed()) return
    try {
      sender.send('fs:treeChanged', await readTree(win.root))
    } catch {
      // le dossier a pu disparaître entre-temps
    }
  }, 300)
}

function startWatching(root: string, sender: WebContents): void {
  const win = getWin(sender.id)
  void win.watcher?.close()
  win.watcher = chokidar.watch(root, {
    ignored: (p: string) => IGNORED.test(p),
    ignoreInitial: true,
    depth: 10
  })
  win.watcher.on('all', (event, path) => {
    if (sender.isDestroyed()) return
    if (event === 'change') {
      const written = recentWrites.get(path)
      if (written && Date.now() - written < SELF_WRITE_WINDOW_MS) return
      sender.send('fs:fileChanged', path)
    } else {
      scheduleTreeRefresh(sender)
    }
  })
}

async function openWorkspace(root: string, sender: WebContents): Promise<WorkspaceInfo> {
  const tree = await readTree(root)
  getWin(sender.id).root = root
  startWatching(root, sender)
  return { root, name: basename(root), tree }
}

/** Ferme le watcher et libère l'état d'une fenêtre fermée. */
export function disposeFsForWebContents(id: number): void {
  const win = byWin.get(id)
  if (!win) return
  if (win.refreshTimer) clearTimeout(win.refreshTimer)
  void win.watcher?.close()
  byWin.delete(id)
}

export function registerFsHandlers(): void {
  ipcMain.handle('fs:openFolder', async (event): Promise<WorkspaceInfo | null> => {
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory', 'createDirectory']
    })
    if (result.canceled || result.filePaths.length === 0) return null
    return openWorkspace(result.filePaths[0], event.sender)
  })

  ipcMain.handle('fs:openPath', async (event, path: string): Promise<WorkspaceInfo | null> => {
    try {
      const stat = await fsp.stat(path)
      if (!stat.isDirectory()) return null
      return await openWorkspace(path, event.sender)
    } catch {
      return null
    }
  })

  ipcMain.handle(
    'fs:create',
    async (_event, parentDir: string, name: string, type: 'file' | 'dir'): Promise<string> => {
      const target = join(parentDir, name)
      if (type === 'dir') {
        await fsp.mkdir(target)
      } else {
        await fsp.writeFile(target, '', { flag: 'wx' })
      }
      return target
    }
  )

  ipcMain.handle('fs:rename', async (_event, path: string, newName: string): Promise<string> => {
    const target = join(dirname(path), newName)
    await fsp.rename(path, target)
    return target
  })

  ipcMain.handle('fs:delete', async (_event, path: string): Promise<void> => {
    await shell.trashItem(path)
  })

  ipcMain.handle('fs:reveal', (_event, path: string): void => {
    shell.showItemInFolder(path)
  })

  ipcMain.handle('fs:readFile', (_event, path: string): Promise<string> => {
    return fsp.readFile(path, 'utf-8')
  })

  ipcMain.handle('fs:readBinary', async (_event, path: string): Promise<Uint8Array> => {
    const buf = await fsp.readFile(path)
    return new Uint8Array(buf)
  })

  ipcMain.handle('fs:writeFile', async (_event, path: string, content: string): Promise<void> => {
    recentWrites.set(path, Date.now())
    await fsp.writeFile(path, content, 'utf-8')
  })
}
