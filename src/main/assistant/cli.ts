import { execFile, type ChildProcess } from 'child_process'
import { createInterface } from 'readline'
import { dirname } from 'path'
import crossSpawn from 'cross-spawn'

/* Outils communs aux fournisseurs qui pilotent un agent en ligne de commande
   (Claude Code, Codex, Mistral Vibe) : résolution du binaire, lancement, et
   lecture d'une sortie JSON ligne à ligne.

   Windows : les CLI installés par npm sont des scripts .cmd, que Node refuse de
   lancer sans passer par cmd.exe — et cmd.exe interprète les espaces, les
   guillemets et les caractères spéciaux des arguments. cross-spawn s'en charge
   (protection des arguments, chemins avec espaces, messages en argument). */

const isWin = process.platform === 'win32'

/* Les apps GUI macOS n'héritent pas du PATH du shell : on résout le binaire via
   un shell de connexion. Sous Windows, `where` parcourt le PATH. Seul un
   résultat positif est mis en cache — un CLI installé après le lancement de
   Stanote est ainsi détecté sans redémarrer. */
const bins = new Map<string, string>()

function locate(name: string): Promise<string | null> {
  return new Promise((resolve) => {
    if (isWin) {
      execFile('where', [name], { windowsHide: true }, (err, stdout) => {
        const hits = err ? [] : stdout.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
        // npm installe côte à côte `claude` (script sh), `claude.cmd` et
        // `claude.ps1` : seuls .exe et .cmd se lancent depuis Stanote.
        resolve(hits.find((h) => /\.exe$/i.test(h)) ?? hits.find((h) => /\.(cmd|bat)$/i.test(h)) ?? null)
      })
    } else {
      execFile(process.env['SHELL'] ?? '/bin/zsh', ['-lc', `command -v ${name}`], (err, stdout) => {
        resolve(err ? null : stdout.trim().split('\n').pop() || null)
      })
    }
  })
}

export async function resolveBin(name: string): Promise<string | null> {
  const cached = bins.get(name)
  if (cached) return cached
  const found = await locate(name)
  if (found) bins.set(name, found)
  return found
}

/** Environnement de lancement : le dossier du binaire (et, sur macOS, les
 *  emplacements Homebrew) en tête du PATH, pour que le CLI trouve ses propres
 *  dépendances. */
export function cliEnv(bin: string, extra: Record<string, string> = {}): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env, ...extra }
  if (isWin) {
    // Windows nomme la variable « Path » : en ajouter une seconde « PATH »
    // donnerait deux variables concurrentes au processus lancé.
    const key = Object.keys(env).find((k) => k.toUpperCase() === 'PATH') ?? 'Path'
    env[key] = `${dirname(bin)};${env[key] ?? ''}`
  } else {
    env['PATH'] = `${dirname(bin)}:/opt/homebrew/bin:/usr/local/bin:${env['PATH'] ?? ''}`
  }
  return env
}

/** Lance un CLI, scripts .cmd compris sous Windows, sans fenêtre de console. */
function launch(bin: string, args: string[], cwd: string | undefined, env: NodeJS.ProcessEnv): ChildProcess {
  return crossSpawn(bin, args, { cwd, env, windowsHide: true })
}

/** Arrête le CLI. Sous Windows, un .cmd tourne derrière cmd.exe : tuer cmd.exe
 *  seul laisserait l'agent tourner ; taskkill /T emporte toute l'arborescence. */
function stop(proc: ChildProcess): void {
  if (isWin && proc.pid) {
    execFile('taskkill', ['/pid', String(proc.pid), '/T', '/F'], { windowsHide: true }, () => {})
  } else {
    proc.kill()
  }
}

/** Lance une commande courte et rend son code de sortie et ses sorties. */
export function runQuick(
  bin: string,
  args: string[]
): Promise<{ code: number | null; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const proc = launch(bin, args, undefined, cliEnv(bin))
    let stdout = ''
    let stderr = ''
    proc.stdout?.on('data', (d: Buffer) => (stdout += d.toString()))
    proc.stderr?.on('data', (d: Buffer) => (stderr += d.toString()))
    const timer = setTimeout(() => stop(proc), 10_000)
    let done = false
    const finish = (code: number | null): void => {
      if (done) return
      done = true
      clearTimeout(timer)
      resolve({ code, stdout, stderr })
    }
    proc.on('error', () => finish(null))
    proc.on('close', (code) => finish(code))
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
  const proc = launch(opts.bin, opts.args, opts.cwd, cliEnv(opts.bin, opts.env))
  if (opts.stdin !== undefined) proc.stdin?.write(opts.stdin)
  proc.stdin?.end()

  let heard = false
  let silenced = false
  let ended = false
  /** arrêt demandé par Stanote : rapporté comme tel (code null), quel que
   *  soit le code de sortie qu'impose le système (taskkill rend 1). */
  let stopped = false
  const stderr: string[] = []
  proc.stderr?.on('data', (d: Buffer) => stderr.push(d.toString()))

  const silence = setTimeout(() => {
    if (heard) return
    silenced = true
    stop(proc)
    opts.onSilence()
  }, SILENCE_MS)

  if (proc.stdout) {
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
  }

  const end = (code: number | null, reason: string): void => {
    if (ended) return
    ended = true
    clearTimeout(silence)
    if (silenced) return // déjà signalé par onSilence
    opts.onExit(stopped ? null : code, reason)
  }
  // Échec du lancement lui-même (binaire disparu, droits) : sans cet écouteur,
  // l'erreur ferait tomber le processus principal.
  proc.on('error', (err) => end(1, err.message))
  proc.on('close', (code) => end(code, stderr.join('').trim().slice(-600)))

  return {
    kill: () => {
      stopped = true
      stop(proc)
    }
  }
}

/** Raccourcit un détail d'outil (chemin, commande) pour la trace d'activité. */
export function shorten(text: unknown): string | undefined {
  if (typeof text !== 'string' || !text) return undefined
  return text.length > 80 ? text.slice(0, 77) + '…' : text
}
