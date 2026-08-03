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

/** État partagé de la radio (source de vérité dans le processus principal).
 *  `isOwner` est propre à chaque fenêtre : seule la porteuse émet le son. */
export interface RadioState {
  /** null = aucune station encore choisie (avant le seed de la 1re fenêtre) */
  index: number | null
  isPlaying: boolean
  isOwner: boolean
}
