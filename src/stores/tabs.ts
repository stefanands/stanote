import { create } from 'zustand'

export interface Tab {
  /** clé de l'onglet : chemin absolu, ou `untitled://N` pour une note non enregistrée */
  path: string
  name: string
  dirty: boolean
  /** modifié sur le disque alors que l'onglet a des changements locaux */
  conflict: boolean
  /** incrémenté pour forcer le remount de l'éditeur (rechargement externe) */
  version: number
  /** note créée à la volée, pas encore enregistrée sur le disque */
  untitled?: boolean
}

let untitledCounter = 0

interface TabsState {
  tabs: Tab[]
  activePath: string | null
  contents: Record<string, string>
  openFile: (path: string) => Promise<void>
  newUntitled: () => void
  activate: (path: string) => void
  cycle: (dir: 1 | -1) => void
  updateContent: (path: string, markdown: string) => void
  saveNow: (path: string) => Promise<void>
  saveActive: () => Promise<void>
  saveAsActive: () => Promise<void>
  closeTab: (path: string) => Promise<void>
  closeActive: () => Promise<void>
  externalChange: (path: string) => Promise<void>
  reloadFromDisk: (path: string) => Promise<void>
  keepMine: (path: string) => void
  /** Remappe les onglets/contenus après un renommage ou déplacement (gère aussi
   *  les fichiers contenus dans un dossier déplacé). */
  handleMoved: (oldPath: string, newPath: string) => void
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

  newUntitled: () => {
    const key = `untitled://${++untitledCounter}`
    set((s) => ({
      tabs: [
        ...s.tabs,
        { path: key, name: 'sans-titre.md', dirty: false, conflict: false, version: 0, untitled: true }
      ],
      activePath: key,
      contents: { ...s.contents, [key]: '' }
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
    // Une note sans titre n'a pas de chemin : pas d'auto-save (elle attend un
    // « Enregistrer sous »).
    if (get().tabs.find((t) => t.path === path)?.untitled) return
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
    if (!tab || !tab.dirty || tab.untitled) return
    try {
      await window.stancode.fs.writeFile(path, contents[path] ?? '')
      set((s) => ({ tabs: patchTab(s.tabs, path, { dirty: false }) }))
    } catch (err) {
      console.error(err)
    }
  },

  saveActive: async () => {
    const { activePath, tabs } = get()
    if (!activePath) return
    if (tabs.find((t) => t.path === activePath)?.untitled) await get().saveAsActive()
    else await get().saveNow(activePath)
  },

  // « Enregistrer sous » pour une note sans titre : dialogue puis conversion en
  // onglet-fichier normal.
  saveAsActive: async () => {
    const { activePath, tabs, contents } = get()
    if (!activePath) return
    const tab = tabs.find((t) => t.path === activePath)
    if (!tab || !tab.untitled) {
      await get().saveNow(activePath)
      return
    }
    const newPath = await window.stancode.fs.saveAs(tab.name, contents[activePath] ?? '')
    if (!newPath) return
    set((s) => {
      const nextContents = { ...s.contents }
      nextContents[newPath] = nextContents[activePath] ?? ''
      delete nextContents[activePath]
      return {
        contents: nextContents,
        tabs: s.tabs.map((t) =>
          t.path === activePath
            ? { ...t, path: newPath, name: nameOf(newPath), untitled: false, dirty: false }
            : t
        ),
        activePath: newPath
      }
    })
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

  handleMoved: (oldPath, newPath) => {
    // Remappe le chemin exact ET tout descendant (dossier déplacé/renommé).
    const remap = (p: string): string =>
      p === oldPath ? newPath : p.startsWith(oldPath + '/') ? newPath + p.slice(oldPath.length) : p
    set((s) => {
      const contents: Record<string, string> = {}
      for (const [p, c] of Object.entries(s.contents)) contents[remap(p)] = c
      return {
        tabs: s.tabs.map((t) => {
          const np = remap(t.path)
          return np === t.path ? t : { ...t, path: np, name: nameOf(np) }
        }),
        activePath: s.activePath ? remap(s.activePath) : null,
        contents
      }
    })
  }
}))
