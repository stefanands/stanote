import { create } from 'zustand'

/** Dispositions des 3 zones (arbre, éditeur, terminal). */
export type Layout = 'editor-left' | 'editor-right' | 'sidebar'

function detectLayout(): Layout {
  const s = localStorage.getItem('stanote:layout')
  return s === 'editor-right' || s === 'sidebar' ? s : 'editor-left'
}

interface UiState {
  sidebarView: 'files' | 'search'
  quickOpen: boolean
  /** barre chercher/remplacer dans la note (Cmd+F) */
  findOpen: boolean
  layout: Layout
  setSidebarView: (view: 'files' | 'search') => void
  setQuickOpen: (open: boolean) => void
  setFindOpen: (open: boolean) => void
  setLayout: (layout: Layout) => void
}

export const useUi = create<UiState>((set) => ({
  sidebarView: 'files',
  quickOpen: false,
  findOpen: false,
  layout: detectLayout(),
  setSidebarView: (sidebarView) => set({ sidebarView }),
  setQuickOpen: (quickOpen) => set({ quickOpen }),
  setFindOpen: (findOpen) => set({ findOpen }),
  setLayout: (layout) => {
    localStorage.setItem('stanote:layout', layout)
    set({ layout })
  }
}))
