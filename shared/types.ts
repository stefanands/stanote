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
