import { create } from 'zustand'
import type { ProviderInfo } from '../../shared/types'
import { useWorkspace } from './workspace'

export interface AssistantMessage {
  /** 'tool' : trace d'activité — text = nom de l'outil (Edit, Bash…), traduit à l'affichage */
  role: 'user' | 'assistant' | 'tool'
  text: string
  /** cible de l'outil (fichier, commande…) */
  detail?: string
}

/* Le choix du fournisseur est une préférence de l'utilisateur sur cette
   machine : localStorage suffit. Lecture et écriture protégées, le stockage
   pouvant être indisponible. */
const CHOICE_KEY = 'stanote:assistant'

function readChoice(): string | null {
  try {
    return localStorage.getItem(CHOICE_KEY)
  } catch {
    return null
  }
}

function saveChoice(id: string): void {
  try {
    localStorage.setItem(CHOICE_KEY, id)
  } catch {
    // préférence perdue au prochain lancement, sans conséquence
  }
}

export const isInstalled = (p: ProviderInfo): boolean => p.status !== 'missing'

/** Fournisseur à brancher d'office : le dernier choisi s'il est toujours
 *  installé, sinon le seul installé. Plusieurs installés et aucun choix
 *  mémorisé : null, l'utilisateur choisit. */
function pickActive(list: ProviderInfo[]): string | null {
  const remembered = readChoice()
  if (remembered && list.some((p) => p.id === remembered && isInstalled(p))) return remembered
  const installed = list.filter(isInstalled)
  return installed.length === 1 ? installed[0].id : null
}

interface AssistantState {
  /** fournisseurs connus et leur état ; null = détection pas encore faite */
  providers: ProviderInfo[] | null
  /** fournisseur branché ; null = aucun (écran de choix) */
  activeId: string | null
  /** écran de choix rouvert à la demande, alors qu'un fournisseur est branché */
  picking: boolean
  messages: AssistantMessage[]
  busy: boolean
  /** outil en cours d'utilisation (Edit, Bash…), pour la ligne d'état */
  currentTool: string | null
  /** (re)détecte les fournisseurs : installés ? connectés ? */
  refresh: () => Promise<void>
  choose: (id: string) => void
  setPicking: (picking: boolean) => void
  send: (prompt: string) => void
  cancel: () => void
  reset: () => void
}

export const useAssistant = create<AssistantState>((set, get) => ({
  providers: null,
  activeId: null,
  picking: false,
  messages: [],
  busy: false,
  currentTool: null,

  refresh: async () => {
    const providers = await window.stancode.assistant.providers()
    const current = get().activeId
    // On garde le fournisseur en cours tant qu'il est installé : une
    // revérification ne doit pas couper une conversation.
    const keep = current !== null && providers.some((p) => p.id === current && isInstalled(p))
    set({ providers, activeId: keep ? current : pickActive(providers) })
  },

  choose: (id) => {
    saveChoice(id)
    const { activeId } = get()
    if (id !== activeId) {
      // Nouveau fournisseur, nouvelle conversation.
      if (activeId) void window.stancode.assistant.reset(activeId)
      set({ messages: [], busy: false, currentTool: null })
    }
    set({ activeId: id, picking: false })
  },

  setPicking: (picking) => set({ picking }),

  send: (prompt) => {
    const { activeId, busy } = get()
    const cwd = useWorkspace.getState().rootPath
    if (!activeId || !cwd || busy || !prompt.trim()) return
    set((s) => ({
      messages: [...s.messages, { role: 'user', text: prompt }],
      busy: true,
      currentTool: null
    }))
    void window.stancode.assistant.send(activeId, prompt, cwd)
  },

  cancel: () => {
    const { activeId } = get()
    if (activeId) void window.stancode.assistant.cancel(activeId)
  },

  reset: () => {
    const { activeId } = get()
    if (activeId) void window.stancode.assistant.reset(activeId)
    set({ messages: [], busy: false, currentTool: null })
  }
}))

/** Fournisseur branché, avec son état. */
export function useActiveProvider(): ProviderInfo | null {
  return useAssistant((s) => s.providers?.find((p) => p.id === s.activeId) ?? null)
}

/** Met à jour l'état d'un fournisseur après un échec révélateur. */
function markStatus(id: string, status: ProviderInfo['status']): void {
  const { providers } = useAssistant.getState()
  if (!providers) return
  useAssistant.setState({
    providers: providers.map((p) => (p.id === id ? { ...p, status } : p))
  })
}

/* Changer de dossier change le répertoire de travail de l'assistant :
   poursuivre la conversation précédente le laisserait raisonner sur l'ancien
   dossier. On repart donc d'un fil vierge. */
let lastRoot = useWorkspace.getState().rootPath
useWorkspace.subscribe((s) => {
  if (s.rootPath === lastRoot) return
  lastRoot = s.rootPath
  if (useAssistant.getState().messages.length > 0) useAssistant.getState().reset()
})

/* Flux d'événements du main : le texte arrive en deltas, on l'agrège dans le
 * dernier message assistant (créé au premier delta du tour). Les événements
 * d'un fournisseur qui n'est plus branché sont ignorés. */
window.stancode.assistant.onEvent(({ providerId, event }) => {
  const { messages, activeId } = useAssistant.getState()
  if (providerId !== activeId) return
  if (event.type === 'delta') {
    const last = messages[messages.length - 1]
    if (last && last.role === 'assistant') {
      const next = [...messages]
      next[next.length - 1] = { ...last, text: last.text + event.text }
      useAssistant.setState({ messages: next, currentTool: null })
    } else {
      useAssistant.setState({
        messages: [...messages, { role: 'assistant', text: event.text }],
        currentTool: null
      })
    }
  } else if (event.type === 'tool') {
    useAssistant.setState({
      currentTool: event.name,
      messages: [
        ...messages,
        { role: 'tool', text: event.name, ...(event.detail ? { detail: event.detail } : {}) }
      ]
    })
  } else if (event.type === 'done') {
    useAssistant.setState({ busy: false, currentTool: null })
  } else if (event.type === 'error') {
    useAssistant.setState({ busy: false, currentTool: null })
    if (event.message === 'not-found') {
      markStatus(providerId, 'missing')
    } else if (event.message === 'not-authenticated' || event.message === 'no-response') {
      markStatus(providerId, 'needs-login')
    } else if (event.message !== 'cancelled') {
      useAssistant.setState({
        messages: [...useAssistant.getState().messages, { role: 'assistant', text: `⚠︎ ${event.message}` }]
      })
    }
  }
})
