import { promises as fsp } from 'fs'
import { dirname, isAbsolute, join, relative, resolve } from 'path'
import type { Emit } from './types'

/* Agent de Stanote, pour les fournisseurs qui ne savent que répondre (Ollama,
   et demain les API compatibles OpenAI) : le modèle demande une action, Stanote
   l'exécute et lui rend le résultat, jusqu'à la réponse finale.

   Toutes les actions restent confinées au dossier ouvert : un chemin qui en
   sort, y compris par un lien symbolique, est refusé. */

export interface ToolCall {
  name: string
  arguments: Record<string, unknown>
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string
  tool_calls?: ToolCall[]
  /** pour role 'tool' : l'outil dont c'est le résultat */
  tool_name?: string
}

/** Un tour de modèle : texte éventuel, et actions demandées. */
export type ChatFn = (
  messages: ChatMessage[],
  signal: AbortSignal
) => Promise<{ content: string; tool_calls: ToolCall[] }>

/** Garde-fou contre un modèle qui enchaînerait les actions sans conclure. */
const MAX_ROUNDS = 24
/** Au-delà, un fichier est tronqué : il saturerait la mémoire du modèle. */
const READ_LIMIT = 30_000
const LIST_LIMIT = 400
const SEARCH_LIMIT = 40
const SKIP = /(^|[/\\])(\.git|node_modules|\.obsidian|\.DS_Store)([/\\]|$)/
const TEXT = /\.(md|markdown|txt|json|ya?ml|html?|css|csv|toml|py|js|ts)$/i

/** Description des actions, au format attendu par les API de chat. */
export const TOOLS = [
  {
    type: 'function',
    function: {
      name: 'list_files',
      description: 'Liste les fichiers et dossiers du dossier ouvert (récursif).',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Sous-dossier, relatif au dossier ouvert. Vide = racine.' }
        }
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'read_file',
      description: 'Lit le contenu d’un fichier texte.',
      parameters: {
        type: 'object',
        properties: { path: { type: 'string', description: 'Chemin relatif au dossier ouvert.' } },
        required: ['path']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'search_files',
      description: 'Cherche un texte (sans tenir compte de la casse) dans les fichiers du dossier.',
      parameters: {
        type: 'object',
        properties: { query: { type: 'string' } },
        required: ['query']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'write_file',
      description: 'Crée un fichier ou remplace entièrement son contenu.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Chemin relatif au dossier ouvert.' },
          content: { type: 'string' }
        },
        required: ['path', 'content']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'edit_file',
      description:
        'Remplace un passage exact d’un fichier par un autre. Le passage doit apparaître une seule fois.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Chemin relatif au dossier ouvert.' },
          old_text: { type: 'string' },
          new_text: { type: 'string' }
        },
        required: ['path', 'old_text', 'new_text']
      }
    }
  }
]

/** Noms des actions → noms communs de la trace d'activité (traduits par l'interface). */
const TRACE_NAMES: Record<string, string> = {
  list_files: 'LS',
  read_file: 'Read',
  search_files: 'Grep',
  write_file: 'Write',
  edit_file: 'Edit'
}

class OutsideError extends Error {}

/** Chemin absolu d'un chemin demandé par le modèle, s'il reste dans le dossier. */
async function confine(root: string, requested: unknown): Promise<string> {
  const asked = typeof requested === 'string' ? requested.trim() : ''
  const target = resolve(root, asked || '.')
  const inside = (base: string, p: string): boolean => {
    const rel = relative(base, p)
    return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel))
  }
  if (!inside(root, target)) throw new OutsideError(asked)
  // Liens symboliques : on vérifie aussi le chemin réel (celui du dossier
  // parent pour un fichier qui n'existe pas encore).
  const realRoot = await fsp.realpath(root)
  let probe = target
  for (;;) {
    try {
      const real = await fsp.realpath(probe)
      if (!inside(realRoot, real)) throw new OutsideError(asked)
      break
    } catch (err) {
      if (err instanceof OutsideError) throw err
      const parent = dirname(probe)
      if (parent === probe) break
      probe = parent
    }
  }
  return target
}

async function listFiles(root: string, start: string): Promise<string> {
  const out: string[] = []
  const walk = async (dir: string): Promise<void> => {
    if (out.length >= LIST_LIMIT) return
    const entries = await fsp.readdir(dir, { withFileTypes: true }).catch(() => [])
    for (const e of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      const full = join(dir, e.name)
      if (SKIP.test(full) || e.name.startsWith('.')) continue
      if (out.length >= LIST_LIMIT) return
      out.push(relative(root, full) + (e.isDirectory() ? '/' : ''))
      if (e.isDirectory()) await walk(full)
    }
  }
  await walk(start)
  if (out.length === 0) return '(dossier vide)'
  return out.join('\n') + (out.length >= LIST_LIMIT ? `\n… (liste limitée à ${LIST_LIMIT})` : '')
}

