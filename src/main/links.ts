import { ipcMain } from 'electron'
import { promises as fsp } from 'fs'
import { dirname, join, relative, sep } from 'path'

/* Suivi des liens entre notes : quand un fichier ou un dossier est déplacé ou
   renommé depuis l'arborescence, les liens markdown relatifs doivent être
   recalculés — dans les deux sens :
     1. les liens des AUTRES notes qui pointaient vers l'élément déplacé ;
     2. les liens DANS les notes déplacées, puisqu'ils étaient relatifs à
        l'ancien emplacement.
   Ne concerne que les déplacements faits dans Stanote : un déplacement depuis
   le Finder n'est vu que comme une disparition suivie d'une apparition. */

const NOTE = /\.(md|markdown|txt)$/i
const IGNORED = /(^|[/\\])(\.git|node_modules|\.obsidian)([/\\]|$)/

/* Liens et images markdown : [texte](cible), [texte](cible "titre") et
   [texte](<cible avec espaces>) — cette dernière forme est celle que produit
   l'éditeur dès que le nom de fichier contient une espace. */
const LINK = /(!?\[[^\]]*\]\(\s*)(<[^<>]*>|[^)\s]+)((?:\s+"[^"]*")?\s*\))/g

/** Retire les chevrons éventuels autour d'une destination. */
const unwrap = (href: string): string =>
  href.startsWith('<') && href.endsWith('>') ? href.slice(1, -1) : href

async function listNotes(dir: string, out: string[] = []): Promise<string[]> {
  let entries
  try {
    entries = await fsp.readdir(dir, { withFileTypes: true })
  } catch {
    return out
  }
  for (const entry of entries) {
    const full = join(dir, entry.name)
    if (IGNORED.test(full)) continue
    if (entry.isDirectory()) await listNotes(full, out)
    else if (entry.isFile() && NOTE.test(entry.name)) out.push(full)
  }
  return out
}

/** Chemin absolu visé par un lien relatif écrit dans `fromFile`. */
function resolveTarget(fromFile: string, href: string): string | null {
  const raw = unwrap(href)
  if (!raw || /^[a-z][a-z0-9+.-]*:/i.test(raw) || raw.startsWith('#')) return null
  let clean = raw.split('#')[0]
  try {
    clean = decodeURI(clean)
  } catch {
    // séquence d'échappement invalide : on garde la chaîne telle quelle
  }
  if (!clean) return null
  return join(dirname(fromFile), clean)
}

/** Lien relatif à écrire dans `fromFile` pour viser `target`. Un chemin
 *  contenant une espace ou une parenthèse est placé entre chevrons, comme le
 *  fait l'éditeur — plus lisible qu'un encodage en %20. */
function toHref(fromFile: string, target: string): string {
  const rel = relative(dirname(fromFile), target).split(sep).join('/')
  const path = rel.startsWith('..') ? rel : `./${rel}`
  return /[\s()<>]/.test(path) ? `<${path}>` : path
}

/** Nouveau chemin d'une cible, si elle faisait partie de l'élément déplacé. */
function remap(target: string, oldPath: string, newPath: string): string {
  if (target === oldPath) return newPath
  if (target.startsWith(oldPath + sep)) return newPath + target.slice(oldPath.length)
  return target
}

export function registerLinkHandlers(): void {
  ipcMain.handle(
    'links:updateAfterMove',
    async (_event, root: string, oldPath: string, newPath: string): Promise<number> => {
      if (!root || oldPath === newPath) return 0
      const notes = await listNotes(root)
      let touched = 0

      for (const note of notes) {
        // Emplacement de cette note AVANT le déplacement : c'est par rapport à
        // lui que ses liens actuels doivent être lus.
        const noteBefore = note.startsWith(newPath + sep)
          ? oldPath + note.slice(newPath.length)
          : note === newPath
            ? oldPath
            : note

        let content: string
        try {
          content = await fsp.readFile(note, 'utf-8')
        } catch {
          continue
        }

        let changed = false
        const updated = content.replace(LINK, (whole, prefix: string, href: string, suffix) => {
          const before = resolveTarget(noteBefore, href)
          if (!before) return whole // URL, ancre… : rien à faire
          const after = remap(before, oldPath, newPath)
          // Rien ne bouge : ni la cible, ni l'emplacement de la note.
          if (after === before && note === noteBefore) return whole
          const nextHref = toHref(note, after)
          if (nextHref === href) return whole
          changed = true
          return `${prefix}${nextHref}${suffix}`
        })

        if (changed) {
          try {
            // Volontairement PAS marqué comme écriture interne : le watcher
            // doit prévenir le renderer pour que les onglets ouverts se
            // rechargent avec les liens corrigés.
            await fsp.writeFile(note, updated, 'utf-8')
            touched++
          } catch {
            // fichier en lecture seule ou disparu : on continue
          }
        }
      }
      return touched
    }
  )
}
