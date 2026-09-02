import { create } from 'zustand'
import { basename, sepOf } from '../lib/path'

/** Colonne d'édition : 0 = gauche (toujours présente), 1 = droite (vue double). */
export type PaneId = 0 | 1

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
  /** colonne d'affichage ; un fichier n'est ouvert que dans une seule */
  pane: PaneId
}

let untitledCounter = 0

interface TabsState {
  tabs: Tab[]
  /** onglet actif de chaque colonne */
  activeByPane: [string | null, string | null]
  /** colonne où atterrissent les nouvelles ouvertures */
  focusedPane: PaneId
  contents: Record<string, string>
  openFile: (path: string) => Promise<void>
  newUntitled: () => void
  activate: (path: string) => void
  /** Déplace un onglet vers une colonne (glisser-déposer ; ouvre la vue double). */
  moveTabToPane: (path: string, pane: PaneId) => void
  focusPane: (pane: PaneId) => void
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
  /** Déplace l'onglet `fromPath` avant (ou après) `toPath` (réordonnancement). */
  reorderTab: (fromPath: string, toPath: string, before: boolean) => void
}

const AUTOSAVE_DELAY_MS = 500
const saveTimers = new Map<string, ReturnType<typeof setTimeout>>()
/** Ouvertures en cours : évite deux onglets pour un même fichier (double clic). */
const opening = new Set<string>()

const MARKDOWN = /\.(md|markdown|txt)$/i
const HTML = /\.html?$/i
/** Formats texte simples ouverts dans l'éditeur de code. */
const CODE = /\.(json|ya?ml|toml|ini|cfg|conf|csv|log|xml|css|py|php)$/i
/** Fichiers d'environnement : `.env`, `.env.local`… (pas d'extension). */
const ENV = /(^|\/)\.env(\.[^/]+)?$/i

const isCode = (path: string): boolean => CODE.test(path) || ENV.test(path)

export const isEditable = (path: string): boolean =>
  MARKDOWN.test(path) || isCode(path) || HTML.test(path)

export type FileKind = 'markdown' | 'code' | 'pdf' | 'image' | 'html' | 'other'

export function fileKind(path: string): FileKind {
  const p = path.toLowerCase()
  if (MARKDOWN.test(p)) return 'markdown'
  if (isCode(p)) return 'code'
  if (p.endsWith('.pdf')) return 'pdf'
  if (/\.(png|jpe?g|gif|webp|svg|bmp|ico|avif)$/.test(p)) return 'image'
  if (HTML.test(p)) return 'html'
  return 'other'
}

const nameOf = (path: string): string => basename(path)

function patchTab(tabs: Tab[], path: string, patch: Partial<Tab>): Tab[] {
  return tabs.map((t) => (t.path === path ? { ...t, ...patch } : t))
}

