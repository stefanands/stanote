import { create } from 'zustand'
import { useWorkspace } from './workspace'

export interface ClaudeMessage {
  /** 'tool' : trace d'activité — text = nom de l'outil (Edit, Bash…), traduit à l'affichage */
  role: 'user' | 'assistant' | 'tool'
  text: string
  /** cible de l'outil (fichier, commande…) */
  detail?: string
}

interface ClaudeState {
  messages: ClaudeMessage[]
  busy: boolean
  /** outil en cours d'utilisation par Claude (Edit, Bash…), pour la ligne d'état */
  currentTool: string | null
  /** null = pas encore vérifié ; false = CLI `claude` introuvable */
  available: boolean | null
  checkAvailable: () => Promise<void>
  send: (prompt: string) => void
  cancel: () => void
  reset: () => void
}

export const useClaude = create<ClaudeState>((set, get) => ({
  messages: [],
  busy: false,
  currentTool: null,
  available: null,

  checkAvailable: async () => {
    if (get().available !== null) return
    set({ available: await window.stancode.claude.available() })
  },

  send: (prompt) => {
    if (get().busy || !prompt.trim()) return
    const cwd = useWorkspace.getState().rootPath ?? '.'
    set((s) => ({
      messages: [...s.messages, { role: 'user', text: prompt }],
      busy: true,
      currentTool: null
    }))
    void window.stancode.claude.send(prompt, cwd)
  },

  cancel: () => {
    void window.stancode.claude.cancel()
  },

  reset: () => {
    void window.stancode.claude.reset()
    set({ messages: [], busy: false, currentTool: null })
  }
}))

/* Flux d'événements du main : le texte arrive en deltas, on l'agrège dans le
 * dernier message assistant (créé au premier delta du tour). */
window.stancode.claude.onEvent((event) => {
  const { messages } = useClaude.getState()
  if (event.type === 'delta') {
    const last = messages[messages.length - 1]
    if (last && last.role === 'assistant') {
      const next = [...messages]
      next[next.length - 1] = { ...last, text: last.text + event.text }
      useClaude.setState({ messages: next, currentTool: null })
    } else {
      useClaude.setState({
        messages: [...messages, { role: 'assistant', text: event.text }],
        currentTool: null
      })
    }
  } else if (event.type === 'tool') {
    useClaude.setState({
      currentTool: event.name,
      messages: [
        ...messages,
        { role: 'tool', text: event.name, ...(event.detail ? { detail: event.detail } : {}) }
      ]
    })
  } else if (event.type === 'done') {
    useClaude.setState({ busy: false, currentTool: null })
  } else if (event.type === 'error') {
    if (event.message === 'claude-not-found') {
      useClaude.setState({ busy: false, currentTool: null, available: false })
    } else if (event.message === 'cancelled') {
      useClaude.setState({ busy: false, currentTool: null })
    } else {
      useClaude.setState({
        busy: false,
        currentTool: null,
        messages: [
          ...useClaude.getState().messages,
          { role: 'assistant', text: `⚠︎ ${event.message}` }
        ]
      })
    }
  }
})
