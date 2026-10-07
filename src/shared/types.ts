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

/** Événement d'un assistant vers l'interface : identique pour tous les
 *  fournisseurs, c'est ce qui permet au panneau d'ignorer lequel est branché.
 *  Erreurs normalisées : 'not-found', 'not-authenticated', 'no-response',
 *  'cancelled' ; tout autre message est affiché tel quel. */
export type AssistantEvent =
  | { type: 'delta'; text: string }
  | { type: 'tool'; name: string; detail?: string }
  | { type: 'done'; isError: boolean }
  | { type: 'error'; message: string }

/** 'agent' : lit et modifie les fichiers du dossier lui-même.
 *  'chat'  : ne voit que le texte qu'on lui envoie. */
export type AssistantKind = 'agent' | 'chat'

/** État d'un fournisseur sur cette machine. 'unknown' : impossible de savoir
 *  s'il est connecté (on le laisse essayer). */
export type ProviderStatus = 'ready' | 'needs-login' | 'missing' | 'unknown'

/** Gamme de modèle choisie par l'utilisateur, traduite par chaque fournisseur
 *  en modèle et/ou niveau d'effort : tâche simple, tâche complexe, raisonnement. */
export type Tier = 'fast' | 'standard' | 'reasoning'

export interface ProviderInfo {
  id: string
  name: string
  kind: AssistantKind
  status: ProviderStatus
  /** commande à lancer au terminal pour se connecter, s'il y en a une */
  loginCommand?: string
  /** gammes proposées, avec ce qu'elles désignent (affiché en infobulle) */
  tiers: Partial<Record<Tier, string>>
}

/** État partagé de la radio (source de vérité dans le processus principal).
 *  `isOwner` est propre à chaque fenêtre : seule la porteuse émet le son. */
export interface RadioState {
  /** null = aucune station encore choisie (avant le seed de la 1re fenêtre) */
  index: number | null
  isPlaying: boolean
  isOwner: boolean
}
