import { ipcMain, webContents as allWebContents } from 'electron'
import type { AssistantEvent, ProviderInfo, ProviderStatus, Tier } from '../../shared/types'
import type { AssistantSession, Provider } from './types'
import { claudeProvider } from './claude'
import { codexProvider } from './codex'
import { mistralProvider } from './mistral'
import { ollamaProvider } from './ollama'

/* Registre des fournisseurs d'assistant. L'interface ne parle qu'à ces canaux
   « assistant:* », en désignant le fournisseur par son id : en ajouter un se
   limite à l'inscrire dans PROVIDERS. */
const PROVIDERS: Provider[] = [claudeProvider, mistralProvider, codexProvider, ollamaProvider]

const byId = (id: string): Provider | undefined => PROVIDERS.find((p) => p.id === id)

/** Conversations par fenêtre, puis par fournisseur. */
const sessions = new Map<number, Map<string, AssistantSession>>()

function sessionFor(windowId: number, provider: Provider): AssistantSession {
  let perWindow = sessions.get(windowId)
  if (!perWindow) {
    perWindow = new Map()
    sessions.set(windowId, perWindow)
  }
  let session = perWindow.get(provider.id)
  if (!session) {
    session = provider.createSession()
    perWindow.set(provider.id, session)
  }
  return session
}

function emitTo(windowId: number, providerId: string, event: AssistantEvent): void {
  const wc = allWebContents.fromId(windowId)
  if (wc && !wc.isDestroyed()) wc.send('assistant:event', { providerId, event })
}

export function registerAssistantHandlers(): void {
  // Tous les fournisseurs connus, avec leur état sur cette machine.
  ipcMain.handle('assistant:providers', async (): Promise<ProviderInfo[]> =>
    Promise.all(
      PROVIDERS.map(async (p) => {
        const raw = await p.status()
        const state = typeof raw === 'string' ? { status: raw } : raw
        return {
          id: p.id,
          name: p.name,
          kind: p.kind,
          status: state.status,
          tiers: state.tiers ?? p.tiers,
          ...(p.loginCommand ? { loginCommand: p.loginCommand } : {}),
          ...(state.setupHint ? { setupHint: state.setupHint } : {})
        }
      })
    )
  )

  ipcMain.handle('assistant:status', async (_e, id: string): Promise<ProviderStatus> => {
    const provider = byId(id)
    if (!provider) return 'missing'
    const raw = await provider.status()
    return typeof raw === 'string' ? raw : raw.status
  })

  ipcMain.handle(
    'assistant:send',
    (event, id: string, prompt: string, cwd: string, tier: Tier) => {
      const windowId = event.sender.id
      const provider = byId(id)
      if (!provider) {
        emitTo(windowId, id, { type: 'error', message: 'not-found' })
        return
      }
      // Gamme non proposée par ce fournisseur : on retombe sur la standard.
      const effective = provider.tiers[tier] ? tier : 'standard'
      sessionFor(windowId, provider).send(prompt, cwd, effective, (ev) =>
        emitTo(windowId, id, ev)
      )
    }
  )

  ipcMain.handle('assistant:cancel', (event, id: string) => {
    sessions.get(event.sender.id)?.get(id)?.cancel()
  })

  ipcMain.handle('assistant:reset', (event, id: string) => {
    sessions.get(event.sender.id)?.get(id)?.reset()
  })
}

/** Fenêtre fermée : on coupe ses réponses en cours et on oublie ses conversations. */
export function disposeAssistantForWebContents(windowId: number): void {
  const perWindow = sessions.get(windowId)
  if (!perWindow) return
  for (const session of perWindow.values()) session.reset()
  sessions.delete(windowId)
}
