import { ipcMain, webContents as allWebContents } from 'electron'
import { execFile, spawn, type ChildProcessWithoutNullStreams } from 'child_process'
import { createInterface } from 'readline'
import { dirname } from 'path'
import type { ClaudeEvent } from '../shared/types'

/* « Demander à Claude » : pilote le CLI `claude` en mode headless
   (-p --output-format stream-json), une conversation par fenêtre, poursuivie
   entre les messages via --resume <session_id>. Édition auto (acceptEdits) :
   Claude peut lire/modifier les fichiers du dossier ouvert, l'éditeur recharge
   à chaud grâce au watcher existant. */

interface ClaudeState {
  child: ChildProcessWithoutNullStreams | null
  sessionId: string | null
}

const states = new Map<number, ClaudeState>()

function stateFor(id: number): ClaudeState {
  let s = states.get(id)
  if (!s) {
    s = { child: null, sessionId: null }
    states.set(id, s)
  }
  return s
}

/* Les apps GUI macOS n'héritent pas du PATH du shell : on résout le binaire
   une fois via un shell de connexion, puis on le lance directement. */
let claudeBin: string | null | undefined

async function resolveClaude(): Promise<string | null> {
  if (claudeBin !== undefined) return claudeBin
  claudeBin = await new Promise<string | null>((resolve) => {
    execFile(process.env['SHELL'] ?? '/bin/zsh', ['-lc', 'command -v claude'], (err, stdout) => {
      resolve(err ? null : stdout.trim().split('\n').pop() || null)
    })
  })
  return claudeBin
}

function send(id: number, event: ClaudeEvent): void {
  const wc = allWebContents.fromId(id)
  if (wc && !wc.isDestroyed()) wc.send('claude:event', event)
}

export function registerClaudeHandlers(): void {
  ipcMain.handle('claude:available', async () => (await resolveClaude()) !== null)

  ipcMain.handle('claude:send', async (event, prompt: string, cwd: string) => {
    const id = event.sender.id
    const state = stateFor(id)
    if (state.child) return // déjà en cours : le renderer bloque l'envoi

    const bin = await resolveClaude()
    if (!bin) {
      send(id, { type: 'error', message: 'claude-not-found' })
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
    if (state.sessionId) args.push('--resume', state.sessionId)

    const child = spawn(bin, args, {
      cwd,
      env: {
        ...process.env,
        PATH: `${dirname(bin)}:/opt/homebrew/bin:/usr/local/bin:${process.env['PATH'] ?? ''}`
      }
    })
    state.child = child
    child.stdin.write(prompt)
    child.stdin.end()

    let gotResult = false
    const stderrChunks: string[] = []
    child.stderr.on('data', (d: Buffer) => stderrChunks.push(d.toString()))

    const rl = createInterface({ input: child.stdout })
    rl.on('line', (line) => {
      let msg: Record<string, unknown>
      try {
        msg = JSON.parse(line)
      } catch {
        return
      }
      if (msg['type'] === 'system' && msg['subtype'] === 'init') {
        state.sessionId = (msg['session_id'] as string) ?? state.sessionId
      } else if (msg['type'] === 'stream_event') {
        const ev = msg['event'] as { type?: string; delta?: { type?: string; text?: string } }
        if (ev?.type === 'content_block_delta' && ev.delta?.type === 'text_delta' && ev.delta.text) {
          send(id, { type: 'delta', text: ev.delta.text })
        }
      } else if (msg['type'] === 'assistant') {
        const content = (
          msg['message'] as { content?: { type: string; name?: string; input?: Record<string, unknown> }[] }
        )?.content
        for (const block of content ?? []) {
          if (block.type === 'tool_use' && block.name) {
            const input = block.input ?? {}
            const raw = input['file_path'] ?? input['path'] ?? input['pattern'] ?? input['command']
            const detail =
              typeof raw === 'string' ? (raw.length > 80 ? raw.slice(0, 77) + '…' : raw) : undefined
            send(id, { type: 'tool', name: block.name, ...(detail ? { detail } : {}) })
          }
        }
      } else if (msg['type'] === 'result') {
        gotResult = true
        state.sessionId = (msg['session_id'] as string) ?? state.sessionId
        send(id, { type: 'done', isError: msg['is_error'] === true })
      }
    })

    child.on('close', (code) => {
      state.child = null
      if (!gotResult) {
        const detail = stderrChunks.join('').trim().slice(0, 400)
        send(id, {
          type: 'error',
          message: code === null ? 'cancelled' : detail || `exit ${code}`
        })
      }
    })
  })

  ipcMain.handle('claude:cancel', (event) => {
    stateFor(event.sender.id).child?.kill()
  })

  ipcMain.handle('claude:reset', (event) => {
    const state = stateFor(event.sender.id)
    state.child?.kill()
    state.sessionId = null
  })
}

export function disposeClaudeForWebContents(id: number): void {
  const state = states.get(id)
  if (state) {
    state.child?.kill()
    states.delete(id)
  }
}
