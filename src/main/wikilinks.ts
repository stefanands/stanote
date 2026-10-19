import { basename, relative, sep } from 'path'

/* Wikilinks Obsidian côté disque : à qui pointent-ils (liens entrants), et
   comment les réécrire quand une note est renommée ou déplacée. Une cible
   est un nom de note sans extension, ou un chemin depuis la racine du dossier
   ouvert s'il contient « / ». Comparaisons insensibles à la casse, comme
   Obsidian sur macOS. */

/** `[[cible]]`, `[[cible#titre]]`, `[[cible|libellé]]`, sur une seule ligne. */
export const WIKILINK = /\[\[([^[\]\n|]+?)(?:\|([^[\]\n]+?))?\]\]/g

const NOTE_EXT = /\.(md|markdown|txt)$/i
const noExt = (s: string): string => s.replace(NOTE_EXT, '')

/** Chemin depuis la racine, en « / », sans extension de note. */
function relNoExt(root: string, file: string): string {
  return noExt(relative(root, file).split(sep).join('/'))
}

/** Sépare la cible de son ancre éventuelle (`#titre`, `^bloc`). */
export function splitTarget(inner: string): { target: string; anchor: string } {
  const i = inner.search(/[#^]/)
  return i === -1 ? { target: inner.trim(), anchor: '' } : { target: inner.slice(0, i).trim(), anchor: inner.slice(i) }
}

/** Vrai si la cible d'un wikilink désigne ce fichier. */
export function pointsTo(target: string, file: string, root: string): boolean {
  const t = noExt(target.replace(/\\/g, '/')).toLowerCase()
  if (!t || !NOTE_EXT.test(file)) return false
  if (t.includes('/')) {
    const rel = relNoExt(root, file).toLowerCase()
    return rel === t || rel.endsWith('/' + t)
  }
  return noExt(basename(file)).toLowerCase() === t
}

/** Réécrit les wikilinks touchés par le déplacement ou le renommage de
 *  `oldPath` en `newPath` (fichier ou dossier). Un lien par nom ne change que
 *  si le nom de la note change ; un lien par chemin suit le chemin. */
export function rewriteWikilinks(
  content: string,
  root: string,
  oldPath: string,
  newPath: string
): { text: string; changed: boolean } {
  let changed = false
  const oldRel = relNoExt(root, oldPath)
  const newRel = relNoExt(root, newPath)
  const oldName = noExt(basename(oldPath))
  const newName = noExt(basename(newPath))
  const isNote = NOTE_EXT.test(oldPath)

  const text = content.replace(WIKILINK, (whole, inner: string, alias?: string) => {
    const { target, anchor } = splitTarget(inner)
    const t = noExt(target.replace(/\\/g, '/'))
    let next: string | null = null
    if (t.includes('/')) {
      const lower = t.toLowerCase()
      const from = oldRel.toLowerCase()
      if (lower === from) next = newRel
      else if (lower.startsWith(from + '/')) next = newRel + t.slice(oldRel.length) // dossier déplacé
    } else if (isNote && oldName !== newName && t.toLowerCase() === oldName.toLowerCase()) {
      next = newName
    }
    if (next === null) return whole
    changed = true
    return `[[${next}${anchor}${alias !== undefined ? '|' + alias : ''}]]`
  })
  return { text, changed }
}
