import type { AssistantEvent, AssistantKind, ProviderStatus, Tier } from '../../shared/types'

export type Emit = (event: AssistantEvent) => void

/** État détaillé : statut, et ce qui en dépend sur cette machine. */
export interface ProviderState {
  status: ProviderStatus
  tiers?: Partial<Record<Tier, string>>
  setupHint?: string
}

/** Une conversation avec un fournisseur, propre à une fenêtre. */
export interface AssistantSession {
  /** Envoie un message ; la réponse arrive par `emit`, close par 'done' ou 'error'.
   *  `tier` est toujours l'une des gammes déclarées par le fournisseur. */
  send(prompt: string, cwd: string, tier: Tier, emit: Emit): void
  /** Interrompt la réponse en cours ; la conversation est conservée. */
  cancel(): void
  /** Oublie la conversation : le prochain message en ouvre une nouvelle. */
  reset(): void
}

/* Contrat d'un fournisseur d'assistant (Claude, Mistral, Ollama…). Ajouter un
   fournisseur revient à écrire un module qui le respecte et à l'inscrire dans
   le registre (index.ts) : le panneau n'a pas à le connaître. */
export interface Provider {
  id: string
  /** nom affiché */
  name: string
  kind: AssistantKind
  /** commande de connexion au terminal, s'il y en a une */
  loginCommand?: string
  /** gammes proposées et ce qu'elles désignent ; 'standard' est obligatoire.
   *  Un fournisseur dont les gammes dépendent de la machine (Ollama : les
   *  modèles installés) les renvoie plutôt depuis status(). */
  tiers: Partial<Record<Tier, string>> & { standard: string }
  /** Installé ? connecté ? Revérifié à chaque appel. */
  status(): Promise<ProviderStatus | ProviderState>
  createSession(): AssistantSession
}
