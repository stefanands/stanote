import { app, ipcMain } from 'electron'
import { spawn, type ChildProcessWithoutNullStreams } from 'child_process'
import { join } from 'path'
import type { SearchMatch } from '../shared/types'

// Chemin du binaire résolu à la main : le package @vscode/ripgrep est ESM-only
// et son rgPath se base sur l'emplacement du module, incompatible avec le bundle CJS.
// Depuis la v1.18, le binaire vit dans un package par plateforme (comme esbuild).
// En app packagée, les binaires sont dépaquetés hors de l'asar (asarUnpack).
const rgPath = join(
  app.getAppPath().replace('app.asar', 'app.asar.unpacked'),
  'node_modules',
  '@vscode',
  `ripgrep-${process.platform}-${process.arch}`,
  'bin',
  process.platform === 'win32' ? 'rg.exe' : 'rg'
)

const MAX_RESULTS = 500

/** Recherche en cours par fenêtre (webContents.id) : annulée à chaque frappe. */
const byWin = new Map<number, ChildProcessWithoutNullStreams>()

export function disposeSearchForWebContents(id: number): void {
  byWin.get(id)?.kill()
  byWin.delete(id)
}

export function registerSearchHandlers(): void {
  ipcMain.handle(
    'search:query',
    (event, root: string, query: string): Promise<SearchMatch[]> => {
      const id = event.sender.id
      byWin.get(id)?.kill()
      return new Promise((resolve) => {
        const args = [
          '--json',
          '--smart-case',
          '--fixed-strings',
          '--max-count',
          '50',
          '--max-filesize',
          '1M',
          '-g',
          '!.git',
          '-g',
          '!node_modules',
          '--',
          query,
          root
        ]
        const proc = spawn(rgPath, args)
        byWin.set(id, proc)

        const results: SearchMatch[] = []
        let buffer = ''
        let done = false

        const finish = (): void => {
          if (done) return
          done = true
          if (byWin.get(id) === proc) byWin.delete(id)
          resolve(results)
        }

        proc.stdout.on('data', (chunk: Buffer) => {
          buffer += chunk.toString('utf-8')
          const lines = buffer.split('\n')
          buffer = lines.pop() ?? ''
          for (const line of lines) {
            if (!line) continue
            try {
              const event = JSON.parse(line)
              if (event.type !== 'match') continue
              results.push({
                file: event.data.path.text,
                line: event.data.line_number,
                text: String(event.data.lines.text ?? '').trimEnd().slice(0, 300)
              })
            } catch {
              // ligne JSON incomplète ou binaire : ignorée
            }
            if (results.length >= MAX_RESULTS) {
              proc.kill()
              finish()
              return
            }
          }
        })

        proc.on('close', finish)
        proc.on('error', finish)
      })
    }
  )
}
