import { execFile, spawn, type ChildProcessWithoutNullStreams } from 'child_process'
import { createInterface } from 'readline'
import { dirname } from 'path'
import type { ProviderStatus } from '../../shared/types'
import type { AssistantSession, Emit, Provider } from './types'

/* Fournisseur Claude : pilote le CLI `claude` en mode headless
   (-p --output-format stream-json), conversation poursuivie entre les messages
   via --resume <session_id>. Édition auto (acceptEdits) : Claude peut lire et
   modifier les fichiers du dossier ouvert, l'éditeur recharge à chaud grâce au
   watcher existant. */

/* Les apps GUI macOS n'héritent pas du PATH du shell : on résout le binaire via
   un shell de connexion. Seul un résultat positif est mis en cache — un CLI
   installé après le lancement de Stanote est ainsi détecté sans redémarrer. */
let claudeBin: string | null = null

async function resolveClaude(): Promise<string | null> {
  if (claudeBin) return claudeBin
  claudeBin = await new Promise<string | null>((resolve) => {
    execFile(process.env['SHELL'] ?? '/bin/zsh', ['-lc', 'command -v claude'], (err, stdout) => {
      resolve(err ? null : stdout.trim().split('\n').pop() || null)
    })
  })
  return claudeBin
}

/** Session ouverte ? `claude auth status --json` renvoie { loggedIn }.
 *  null = impossible de déterminer. */
function loggedIn(bin: string): Promise<boolean | null> {
  return new Promise((resolve) => {
    execFile(
      bin,
      ['auth', 'status', '--json'],
      { timeout: 10_000, ...(process.platform === 'win32' ? { shell: true } : {}) },
      (err, stdout) => {
        if (err && !stdout) return resolve(null)
        try {
          resolve(Boolean((JSON.parse(stdout) as { loggedIn?: boolean }).loggedIn))
        } catch {
          resolve(null)
        }
      }
    )
  })
}

function createSession(): AssistantSession {
  let child: ChildProcessWithoutNullStreams | null = null
  let sessionId: string | null = null

  const send = async (prompt: string, cwd: string, emit: Emit): Promise<void> => {
    if (child) return // déjà en cours : le renderer bloque l'envoi

    const bin = await resolveClaude()
    if (!bin) {
      emit({ type: 'error', message: 'not-found' })
      return
    }

    const args = [
      '-p',
      '--output-format',
      'stream-json',
      '--verbose',
      '--include-partial-messages',
      '--permission-mode',
      'acceptEdits',
      // alias résolu par le CLI : toujours le meilleur Sonnet disponible
      '--model',
      'sonnet'
    ]
    if (sessionId) args.push('--resume', sessionId)

    const proc = spawn(bin, args, {
      cwd,
      env: {
        ...process.env,
        PATH: `${dirname(bin)}:/opt/homebrew/bin:/usr/local/bin:${process.env['PATH'] ?? ''}`
      }
    })
    child = proc
    proc.stdin.write(prompt)
    proc.stdin.end()

    let gotResult = false
    let gotAnything = false
    const stderrChunks: string[] = []
    proc.stderr.on('data', (d: Buffer) => stderrChunks.push(d.toString()))

    /* Garde-fou : un CLI qui n'a pas de session ouverte peut rester muet sans
       jamais rendre la main — sans ça l'interface attendrait indéfiniment. */
    const silenceTimer = setTimeout(() => {
      if (gotAnything || child !== proc) return
      proc.kill()
      emit({ type: 'error', message: 'no-response' })
    }, 25_000)

    const rl = createInterface({ input: proc.stdout })
    rl.on('line', (line) => {
      gotAnything = true
      let msg: Record<string, unknown>
      try {
        msg = JSON.parse(line)
      } catch {
        return
      }
      if (msg['type'] === 'system' && msg['subtype'] === 'init') {
        sessionId = (msg['session_id'] as string) ?? sessionId
      } else if (msg['type'] === 'stream_event') {
        const ev = msg['event'] as { type?: string; delta?: { type?: string; text?: string } }
        if (ev?.type === 'content_block_delta' && ev.delta?.type === 'text_delta' && ev.delta.text) {
          emit({ type: 'delta', text: ev.delta.text })
        }
      } else if (msg['type'] === 'assistant') {
        const content = (
          msg['message'] as {
            content?: { type: string; name?: string; input?: Record<string, unknown> }[]
          }
        )?.content
        for (const block of content ?? []) {
          if (block.type === 'tool_use' && block.name) {
            const input = block.input ?? {}
            const raw = input['file_path'] ?? input['path'] ?? input['pattern'] ?? input['command']
            const detail =
              typeof raw === 'string' ? (raw.length > 80 ? raw.slice(0, 77) + '…' : raw) : undefined
            emit({ type: 'tool', name: block.name, ...(detail ? { detail } : {}) })
          }
        }
      } else if (msg['type'] === 'result') {
        gotResult = true
        sessionId = (msg['session_id'] as string) ?? sessionId
        emit({ type: 'done', isError: msg['is_error'] === true })
      }
    })

    proc.on('close', (code) => {
      if (child === proc) child = null
      clearTimeout(silenceTimer)
      if (!gotResult) {
        const detail = stderrChunks.join('').trim().slice(0, 400)
        // Le CLI est installé mais la session n'est pas ouverte : cas courant
        // et sans rapport avec une vraie panne, on le distingue pour guider.
        const needsLogin =
          /log ?in|login|authenticat|credential|unauthorized|401|api key|invalid_?api/i.test(detail)
        emit({
          type: 'error',
          message:
            code === null
              ? 'cancelled'
              : needsLogin
                ? 'not-authenticated'
                : detail || `exit ${code}`
        })
      }
    })
  }

  return {
    send: (prompt, cwd, emit) => void send(prompt, cwd, emit),
    cancel: () => child?.kill(),
    reset: () => {
      child?.kill()
      sessionId = null
    }
  }
}

export const claudeProvider: Provider = {
  id: 'claude',
  name: 'Claude',
  kind: 'agent',
  loginCommand: 'claude auth login',
  status: async (): Promise<ProviderStatus> => {
    const bin = await resolveClaude()
    if (!bin) return 'missing'
    const ok = await loggedIn(bin)
    return ok === null ? 'unknown' : ok ? 'ready' : 'needs-login'
  },
  createSession
}
