import type { ProviderStatus, Tier } from '../../shared/types'
import { createAgentSession, TOOLS, type ChatFn, type ChatMessage, type ToolCall } from './agent'
import { resolveBin } from './cli'
import type { AssistantSession, Provider, ProviderState } from './types'

/* Fournisseur Ollama : modèles locaux, rien ne sort de l'ordinateur. Ollama ne
   sait que répondre ; c'est l'agent de Stanote qui exécute les actions.

   Seuls les modèles capables d'appeler des outils sont proposés : les autres
   ne pourraient ni lire ni modifier les notes. Les gammes sont tirées des
   modèles installés, du plus léger (tâche simple) au plus lourd
   (raisonnement). */

/** Adresse du serveur : OLLAMA_HOST s'il est défini, sinon l'adresse par défaut. */
function baseUrl(): string {
  const host = (process.env['OLLAMA_HOST'] ?? '').trim()
  if (!host) return 'http://127.0.0.1:11434'
  const withScheme = /^https?:\/\//.test(host) ? host : `http://${host}`
  return withScheme.replace('://0.0.0.0', '://127.0.0.1').replace(/\/$/, '')
}

/** Mémoire de conversation demandée au modèle (Ollama la limite par défaut). */
const CONTEXT = 16_384

interface LocalModel {
  name: string
  size: number
  thinking: boolean
}

/** Gamme → modèle, établi à la dernière détection. */
let byTier: Partial<Record<Tier, LocalModel>> = {}

async function api<T>(path: string, body?: unknown, timeoutMs = 2000): Promise<T | null> {
  try {
    const res = await fetch(baseUrl() + path, {
      method: body ? 'POST' : 'GET',
      headers: body ? { 'content-type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(timeoutMs)
    })
    return res.ok ? ((await res.json()) as T) : null
  } catch {
    return null
  }
}

/** Répartit les modèles (triés du plus léger au plus lourd) entre les gammes. */
function spread(models: LocalModel[]): Partial<Record<Tier, LocalModel>> {
  const n = models.length
  if (n === 1) return { standard: models[0] }
  if (n === 2) return { fast: models[0], standard: models[1] }
  return { fast: models[0], standard: models[Math.floor((n - 1) / 2)], reasoning: models[n - 1] }
}

async function detect(): Promise<ProviderStatus | ProviderState> {
  const tags = await api<{ models?: { name: string; size: number }[] }>('/api/tags')
  if (!tags) {
    // Installé mais serveur arrêté : il suffit de lancer Ollama.
    return (await resolveBin('ollama'))
      ? { status: 'needs-setup', setupHint: 'ollama serve' }
      : 'missing'
  }
  const models: LocalModel[] = []
  for (const m of tags.models ?? []) {
    const info = await api<{ capabilities?: string[] }>('/api/show', { model: m.name }, 5000)
    const caps = info?.capabilities
    // Sans information sur les capacités (ancienne version d'Ollama), on
    // laisse le modèle essayer plutôt que de l'écarter.
    if (caps && !caps.includes('tools')) continue
    models.push({ name: m.name, size: m.size, thinking: caps?.includes('thinking') ?? false })
  }
  if (models.length === 0) {
    byTier = {}
    return { status: 'needs-setup', setupHint: 'ollama pull qwen3:8b' }
  }
  byTier = spread(models.sort((a, b) => a.size - b.size))
  const tiers = Object.fromEntries(
    Object.entries(byTier).map(([tier, model]) => [tier, model.name])
  ) as Partial<Record<Tier, string>>
  return { status: 'ready', tiers }
}

/** Modèle pour une gamme : celui qui lui est attribué, sinon le standard. */
async function modelFor(tier: Tier): Promise<LocalModel | null> {
  if (!byTier.standard) await detect()
  return byTier[tier] ?? byTier.standard ?? null
}

function toOllama(m: ChatMessage): Record<string, unknown> {
  return {
    role: m.role,
    content: m.content,
    ...(m.tool_calls?.length
      ? { tool_calls: m.tool_calls.map((c) => ({ function: { name: c.name, arguments: c.arguments } })) }
      : {}),
    ...(m.tool_name ? { tool_name: m.tool_name } : {})
  }
}

function chatWith(model: LocalModel, tier: Tier): ChatFn {
  return async (messages, signal) => {
    const res = await fetch(baseUrl() + '/api/chat', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      signal,
      body: JSON.stringify({
        model: model.name,
        messages: messages.map(toOllama),
        tools: TOOLS,
        stream: false,
        options: { num_ctx: CONTEXT },
        // Réflexion préalable seulement en gamme raisonnement, et seulement
        // pour un modèle qui sait réfléchir (sinon Ollama refuserait).
        ...(model.thinking ? { think: tier === 'reasoning' } : {})
      })
    }).catch((err: Error) => {
      // Annulation : on la laisse remonter telle quelle. Sinon, le serveur ne
      // répond plus (Ollama a été quitté) : il faut le relancer.
      if (signal.aborted) throw err
      throw new Error('needs-setup')
    })
    const data = (await res.json().catch(() => ({}))) as {
      error?: string
      message?: {
        content?: string
        tool_calls?: { function?: { name?: string; arguments?: unknown } }[]
      }
    }
    if (!res.ok) throw new Error(data.error || `Ollama : erreur ${res.status}`)
    const tool_calls: ToolCall[] = (data.message?.tool_calls ?? []).map((c) => {
      let args = c.function?.arguments ?? {}
      if (typeof args === 'string') {
        try {
          args = JSON.parse(args)
        } catch {
          args = {}
        }
      }
      return { name: c.function?.name ?? '', arguments: args as Record<string, unknown> }
    })
    return { content: data.message?.content ?? '', tool_calls }
  }
}

function createSession(): AssistantSession {
  let model: LocalModel | null = null
  let currentTier: Tier = 'standard'
  const agent = createAgentSession(() => chatWith(model!, currentTier))
  return {
    send: (prompt, cwd, tier, emit) => {
      void modelFor(tier).then((m) => {
        if (!m) return emit({ type: 'error', message: 'needs-setup' })
        model = m
        currentTier = tier
        agent.send(prompt, cwd, emit)
      })
    },
    cancel: () => agent.cancel(),
    reset: () => agent.reset()
  }
}

export const ollamaProvider: Provider = {
  id: 'ollama',
  name: 'Ollama',
  kind: 'agent',
  // Gammes réelles fournies par detect() selon les modèles installés ; ici,
  // toutes déclarées pour que le registre transmette la gamme choisie.
  tiers: { fast: 'auto', standard: 'auto', reasoning: 'auto' },
  status: detect,
  createSession
}
