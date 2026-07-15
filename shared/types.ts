export interface TreeNode {
  name: string
  path: string
  type: 'file' | 'dir'
  children?: TreeNode[]
}

export interface WorkspaceInfo {
  root: string
  name: string
  tree: TreeNode[]
}

export interface SearchMatch {
  /** chemin absolu du fichier */
  file: string
  line: number
  text: string
}

/** Événements du flux « Demander à Claude » (CLI headless → renderer). */
export type ClaudeEvent =
  | { type: 'delta'; text: string }
  | { type: 'tool'; name: string; detail?: string }
  | { type: 'done'; isError: boolean }
  | { type: 'error'; message: string }
