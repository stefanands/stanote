import { promises as fsp } from 'fs'
import { homedir } from 'os'
import { join } from 'path'
import type { ProviderStatus, Tier } from '../../shared/types'
import { NEEDS_LOGIN, resolveBin, runJsonl, shorten } from './cli'
import type { AssistantSession, Emit, Provider } from './types'

/* Fournisseur Mistral : pilote Mistral Vibe, l'agent en ligne de commande de
   Mistral (`vibe -p --output streaming`, un message JSON par ligne).

   Outils limités à la lecture et à l'écriture de fichiers : sans cette
   restriction, Vibe exécute des commandes shell sans demander, jusqu'à
   fouiller tout le dossier personnel. Ses outils de fichiers, eux, refusent
   tout chemin hors du dossier de travail. */

const TOOLS = ['read_file', 'write_file', 'edit', 'grep']

/* Alias de modèle de la configuration Vibe par défaut. Mistral Medium 3.5
   raisonne déjà (« thinking = high ») : pas de troisième gamme distincte. */
const MODELS: Partial<Record<Tier, string>> = {
  fast: 'devstral-small',
  standard: 'mistral-medium-3.5'
}

/** Outils de Vibe → noms communs, traduits par l'interface. */
const TOOL_NAMES: Record<string, string> = {
  read_file: 'Read',
  write_file: 'Write',
  edit: 'Edit',
  grep: 'Grep'
}

const vibeHome = (): string => process.env['VIBE_HOME'] ?? join(homedir(), '.vibe')
const sessionsDir = (): string => join(vibeHome(), 'logs', 'session')

async function listSessions(): Promise<string[]> {
  try {
    return await fsp.readdir(sessionsDir())
  } catch {
    return []
  }
}

/** Clé Mistral configurée ? Cherchée dans l'environnement, puis dans le .env
 *  de Vibe (là où `vibe --setup` la range) ; la valeur n'est jamais lue
 *  au-delà. Un .env présent mais au format inconnu donne 'unknown' : une
 *  version future de Vibe peut ranger la clé autrement, on le laisse essayer. */
async function keyStatus(): Promise<ProviderStatus> {
  if (process.env['MISTRAL_API_KEY']) return 'ready'
  let env: string
  try {
    env = await fsp.readFile(join(vibeHome(), '.env'), 'utf-8')
  } catch {
    return 'needs-login'
  }
  return /^\s*MISTRAL_API_KEY\s*=\s*['"]?[^\s'"]+/m.test(env) ? 'ready' : 'unknown'
}

/** Alias de modèle déclarés dans la configuration de Vibe. On n'impose un
 *  alias que s'il y figure : sinon Vibe garde son modèle actif par défaut. */
async function knownAliases(): Promise<Set<string>> {
  try {
    const config = await fsp.readFile(join(vibeHome(), 'config.toml'), 'utf-8')
    return new Set([...config.matchAll(/^\s*alias\s*=\s*"([^"]+)"/gm)].map((m) => m[1]))
  } catch {
    return new Set()
  }
}

interface VibeMessage {
  role?: string
  content?: string | null
  tool_calls?: { function?: { name?: string; arguments?: string } }[] | null
}

function createSession(): AssistantSession {
  let run: { kill: () => void } | null = null
  /** identifiant court de la dernière session, pour --resume */
  let sessionId: string | null = null
  /* En reprise, Vibe réaffiche tout l'historique avant la suite : on saute les
     messages déjà montrés. */
  let alreadyShown = 0

  const send = async (prompt: string, cwd: string, tier: Tier, emit: Emit): Promise<void> => {
    if (run) return
    const bin = await resolveBin('vibe')
    if (!bin) return emit({ type: 'error', message: 'not-found' })

    const before = new Set(await listSessions())
    const alias = MODELS[tier] ?? MODELS.standard!
    const model = (await knownAliases()).has(alias) ? { VIBE_ACTIVE_MODEL: alias } : undefined
    const args = [
      '-p',
      prompt,
      '--output',
      'streaming',
      '--trust',
      '--workdir',
      cwd,
      '--agent',
      'accept-edits',
      // garde-fou contre un agent qui tournerait en rond
      '--max-turns',
      '40',
      ...TOOLS.flatMap((tool) => ['--enabled-tools', tool]),
      ...(sessionId ? ['--resume', sessionId] : [])
    ]

    let seen = 0
    let lastWasText = false

    const current = runJsonl({
      bin,
      args,
      cwd,
      ...(model ? { env: model } : {}),
      onMessage: (raw) => {
        const msg = raw as VibeMessage
        if (msg.role === 'system') return
        seen++
        if (seen <= alreadyShown || msg.role !== 'assistant') return
        for (const call of msg.tool_calls ?? []) {
          const name = call.function?.name ?? ''
          let input: Record<string, unknown> = {}
          try {
            input = JSON.parse(call.function?.arguments ?? '{}')
          } catch {
            // arguments illisibles : la trace se passera de détail
          }
          const detail = shorten(input['file_path'] ?? input['path'] ?? input['pattern'])
          emit({ type: 'tool', name: TOOL_NAMES[name] ?? name, ...(detail ? { detail } : {}) })
          lastWasText = false
        }
        const text = (msg.content ?? '').trim()
        if (text) {
          emit({ type: 'delta', text: (lastWasText ? '\n\n' : '') + text })
          lastWasText = true
        }
      },
      onSilence: () => {
        run = null
        emit({ type: 'error', message: 'no-response' })
      },
      onExit: async (code, stderr) => {
        if (run === current) run = null
        // Chaque échange crée un nouveau dossier de session : c'est lui que
        // reprendra le message suivant.
        const fresh = (await listSessions()).filter((d) => !before.has(d)).sort()
        const latest = fresh[fresh.length - 1]
        if (latest) {
          sessionId = latest.slice(latest.lastIndexOf('_') + 1)
          alreadyShown = seen
        }
        if (code === 0) return emit({ type: 'done', isError: false })
        const reason = stderr.replace(/<\/?vibe_stop_event>/g, '').trim()
        emit({
          type: 'error',
          message:
            code === null
              ? 'cancelled'
              : NEEDS_LOGIN.test(reason)
                ? 'not-authenticated'
                : reason || `exit ${code}`
        })
      }
    })
    run = current
  }

  return {
    send: (prompt, cwd, tier, emit) => void send(prompt, cwd, tier, emit),
    cancel: () => run?.kill(),
    reset: () => {
      run?.kill()
      sessionId = null
      alreadyShown = 0
    }
  }
}

export const mistralProvider: Provider = {
  id: 'mistral',
  name: 'Mistral',
  kind: 'agent',
  loginCommand: 'vibe --setup',
  tiers: { fast: 'Devstral Small', standard: 'Mistral Medium 3.5' },
  status: async (): Promise<ProviderStatus> => {
    if (!(await resolveBin('vibe'))) return 'missing'
    return keyStatus()
  },
  createSession
}
