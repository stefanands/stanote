import { create } from 'zustand'
import type { ProviderInfo, Tier } from '../../shared/types'
import { useWorkspace } from './workspace'

export interface AssistantMessage {
  /** 'tool' : trace d'activité — text = nom de l'outil (Edit, Bash…), traduit à l'affichage */
  role: 'user' | 'assistant' | 'tool'
  text: string
  /** cible de l'outil (fichier, commande…) */
  detail?: string
}

/** Conversation avec un fournisseur. Chacun garde la sienne : passer de Claude
 *  à Mistral puis revenir retrouve le fil de Claude là où on l'avait laissé. */
export interface Thread {
  messages: AssistantMessage[]
  busy: boolean
  /** outil en cours d'utilisation (Edit, Bash…), pour la ligne d'état */
  currentTool: string | null
}

const EMPTY_THREAD: Thread = { messages: [], busy: false, currentTool: null }

/* Préférences de l'utilisateur sur cette machine (fournisseur, gamme) :
   localStorage suffit. Lecture et écriture protégées, le stockage pouvant être
   indisponible. */
const CHOICE_KEY = 'stanote:assistant'
const TIER_KEY = 'stanote:tier'

function readPref(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

function savePref(key: string, value: string): void {
  try {
    localStorage.setItem(key, value)
  } catch {
    // préférence perdue au prochain lancement, sans conséquence
  }
}

const TIERS: Tier[] = ['fast', 'standard', 'reasoning']
const storedTier = readPref(TIER_KEY)
const initialTier: Tier = TIERS.includes(storedTier as Tier) ? (storedTier as Tier) : 'standard'

export const isInstalled = (p: ProviderInfo): boolean => p.status !== 'missing'

/** Gamme réellement utilisée : celle choisie si le fournisseur la propose,
 *  sinon la standard (que tous proposent). */
export const effectiveTier = (p: ProviderInfo | null, tier: Tier): Tier =>
  p && p.tiers[tier] ? tier : 'standard'

/** Fournisseur à brancher d'office : le dernier choisi s'il est toujours
 *  installé, sinon le seul installé. Plusieurs installés et aucun choix
 *  mémorisé : null, l'utilisateur choisit. */
function pickActive(list: ProviderInfo[]): string | null {
  const remembered = readPref(CHOICE_KEY)
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
  /** une conversation par fournisseur */
  threads: Record<string, Thread>
  /** gamme choisie : tâche simple, complexe, ou raisonnement */
  tier: Tier
  /** (re)détecte les fournisseurs : installés ? connectés ? */
  refresh: () => Promise<void>
  choose: (id: string) => void
  setPicking: (picking: boolean) => void
  setTier: (tier: Tier) => void
  send: (prompt: string) => void
  cancel: () => void
  /** nouvelle conversation avec le fournisseur branché */
  reset: () => void
  /** oublie toutes les conversations (changement de dossier) */
  resetAll: () => void
}

export const useAssistant = create<AssistantState>((set, get) => ({
  providers: null,
  activeId: null,
  picking: false,
  threads: {},
  tier: initialTier,

  refresh: async () => {
    const providers = await window.stancode.assistant.providers()
    const current = get().activeId
    // On garde le fournisseur en cours tant qu'il est installé : une
    // revérification ne doit pas couper une conversation.
    const keep = current !== null && providers.some((p) => p.id === current && isInstalled(p))
    set({ providers, activeId: keep ? current : pickActive(providers) })
  },

  // Changer de fournisseur ne touche à aucune conversation : chacun garde la sienne.
  choose: (id) => {
    savePref(CHOICE_KEY, id)
    set({ activeId: id, picking: false })
  },

  setPicking: (picking) => set({ picking }),

  setTier: (tier) => {
    savePref(TIER_KEY, tier)
    set({ tier })
  },

  send: (prompt) => {
    const { activeId, providers, tier } = get()
    const cwd = useWorkspace.getState().rootPath
    const provider = providers?.find((p) => p.id === activeId) ?? null
    if (!activeId || !provider || !cwd || threadOf(activeId).busy || !prompt.trim()) return
    updateThread(activeId, (t) => ({
      messages: [...t.messages, { role: 'user', text: prompt }],
      busy: true,
      currentTool: null
    }))
    void window.stancode.assistant.send(activeId, prompt, cwd, effectiveTier(provider, tier))
  },

  cancel: () => {
    const { activeId } = get()
    if (activeId) void window.stancode.assistant.cancel(activeId)
  },

  reset: () => {
    const { activeId } = get()
    if (!activeId) return
    void window.stancode.assistant.reset(activeId)
    updateThread(activeId, () => EMPTY_THREAD)
  },

  resetAll: () => {
    for (const id of Object.keys(get().threads)) void window.stancode.assistant.reset(id)
    set({ threads: {} })
  }
}))

function threadOf(id: string): Thread {
  return useAssistant.getState().threads[id] ?? EMPTY_THREAD
}

function updateThread(id: string, fn: (t: Thread) => Partial<Thread>): void {
  const current = threadOf(id)
  useAssistant.setState((s) => ({ threads: { ...s.threads, [id]: { ...current, ...fn(current) } } }))
}

/** Fournisseur branché, avec son état. */
export function useActiveProvider(): ProviderInfo | null {
  return useAssistant((s) => s.providers?.find((p) => p.id === s.activeId) ?? null)
}

/** Conversation du fournisseur branché. */
export function useActiveThread(): Thread {
  return useAssistant((s) => (s.activeId && s.threads[s.activeId]) || EMPTY_THREAD)
}

/** Met à jour l'état d'un fournisseur après un échec révélateur. */
function markStatus(id: string, status: ProviderInfo['status']): void {
  const { providers } = useAssistant.getState()
  if (!providers) return
  useAssistant.setState({
    providers: providers.map((p) => (p.id === id ? { ...p, status } : p))
  })
}

/* Changer de dossier change le répertoire de travail des assistants :
   poursuivre les conversations précédentes les laisserait raisonner sur
   l'ancien dossier. On repart donc de fils vierges. */
let lastRoot = useWorkspace.getState().rootPath
useWorkspace.subscribe((s) => {
  if (s.rootPath === lastRoot) return
  lastRoot = s.rootPath
  if (Object.keys(useAssistant.getState().threads).length > 0) useAssistant.getState().resetAll()
})

/* Flux d'événements du main, rangés dans la conversation du fournisseur qui
 * les émet — même s'il n'est plus affiché. Le texte arrive par morceaux, agrégés
 * dans le dernier message assistant (créé au premier morceau du tour). */
window.stancode.assistant.onEvent(({ providerId, event }) => {
  if (event.type === 'delta') {
    updateThread(providerId, (t) => {
      const last = t.messages[t.messages.length - 1]
      if (last && last.role === 'assistant') {
        const messages = [...t.messages]
        messages[messages.length - 1] = { ...last, text: last.text + event.text }
        return { messages, currentTool: null }
      }
      return {
        messages: [...t.messages, { role: 'assistant', text: event.text }],
        currentTool: null
      }
    })
  } else if (event.type === 'tool') {
    updateThread(providerId, (t) => ({
      currentTool: event.name,
      messages: [
        ...t.messages,
        { role: 'tool', text: event.name, ...(event.detail ? { detail: event.detail } : {}) }
      ]
    }))
  } else if (event.type === 'done') {
    updateThread(providerId, () => ({ busy: false, currentTool: null }))
  } else if (event.type === 'error') {
    updateThread(providerId, () => ({ busy: false, currentTool: null }))
    if (event.message === 'not-found') {
      markStatus(providerId, 'missing')
    } else if (event.message === 'not-authenticated' || event.message === 'no-response') {
      markStatus(providerId, 'needs-login')
    } else if (event.message !== 'cancelled') {
      updateThread(providerId, (t) => ({
        messages: [...t.messages, { role: 'assistant', text: `⚠︎ ${event.message}` }]
      }))
    }
  }
})
