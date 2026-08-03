import { create } from 'zustand'
import type { TreeNode, WorkspaceInfo } from '../../shared/types'

interface WorkspaceState {
  rootPath: string | null
  rootName: string | null
  tree: TreeNode[]
  setWorkspace: (ws: WorkspaceInfo) => void
  setTree: (tree: TreeNode[]) => void
}

export const useWorkspace = create<WorkspaceState>((set) => ({
  rootPath: null,
  rootName: null,
  tree: [],
  setWorkspace: (ws) => {
    localStorage.setItem('stancode:lastFolder', ws.root)
    set({ rootPath: ws.root, rootName: ws.name, tree: ws.tree })
  },
  setTree: (tree) => set({ tree })
}))

export async function openFolderDialog(): Promise<void> {
  const ws = await window.stancode.fs.openFolder()
  if (ws) useWorkspace.getState().setWorkspace(ws)
}

/** Ouvre un dossier par son chemin (sans dialogue). Retourne true si ouvert. */
export async function openWorkspaceByPath(path: string): Promise<boolean> {
  const ws = await window.stancode.fs.openPath(path)
  if (!ws) return false
  useWorkspace.getState().setWorkspace(ws)
  return true
}

/** Retourne true si un dossier a bien été restauré. */
export async function restoreLastFolder(): Promise<boolean> {
  const last = localStorage.getItem('stancode:lastFolder')
  if (!last) return false
  const ws = await window.stancode.fs.openPath(last)
  if (!ws) return false
  useWorkspace.getState().setWorkspace(ws)
  return true
}