export const useTabs = create<TabsState>((set, get) => ({
  tabs: [],
  activeByPane: [null, null],
  focusedPane: 0,
  contents: {},

  openFile: async (path) => {
    if (get().tabs.some((t) => t.path === path)) {
      get().activate(path)
      return
    }
    // Ouverture déjà lancée (double clic) : ne pas en démarrer une seconde,
    // sinon les deux appels franchissent le test ci-dessus pendant la lecture
    // du fichier et créent deux onglets pour le même chemin.
    if (opening.has(path)) return
    opening.add(path)
    try {
      let content = ''
      if (isEditable(path)) {
        try {
          content = await window.stancode.fs.readFile(path)
        } catch (err) {
          console.error(err)
          return
        }
      }
      // Re-vérifié après l'attente : l'onglet a pu apparaître entre-temps.
      if (get().tabs.some((t) => t.path === path)) {
        get().activate(path)
        return
      }
      set((s) => {
        const pane = s.focusedPane
        const activeByPane = [...s.activeByPane] as [string | null, string | null]
        activeByPane[pane] = path
        return {
          tabs: [
            ...s.tabs,
            { path, name: nameOf(path), dirty: false, conflict: false, version: 0, pane }
          ],
          activeByPane,
          contents: { ...s.contents, [path]: content }
        }
      })
    } finally {
      opening.delete(path)
    }
  },

  newUntitled: () => {
    const key = `untitled://${++untitledCounter}`
    set((s) => {
      const pane = s.focusedPane
      const activeByPane = [...s.activeByPane] as [string | null, string | null]
      activeByPane[pane] = key
      return {
        tabs: [
          ...s.tabs,
          {
            path: key,
            name: 'sans-titre.md',
            dirty: false,
            conflict: false,
            version: 0,
            untitled: true,
            pane
          }
        ],
        activeByPane,
        contents: { ...s.contents, [key]: '' }
      }
    })
  },

  activate: (path) =>
    set((s) => {
      const tab = s.tabs.find((t) => t.path === path)
      if (!tab) return s
      const activeByPane = [...s.activeByPane] as [string | null, string | null]
      activeByPane[tab.pane] = path
      return { activeByPane, focusedPane: tab.pane }
    }),

  focusPane: (pane) => set({ focusedPane: pane }),

  moveTabToPane: (path, pane) =>
    set((s) => {
      const tab = s.tabs.find((t) => t.path === path)
      if (!tab || tab.pane === pane) return s
      const tabs = s.tabs.map((t) => (t.path === path ? { ...t, pane } : t))
      const activeByPane = [...s.activeByPane] as [string | null, string | null]
      activeByPane[pane] = path
      // La colonne d'origine se rabat sur un onglet restant (ou se vide).
      if (activeByPane[tab.pane] === path) {
        activeByPane[tab.pane] = tabs.find((t) => t.pane === tab.pane)?.path ?? null
      }
      return { tabs, activeByPane, focusedPane: pane }
    }),

  cycle: (dir) => {
    const { tabs, activeByPane, focusedPane } = get()
    const paneTabs = tabs.filter((t) => t.pane === focusedPane)
    const current = activeByPane[focusedPane]
    if (paneTabs.length < 2 || !current) return
    const i = paneTabs.findIndex((t) => t.path === current)
    get().activate(paneTabs[(i + dir + paneTabs.length) % paneTabs.length].path)
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
    const activePath = activePathOf(get())
    if (!activePath) return
    if (get().tabs.find((t) => t.path === activePath)?.untitled) await get().saveAsActive()
    else await get().saveNow(activePath)
  },

  // « Enregistrer sous » pour une note sans titre : dialogue puis conversion en
  // onglet-fichier normal.
  saveAsActive: async () => {
    const activePath = activePathOf(get())
    if (!activePath) return
    const { tabs, contents } = get()
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
      const activeByPane = s.activeByPane.map((p) => (p === activePath ? newPath : p)) as [
        string | null,
        string | null
      ]
      return {
        contents: nextContents,
        tabs: s.tabs.map((t) =>
          t.path === activePath
            ? { ...t, path: newPath, name: nameOf(newPath), untitled: false, dirty: false }
            : t
        ),
        activeByPane
      }
    })
  },

  closeTab: async (path) => {
    await get().saveNow(path)
    set((s) => {
      const closed = s.tabs.find((t) => t.path === path)
      if (!closed) return s
      const paneTabs = s.tabs.filter((t) => t.pane === closed.pane)
      const idx = paneTabs.findIndex((t) => t.path === path)
      const tabs = s.tabs.filter((t) => t.path !== path)
      const contents = { ...s.contents }
      delete contents[path]

      const activeByPane = [...s.activeByPane] as [string | null, string | null]
      if (activeByPane[closed.pane] === path) {
        // Onglet voisin dans la même colonne, sinon la colonne se vide.
        const rest = paneTabs.filter((t) => t.path !== path)
        activeByPane[closed.pane] = rest.length ? rest[Math.min(idx, rest.length - 1)].path : null
      }
      // La colonne de droite vidée referme la vue double.
      const focusedPane = tabs.some((t) => t.pane === 1) ? s.focusedPane : 0
      return { tabs, contents, activeByPane, focusedPane }
    })
  },

  closeActive: async () => {
    const activePath = activePathOf(get())
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

  reorderTab: (fromPath, toPath, before) => {
    if (fromPath === toPath) return
    set((s) => {
      const from = s.tabs.findIndex((t) => t.path === fromPath)
      const target = s.tabs.find((t) => t.path === toPath)
      if (from < 0 || !target) return s
      const tabs = [...s.tabs]
      const [moved] = tabs.splice(from, 1)
      const insert = tabs.findIndex((t) => t.path === toPath) + (before ? 0 : 1)
      // Glisser un onglet sur la barre de l'autre colonne l'y déplace.
      const changedPane = moved.pane !== target.pane
      tabs.splice(insert, 0, changedPane ? { ...moved, pane: target.pane } : moved)
      if (!changedPane && insert === from) return s // rien n'a bougé
      if (!changedPane) return { tabs }
      const activeByPane = [...s.activeByPane] as [string | null, string | null]
      activeByPane[target.pane] = fromPath
      if (activeByPane[moved.pane] === fromPath) {
        activeByPane[moved.pane] = tabs.find((t) => t.pane === moved.pane)?.path ?? null
      }
      return { tabs, activeByPane, focusedPane: target.pane }
    })
  },

  handleMoved: (oldPath, newPath) => {
    // Remappe le chemin exact ET tout descendant (dossier déplacé/renommé).
    const remap = (p: string): string =>
      p === oldPath
        ? newPath
        : p.startsWith(oldPath + sepOf(oldPath))
          ? newPath + p.slice(oldPath.length)
          : p
    set((s) => {
      const contents: Record<string, string> = {}
      for (const [p, c] of Object.entries(s.contents)) contents[remap(p)] = c
      return {
        tabs: s.tabs.map((t) => {
          const np = remap(t.path)
          return np === t.path ? t : { ...t, path: np, name: nameOf(np) }
        }),
        activeByPane: s.activeByPane.map((p) => (p ? remap(p) : null)) as [
          string | null,
          string | null
        ],
        contents
      }
    })
  }
}))

/** Chemin actif de la colonne qui a le focus. */
export function activePathOf(s: {
  activeByPane: [string | null, string | null]
  focusedPane: PaneId
}): string | null {
  return s.activeByPane[s.focusedPane]
}

/** Onglet actif de la colonne qui a le focus (hook réactif). */
export function useActiveTab(): Tab | undefined {
  const tabs = useTabs((s) => s.tabs)
  const activeByPane = useTabs((s) => s.activeByPane)
  const focusedPane = useTabs((s) => s.focusedPane)
  const path = activeByPane[focusedPane]
  return path ? tabs.find((t) => t.path === path) : undefined
}
