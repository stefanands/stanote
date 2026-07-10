import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import type { SearchMatch, TreeNode, WorkspaceInfo } from '../shared/types'

function on<T>(channel: string, cb: (payload: T) => void): () => void {
  const listener = (_event: IpcRendererEvent, payload: T): void => cb(payload)
  ipcRenderer.on(channel, listener)
  return () => ipcRenderer.off(channel, listener)
}

// Arguments injectés par le main pour cette fenêtre précise.
const isNewWindow = process.argv.includes('--stanote-new')
const openArg = process.argv.find((a) => a.startsWith('--stanote-open='))
const openTarget = openArg ? openArg.slice('--stanote-open='.length) : null

const api = {
  platform: process.platform,
  isNewWindow,
  openTarget,
  onMenuAction: (cb: (action: string) => void): (() => void) => on<string>('menu:action', cb),
  setLocale: (locale: 'fr' | 'en'): void => {
    ipcRenderer.send('app:setLocale', locale)
  },
  search: {
    query: (root: string, query: string): Promise<SearchMatch[]> =>
      ipcRenderer.invoke('search:query', root, query)
  },
  pdf: {
    export: (html: string, defaultName: string): Promise<boolean> =>
      ipcRenderer.invoke('pdf:export', html, defaultName)
  },
  pty: {
    spawn: (opts: { cwd?: string; cols: number; rows: number }): Promise<void> =>
      ipcRenderer.invoke('pty:spawn', opts),
    input: (data: string): void => {
      ipcRenderer.send('pty:input', data)
    },
    resize: (cols: number, rows: number): void => {
      ipcRenderer.send('pty:resize', cols, rows)
    },
    kill: (): Promise<void> => ipcRenderer.invoke('pty:kill'),
    onData: (cb: (data: string) => void): (() => void) => on<string>('pty:data', cb),
    onExit: (cb: (code: number) => void): (() => void) => on<number>('pty:exit', cb)
  },
  fs: {
    readFile: (path: string): Promise<string> => ipcRenderer.invoke('fs:readFile', path),
    readBinary: (path: string): Promise<Uint8Array> => ipcRenderer.invoke('fs:readBinary', path),
    writeFile: (path: string, content: string): Promise<void> =>
      ipcRenderer.invoke('fs:writeFile', path, content),
    openFolder: (): Promise<WorkspaceInfo | null> => ipcRenderer.invoke('fs:openFolder'),
    openPath: (path: string): Promise<WorkspaceInfo | null> =>
      ipcRenderer.invoke('fs:openPath', path),
    create: (parentDir: string, name: string, type: 'file' | 'dir'): Promise<string> =>
      ipcRenderer.invoke('fs:create', parentDir, name, type),
    rename: (path: string, newName: string): Promise<string> =>
      ipcRenderer.invoke('fs:rename', path, newName),
    remove: (path: string): Promise<void> => ipcRenderer.invoke('fs:delete', path),
    reveal: (path: string): Promise<void> => ipcRenderer.invoke('fs:reveal', path),
    onTreeChanged: (cb: (tree: TreeNode[]) => void): (() => void) =>
      on<TreeNode[]>('fs:treeChanged', cb),
    onFileChanged: (cb: (path: string) => void): (() => void) =>
      on<string>('fs:fileChanged', cb)
  }
}

contextBridge.exposeInMainWorld('stancode', api)

export type StanCodeApi = typeof api
