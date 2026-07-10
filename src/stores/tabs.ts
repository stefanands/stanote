import { create } from 'zustand'

export interface Tab {
  path: string
  name: string
  dirty: boolean
  /** modifié sur le disque alors que l'onglet a des changements locaux */
  conflict: boolean
  /** incrémenté pour forcer le remount de l'éditeur (rechargement externe) */
  version: number
}

interface TabsState {
  tabs: Tab[]
  activePath: string | null
  contents: Record<string, string>
  openFile: (path: string) => Promise<void>
  activate: (path: string) => void
  cycle: (dir: 1 | -1) => void
  updateContent: (path: string, markdown: string) => void
  saveNow: (path: string) => Promise<void>
  saveActive: () => Promise<void>
  closeTab: (path: string) => Promise<void>
  closeActive: () => Promise<void>
  externalChange: (path: string) => Promise<void>
  reloadFromDisk: (path: string) => Promise<void>
  keepMine: (path: string) => void
  handleRenamed: (oldPath: string, newPath: string) => void
}

const AUTOSAVE_DELAY_MS = 500
const saveTimers = new Map<string, ReturnType<typeof setTimeout>>()

const EDITABLE = /\.(md|markdown|txt)$/i
export const isEditable = (path: string): boolean => EDITABLE.test(path)

export type FileKind = 'markdown' | 'pdf' | 'image' | 'html' | 'other'

export function fileKind(path: string): FileKind {
  const p = path.toLowerCase()
  if (EDITABLE.test(p)) return 'markdown'
  if (p.endsWith('.pdf')) return 'pdf'
  if (/\.(png|jpe?g|gif|webp|svg|bmp|ico|avif)$/.test(p)) return 'image'
  if (/\.(html?|htm)$/.test(p)) return 'html'
  return 'other'
}

const nameOf = (path: string): string => path.split('/').pop() ?? path

function patchTab(tabs: Tab[], path: string, patch: Partial<Tab>): Tab[] {
  return tabs.map((t) => (t.path === path ? { ...t, ...patch } : t))
}

export const useTabs = create<TabsState>((set, get) => ({
  tabs: [],
  activePath: null,
  contents: {},

  openFile: async (path) => {
    const { tabs } = get()
    if (tabs.some((t) => t.path === path)) {
      set({ activePath: path })
      return
    }
    let content = ''
    if (isEditable(path)) {
      try {
        content = await window.stancode.fs.readFile(path)
      } catch (err) {
        console.error(err)
        return
      }
    }
    set((s) => ({
      tabs: [...s.tabs, { path, name: nameOf(path), dirty: false, conflict: false, version: 0 }],
      activePath: path,
      contents: { ...s.contents, [path]: content }
    }))
  },

  activate: (path) => set({ activePath: path }),

  cycle: (dir) => {
    const { tabs, activePath } = get()
    if (tabs.length < 2 || !activePath) return
    const i = tabs.findIndex((t) => t.path === activePath)
    const next = tabs[(i + dir + tabs.length) % tabs.length]
    set({ activePath: next.path })
  },

  updateContent: (path, markdown) => {
    set((s) => ({
      contents: { ...s.contents, [path]: markdown },
      tabs: patchTab(s.tabs, path, { dirty: true })
    }))
    const existing = saveTimers.get(path)
    if (existing) clearTimeout(existing)
    saveTimers.set(
      path,
      setTimeout(() => {
        void get().saveNow(path)
      }, AUTOSAVE_DELAY_MS)
    )
  },

  saveNow: async (path) => {
    const timer = saveTimers.get(path)
    if (timer) {
      clearTimeout(timer)
      saveTimers.delete(path)
    }
    const { contents, tabs } = get()
    const tab = tabs.find((t) => t.path === path)
    if (!tab || !tab.dirty) return
    try {
      await window.stancode.fs.writeFile(path, contents[path] ?? '')
      set((s) => ({ tabs: patchTab(s.tabs, path, { dirty: false }) }))
    } catch (err) {
      console.error(err)
    }
  },

  saveActive: async () => {
    const { activePath } = get()
    if (activePath) await get().saveNow(activePath)
  },

  closeTab: async (path) => {
    await get().saveNow(path)
    set((s) => {
      const idx = s.tabs.findIndex((t) => t.path === path)
      const tabs = s.tabs.filter((t) => t.path !== path)
      const contents = { ...s.contents }
      delete contents[path]
      let activePath = s.activePath
      if (activePath === path) {
        activePath = tabs.length ? tabs[Math.min(idx, tabs.length - 1)].path : null
      }
      return { tabs, contents, activePath }
    })
  },

  closeActive: async () => {
    const { activePath } = get()
    if (activePath) await get().closeTab(activePath)
  },

  externalChange: async (path) => {
    const tab = get().tabs.find((t) => t.path === path)
    if (!tab || !isEditable(path)) return
    // Comparaison de contenu : si le disque correspond déjà à ce qu'on a en
    // mémoire, c'est notre propre écriture (auto-save) — on ne recharge pas,
    // ce qui évite de remonter l'éditeur et de perdre le curseur.
    let disk: string
    try {
      disk = await window.stancode.fs.readFile(path)
    } catch {
      return
    }
    if (disk === get().contents[path]) return
    if (tab.dirty) {
      set((s) => ({ tabs: patchTab(s.tabs, path, { conflict: true }) }))
    } else {
      set((s) => ({
        contents: { ...s.contents, [path]: disk },
        tabs: patchTab(s.tabs, path, {
          dirty: false,
          conflict: false,
          version: (s.tabs.find((t) => t.path === path)?.version ?? 0) + 1
        })
      }))
    }
  },

  reloadFromDisk: async (path) => {
    try {
      const content = await window.stancode.fs.readFile(path)
      set((s) => ({
        contents: { ...s.contents, [path]: content },
        tabs: patchTab(s.tabs, path, {
          dirty: false,
          conflict: false,
          version: (s.tabs.find((t) => t.path === path)?.version ?? 0) + 1
        })
      }))
    } catch (err) {
      console.error(err)
    }
  },

  keepMine: (path) => {
    // On garde la version locale : le prochain auto-save écrasera le disque.
    set((s) => ({ tabs: patchTab(s.tabs, path, { conflict: false }) }))
    void get().saveNow(path)
  },

  handleRenamed: (oldPath, newPath) => {
    set((s) => {
      const contents = { ...s.contents }
      if (oldPath in contents) {
        contents[newPath] = contents[oldPath]
        delete contents[oldPath]
      }
      return {
        tabs: s.tabs.map((t) =>
          t.path === oldPath ? { ...t, path: newPath, name: nameOf(newPath) } : t
        ),
        activePath: s.activePath === oldPath ? newPath : s.activePath,
        contents
      }
    })
  }
}))
