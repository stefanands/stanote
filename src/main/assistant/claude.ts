import type { ProviderStatus, Tier } from '../../shared/types'
import { NEEDS_LOGIN, resolveBin, runJsonl, runQuick, shorten } from './cli'
import type { AssistantSession, Emit, Provider } from './types'

/* Fournisseur Claude : pilote le CLI `claude` en mode headless
   (-p --output-format stream-json), conversation poursuivie entre les messages
   via --resume <session_id>. Édition auto (acceptEdits) : Claude peut lire et
   modifier les fichiers du dossier ouvert, l'éditeur recharge à chaud grâce au
   watcher existant. */

/* Alias résolus par le CLI : toujours le dernier modèle de chaque famille. */
const MODELS: Record<Tier, string> = { fast: 'haiku', standard: 'sonnet', reasoning: 'opus' }

function createSession(): AssistantSession {
  let run: { kill: () => void } | null = null
  let sessionId: string | null = null

  /** `withModel` faux : on laisse le CLI choisir son modèle par défaut. */
  const send = async (
    prompt: string,
    cwd: string,
    tier: Tier,
    emit: Emit,
    withModel = true
  ): Promise<void> => {
    if (run) return // déjà en cours : le renderer bloque l'envoi
    const bin = await resolveBin('claude')
    if (!bin) return emit({ type: 'error', message: 'not-found' })

    const args = [
      '-p',
      '--output-format',
      'stream-json',
      '--verbose',
      '--include-partial-messages',
      '--permission-mode',
      'acceptEdits'
    ]
    if (withModel) args.push('--model', MODELS[tier])
    if (sessionId) args.push('--resume', sessionId)
    /** session d'avant cet essai : une relance repart d'elle, pas de l'essai raté */
    const resumeFrom = sessionId

    let finished = false
    let failed = false
    let failure = ''
    /** du texte ou une action a déjà été montré : plus question de relancer */
    let produced = false
    const current = runJsonl({
      bin,
      args,
      cwd,
      stdin: prompt,
      onMessage: (msg) => {
        if (msg['type'] === 'system' && msg['subtype'] === 'init') {
          sessionId = (msg['session_id'] as string) ?? sessionId
        } else if (msg['type'] === 'stream_event') {
          const ev = msg['event'] as { type?: string; delta?: { type?: string; text?: string } }
          if (ev?.type === 'content_block_delta' && ev.delta?.type === 'text_delta' && ev.delta.text) {
            produced = true
            emit({ type: 'delta', text: ev.delta.text })
          }
        } else if (msg['type'] === 'assistant') {
          const content = (
            msg['message'] as {
              content?: { type: string; name?: string; input?: Record<string, unknown> }[]
            }
          )?.content
          for (const block of content ?? []) {
            if (block.type !== 'tool_use' || !block.name) continue
            const input = block.input ?? {}
            const detail = shorten(
              input['file_path'] ?? input['path'] ?? input['pattern'] ?? input['command']
            )
            produced = true
            emit({ type: 'tool', name: block.name, ...(detail ? { detail } : {}) })
          }
        } else if (msg['type'] === 'result') {
          // Conclusion rendue à la fin du processus : un échec peut encore
          // donner lieu à un second essai.
          finished = true
          failed = msg['is_error'] === true
          failure = typeof msg['result'] === 'string' ? msg['result'] : ''
          sessionId = (msg['session_id'] as string) ?? sessionId
        }
      },
      onSilence: () => {
        run = null
        emit({ type: 'error', message: 'no-response' })
      },
      onExit: (code, stderr) => {
        if (run === current) run = null
        if (finished && failed && !produced) {
          // Modèle refusé (alias retiré, accès restreint) : on retente avec le
          // modèle par défaut du CLI plutôt que d'échouer.
          if (withModel && /model/i.test(failure + stderr)) {
            sessionId = resumeFrom
            return void send(prompt, cwd, tier, emit, false)
          }
          return emit({ type: 'error', message: failure || stderr || 'error' })
        }
        // Fin réussie, même si l'événement de conclusion venait à changer.
        if (finished || code === 0) return emit({ type: 'done', isError: failed })
        emit({
          type: 'error',
          // Le CLI est installé mais la session n'est pas ouverte : cas courant
          // et sans rapport avec une vraie panne, on le distingue pour guider.
          message:
            code === null
              ? 'cancelled'
              : NEEDS_LOGIN.test(stderr)
                ? 'not-authenticated'
                : stderr || `exit ${code}`
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
    }
  }
}

export const claudeProvider: Provider = {
  id: 'claude',
  name: 'Claude',
  kind: 'agent',
  loginCommand: 'claude auth login',
  tiers: { fast: 'Haiku', standard: 'Sonnet', reasoning: 'Opus' },
  status: async (): Promise<ProviderStatus> => {
    const bin = await resolveBin('claude')
    if (!bin) return 'missing'
    // `claude auth status --json` renvoie { loggedIn }.
    const { stdout } = await runQuick(bin, ['auth', 'status', '--json'])
    try {
      return (JSON.parse(stdout) as { loggedIn?: boolean }).loggedIn ? 'ready' : 'needs-login'
    } catch {
      return 'unknown'
    }
  },
  createSession
}