async function searchFiles(root: string, query: string): Promise<string> {
  const needle = query.toLowerCase()
  const hits: string[] = []
  const walk = async (dir: string): Promise<void> => {
    const entries = await fsp.readdir(dir, { withFileTypes: true }).catch(() => [])
    for (const e of entries) {
      if (hits.length >= SEARCH_LIMIT) return
      const full = join(dir, e.name)
      if (SKIP.test(full) || e.name.startsWith('.')) continue
      if (e.isDirectory()) await walk(full)
      else if (TEXT.test(e.name)) {
        const text = await fsp.readFile(full, 'utf-8').catch(() => '')
        text.split('\n').forEach((line, i) => {
          if (hits.length < SEARCH_LIMIT && line.toLowerCase().includes(needle)) {
            hits.push(`${relative(root, full)}:${i + 1}: ${line.trim().slice(0, 160)}`)
          }
        })
      }
    }
  }
  await walk(root)
  return hits.length ? hits.join('\n') : 'Aucun résultat.'
}

/** Exécute une action ; rend le texte à transmettre au modèle (erreurs comprises). */
async function runTool(root: string, call: ToolCall): Promise<string> {
  const a = call.arguments ?? {}
  try {
    switch (call.name) {
      case 'list_files':
        return await listFiles(root, await confine(root, a['path']))
      case 'read_file': {
        const text = await fsp.readFile(await confine(root, a['path']), 'utf-8')
        return text.length > READ_LIMIT
          ? text.slice(0, READ_LIMIT) + `\n… (fichier tronqué à ${READ_LIMIT} caractères)`
          : text
      }
      case 'search_files':
        return await searchFiles(root, String(a['query'] ?? ''))
      case 'write_file': {
        const path = await confine(root, a['path'])
        await fsp.mkdir(dirname(path), { recursive: true })
        await fsp.writeFile(path, String(a['content'] ?? ''), 'utf-8')
        return 'Fichier écrit.'
      }
      case 'edit_file': {
        const path = await confine(root, a['path'])
        const text = await fsp.readFile(path, 'utf-8')
        const oldText = String(a['old_text'] ?? '')
        const count = oldText ? text.split(oldText).length - 1 : 0
        if (count !== 1) {
          return `Erreur : le passage à remplacer apparaît ${count} fois (il doit apparaître exactement une fois).`
        }
        await fsp.writeFile(path, text.replace(oldText, String(a['new_text'] ?? '')), 'utf-8')
        return 'Fichier modifié.'
      }
      default:
        return `Erreur : action inconnue « ${call.name} ».`
    }
  } catch (err) {
    if (err instanceof OutsideError) return 'Erreur : chemin hors du dossier ouvert, refusé.'
    return `Erreur : ${(err as Error).message}`
  }
}

function systemPrompt(root: string): string {
  return [
    'Tu es l’assistant de Stanote, un éditeur de notes en markdown.',
    `Tu travailles dans le dossier « ${root} ». Tu ne peux rien lire ni écrire en dehors.`,
    'Utilise les actions à ta disposition pour lister, lire, chercher, écrire et modifier les fichiers,',
    'avec des chemins relatifs à ce dossier. Lis un fichier avant de le modifier, et préfère',
    'edit_file à write_file pour une modification partielle.',
    'Réponds dans la langue de l’utilisateur, simplement et brièvement.'
  ].join(' ')
}

/** Détail affiché dans la trace d'activité. */
function traceDetail(call: ToolCall): string | undefined {
  const a = call.arguments ?? {}
  const raw = a['path'] ?? a['query']
  return typeof raw === 'string' && raw ? raw.slice(0, 80) : undefined
}

/** Une conversation menée par l'agent de Stanote. */
export function createAgentSession(chat: () => ChatFn): {
  send: (prompt: string, cwd: string, emit: Emit) => void
  cancel: () => void
  reset: () => void
} {
  let history: ChatMessage[] = []
  let running: AbortController | null = null

  const run = async (prompt: string, cwd: string, emit: Emit): Promise<void> => {
    const controller = new AbortController()
    running = controller
    const chatFn = chat()
    history.push({ role: 'user', content: prompt })
    let lastWasText = false
    try {
      for (let round = 0; round < MAX_ROUNDS; round++) {
        const reply = await chatFn(
          [{ role: 'system', content: systemPrompt(cwd) }, ...history],
          controller.signal
        )
        history.push({ role: 'assistant', content: reply.content, tool_calls: reply.tool_calls })
        const text = reply.content.trim()
        if (text) {
          emit({ type: 'delta', text: (lastWasText ? '\n\n' : '') + text })
          lastWasText = true
        }
        if (reply.tool_calls.length === 0) return emit({ type: 'done', isError: false })
        for (const call of reply.tool_calls) {
          const detail = traceDetail(call)
          emit({ type: 'tool', name: TRACE_NAMES[call.name] ?? call.name, ...(detail ? { detail } : {}) })
          lastWasText = false
          history.push({ role: 'tool', content: await runTool(cwd, call), tool_name: call.name })
        }
      }
      emit({ type: 'error', message: `Arrêt après ${MAX_ROUNDS} étapes sans conclusion.` })
    } catch (err) {
      emit({
        type: 'error',
        message: controller.signal.aborted ? 'cancelled' : (err as Error).message || 'no-response'
      })
    } finally {
      if (running === controller) running = null
    }
  }

  return {
    send: (prompt, cwd, emit) => {
      if (!running) void run(prompt, cwd, emit)
    },
    cancel: () => running?.abort(),
    reset: () => {
      running?.abort()
      history = []
    }
  }
}
