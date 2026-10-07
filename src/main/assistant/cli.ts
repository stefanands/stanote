import { execFile, spawn } from 'child_process'
import { createInterface } from 'readline'
import { dirname } from 'path'

/* Outils communs aux fournisseurs qui pilotent un agent en ligne de commande
   (Claude Code, Codex, Mistral Vibe) : résolution du binaire, lancement, et
   lecture d'une sortie JSON ligne à ligne. */

/* Les apps GUI macOS n'héritent pas du PATH du shell : on résout le binaire via
   un shell de connexion. Seul un résultat positif est mis en cache — un CLI
   installé après le lancement de Stanote est ainsi détecté sans redémarrer. */
const bins = new Map<string, string>()

export async function resolveBin(name: string): Promise<string | null> {
  const cached = bins.get(name)
  if (cached) return cached
  const found = await new Promise<string | null>((resolve) => {
    execFile(process.env['SHELL'] ?? '/bin/zsh', ['-lc', `command -v ${name}`], (err, stdout) => {
      resolve(err ? null : stdout.trim().split('\n').pop() || null)
    })
  })
  if (found) bins.set(name, found)
  return found
}

/** Environnement de lancement : le dossier du binaire et les emplacements
 *  Homebrew en tête du PATH, pour que le CLI trouve ses propres dépendances. */
export function cliEnv(bin: string, extra: Record<string, string> = {}): NodeJS.ProcessEnv {
  return {
    ...process.env,
    ...extra,
    PATH: `${dirname(bin)}:/opt/homebrew/bin:/usr/local/bin:${process.env['PATH'] ?? ''}`
  }
}

/** Lance une commande courte et rend son code de sortie et ses sorties. */
export function runQuick(
  bin: string,
  args: string[]
): Promise<{ code: number | null; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    execFile(
      bin,
      args,
      { timeout: 10_000, env: cliEnv(bin), ...(process.platform === 'win32' ? { shell: true } : {}) },
      (err, stdout, stderr) => {
        const code = err ? (typeof err.code === 'number' ? err.code : null) : 0
        resolve({ code, stdout: String(stdout ?? ''), stderr: String(stderr ?? '') })
      }
    )
  })
}

/** Messages d'erreur révélant une session fermée ou une clé absente. */
export const NEEDS_LOGIN =
  /log ?in|login|authenticat|credential|unauthorized|401|api key|api_key|invalid_?api/i

/* Un agent qui n'a pas de session ouverte peut rester muet sans jamais rendre
   la main : sans garde-fou, l'interface attendrait indéfiniment. */
const SILENCE_MS = 25_000

interface RunOptions {
  bin: string
  args: string[]
  cwd: string
  env?: Record<string, string>
  /** texte envoyé sur l'entrée standard, puis fermée */
  stdin?: string
  /** un objet JSON lu sur la sortie standard (les lignes non JSON sont ignorées) */
  onMessage: (msg: Record<string, unknown>) => void
  /** aucune sortie pendant SILENCE_MS : le processus a été arrêté */
  onSilence: () => void
  /** fin du processus ; code null = tué (annulation ou silence) */
  onExit: (code: number | null, stderr: string) => void
}

/** Lance l'agent et relaie sa sortie JSON ligne à ligne. Rend de quoi l'arrêter. */
export function runJsonl(opts: RunOptions): { kill: () => void } {
  const proc = spawn(opts.bin, opts.args, { cwd: opts.cwd, env: cliEnv(opts.bin, opts.env) })
  if (opts.stdin !== undefined) proc.stdin.write(opts.stdin)
  proc.stdin.end()

  let heard = false
  let silenced = false
  const stderr: string[] = []
  proc.stderr.on('data', (d: Buffer) => stderr.push(d.toString()))

  const silence = setTimeout(() => {
    if (heard) return
    silenced = true
    proc.kill()
    opts.onSilence()
  }, SILENCE_MS)

  createInterface({ input: proc.stdout }).on('line', (line) => {
    heard = true
    let msg: unknown
    try {
      msg = JSON.parse(line)
    } catch {
      return
    }
    if (msg && typeof msg === 'object') opts.onMessage(msg as Record<string, unknown>)
  })

  proc.on('close', (code) => {
    clearTimeout(silence)
    if (silenced) return // déjà signalé par onSilence
    opts.onExit(code, stderr.join('').trim().slice(-600))
  })

  return { kill: () => proc.kill() }
}

/** Raccourcit un détail d'outil (chemin, commande) pour la trace d'activité. */
export function shorten(text: unknown): string | undefined {
  if (typeof text !== 'string' || !text) return undefined
  return text.length > 80 ? text.slice(0, 77) + '…' : text
}
