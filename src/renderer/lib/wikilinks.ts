import type { TreeNode } from '../../shared/types'
import { dirname } from './path'

/* Wikilinks à la manière d'Obsidian : [[cible]], [[cible|libellé]],
   [[cible#titre]], [[dossier/cible]]. La cible est un nom de note, sans son
   extension, cherché dans tout le dossier ouvert. */

/** `[[cible]]` ou `[[cible|libellé]]`, sur une seule ligne. */
export const WIKILINK = /\[\[([^[\]\n|]+?)(?:\|([^[\]\n]+?))?\]\]/g

export interface Wikilink {
  /** nom ou chemin de la note visée, sans titre ni bloc */
  target: string
  /** texte affiché à la place de la cible, s'il y en a un */
  alias: string | null
}

export function parseWikilink(inner: string, alias?: string | null): Wikilink {
  // « note#titre » ou « note^bloc » : seule la note compte pour l'ouvrir.
  const target = inner.split(/[#^]/)[0].trim()
  return { target, alias: alias?.trim() || null }
}

const NOTE_EXT = /\.(md|markdown|txt)$/i
const stripNoteExt = (name: string): string => name.replace(NOTE_EXT, '')
const norm = (s: string): string => s.replace(/\\/g, '/').toLowerCase()

/* Liste à plat des fichiers, recalculée seulement quand l'arbre change. */
let flatFor: TreeNode[] | null = null
let flat: TreeNode[] = []
function filesOf(tree: TreeNode[]): TreeNode[] {
  if (tree === flatFor) return flat
  const out: TreeNode[] = []
  const walk = (nodes: TreeNode[]): void => {
    for (const n of nodes) {
      if (n.type === 'file') out.push(n)
      else if (n.children) walk(n.children)
    }
  }
  walk(tree)
  flatFor = tree
  flat = out
  return out
}

/** Chemin de la note visée, ou null si aucune ne correspond. Insensible à la
 *  casse ; une cible avec « / » est un chemin depuis la racine du dossier.
 *  Plusieurs notes du même nom : celle du dossier courant d'abord, puis la
 *  moins profonde. */
export function resolveWikilink(
  target: string,
  fromFile: string,
  root: string,
  tree: TreeNode[]
): string | null {
  if (!target) return null
  const wanted = norm(stripNoteExt(target))
  const hasExt = /\.[a-z0-9]+$/i.test(target) && !NOTE_EXT.test(target)
  const rootN = norm(root).replace(/\/$/, '')
  const candidates = filesOf(tree).filter((f) => {
    const rel = norm(f.path).slice(rootN.length + 1)
    const relNoExt = hasExt ? rel : stripNoteExt(rel)
    if (wanted.includes('/')) return relNoExt === wanted || relNoExt.endsWith('/' + wanted)
    const name = norm(f.name)
    return (hasExt ? name : stripNoteExt(name)) === wanted && (hasExt || NOTE_EXT.test(f.name))
  })
  if (candidates.length === 0) return null
  const here = norm(dirname(fromFile))
  const depth = (p: string): number => norm(p).split('/').length
  candidates.sort((a, b) => {
    const ah = norm(dirname(a.path)) === here ? 0 : 1
    const bh = norm(dirname(b.path)) === here ? 0 : 1
    return ah - bh || depth(a.path) - depth(b.path) || a.path.localeCompare(b.path)
  })
  return candidates[0].path
}
