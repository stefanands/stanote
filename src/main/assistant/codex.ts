import type { ProviderStatus, Tier } from '../../shared/types'
import { NEEDS_LOGIN, resolveBin, runJsonl, runQuick, shorten } from './cli'
import type { AssistantSession, Emit, Provider } from './types'

/* Fournisseur Codex : pilote `codex exec --json` (événements JSONL), la
   conversation se poursuit via `codex exec resume <thread_id>`. Bac à sable
   workspace-write : Codex peut modifier les fichiers du dossier ouvert, pas
   au-delà. Le modèle reste celui de la configuration de l'utilisateur ; la
   gamme règle l'effort de raisonnement. */

const EFFORT: Record<Tier, string> = { fast: 'low', standard: 'medium', reasoning: 'high' }

/** `/bin/zsh -lc "sed -n '1,20p' note.md"` → `sed -n '1,20p' note.md` */
function unwrapShell(command: unknown): unknown {
  if (typeof command !== 'string') return command
  const m = /^\S+\s+-l?c\s+(["'])([\s\S]*)\1$/.exec(command)
  return m ? m[2] : command
}

interface CodexItem {
  id?: string
  type?: string
  text?: string
  command?: string
  changes?: { path?: string }[]
  query?: string
  tool?: string
}

function createSession(): AssistantSession {
  let run: { kill: () => void } | null = null
  let threadId: string | null = null

  const send = async (prompt: string, cwd: string, tier: Tier, emit: Emit): Promise<void> => {
    if (run) return
    const bin = await resolveBin('codex')
    if (!bin) return emit({ type: 'error', message: 'not-found' })

    const effort = `model_reasoning_effort="${EFFORT[tier]}"`
    // `resume` n'accepte ni -C ni -s : dossier = celui du processus, bac à
    // sable passé par la configuration. Le message arrive par l'entrée standard.
    const args = threadId
      ? ['exec', 'resume', '--json', '--skip-git-repo-check', '-c', 'sandbox_mode="workspace-write"', '-c', effort, threadId, '-']
      : ['exec', '--json', '--skip-git-repo-check', '-s', 'workspace-write', '-C', cwd, '-c', effort, '-']

    let finished = false
    let lastError = ''
    /** dernier élément émis : du texte, pour séparer deux réponses consécutives */
    let lastWasText = false
    const announced = new Set<string>()

    const tool = (item: CodexItem, name: string, detail: unknown): void => {
      if (item.id && announced.has(item.id)) return
      if (item.id) announced.add(item.id)
      const d = shorten(detail)
      emit({ type: 'tool', name, ...(d ? { detail: d } : {}) })
      lastWasText = false
    }

    const current = runJsonl({
      bin,
      args,
      cwd,
      stdin: prompt,
      onMessage: (msg) => {
        const type = msg['type']
        const item = (msg['item'] ?? {}) as CodexItem
        if (type === 'thread.started') {
          threadId = (msg['thread_id'] as string) ?? threadId
        } else if (type === 'item.started' || type === 'item.completed') {
          if (item.type === 'agent_message' && type === 'item.completed' && item.text) {
            emit({ type: 'delta', text: (lastWasText ? '\n\n' : '') + item.text })
            lastWasText = true
          } else if (item.type === 'command_execution') {
            tool(item, 'Bash', unwrapShell(item.command))
          } else if (item.type === 'file_change') {
            tool(item, 'Edit', item.changes?.[0]?.path)
          } else if (item.type === 'web_search') {
            tool(item, 'WebSearch', item.query)
          } else if (item.type === 'mcp_tool_call') {
            tool(item, item.tool ?? 'Tool', undefined)
          }
          // 'reasoning' et 'error' (simples avertissements internes) : ignorés.
        } else if (type === 'turn.completed') {
          finished = true
          emit({ type: 'done', isError: false })
        } else if (type === 'turn.failed') {
          lastError = ((msg['error'] as { message?: string })?.message ?? '').trim()
        } else if (type === 'error') {
          lastError = String(msg['message'] ?? '').trim()
        }
      },
      onSilence: () => {
        run = null
        emit({ type: 'error', message: 'no-response' })
      },
      onExit: (code) => {
        if (run === current) run = null
        if (finished) return
        // Fin réussie, même si l'événement de conclusion venait à changer.
        if (code === 0) return emit({ type: 'done', isError: false })
        // Codex écrit beaucoup de bruit sur stderr (greffons, compétences) :
        // seule l'erreur qu'il signale lui-même fait foi.
        emit({
          type: 'error',
          message:
            code === null
              ? 'cancelled'
              : NEEDS_LOGIN.test(lastError)
                ? 'not-authenticated'
                : lastError || `exit ${code}`
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
      threadId = null
    }
  }
}

export const codexProvider: Provider = {
  id: 'codex',
  name: 'Codex',
  kind: 'agent',
  loginCommand: 'codex login',
  tiers: { fast: 'effort low', standard: 'effort medium', reasoning: 'effort high' },
  status: async (): Promise<ProviderStatus> => {
    const bin = await resolveBin('codex')
    if (!bin) return 'missing'
    // Le code de sortie fait foi, pas le libellé (« Logged in using ChatGPT »,
    // écrit sur la sortie d'erreur) qui peut changer d'une version à l'autre.
    const { code } = await runQuick(bin, ['login', 'status'])
    return code === 0 ? 'ready' : code === null ? 'unknown' : 'needs-login'
  },
  createSession
}
