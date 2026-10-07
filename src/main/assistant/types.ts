import type { AssistantEvent, AssistantKind, ProviderStatus } from '../../shared/types'

export type Emit = (event: AssistantEvent) => void

/** Une conversation avec un fournisseur, propre à une fenêtre. */
export interface AssistantSession {
  /** Envoie un message ; la réponse arrive par `emit`, close par 'done' ou 'error'. */
  send(prompt: string, cwd: string, emit: Emit): void
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
  /** Installé ? connecté ? Revérifié à chaque appel. */
  status(): Promise<ProviderStatus>
  createSession(): AssistantSession
}
