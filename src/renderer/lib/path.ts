/* Manipulation de chemins côté renderer, indépendante de la plateforme.
   Les chemins viennent du processus principal : séparés par « / » sur macOS et
   Linux, par « \ » sur Windows (`C:\Users\...`). Le renderer n'a pas accès au
   module `path` de Node, d'où ces quelques fonctions. */

/** Vrai si le chemin utilise les séparateurs Windows. */
function isWindowsPath(path: string): boolean {
  return /^[a-zA-Z]:[\\/]/.test(path) || (path.includes('\\') && !path.includes('/'))
}

/** Séparateur utilisé par ce chemin. */
export function sepOf(path: string): string {
  return isWindowsPath(path) ? '\\' : '/'
}

/** Dernier segment : nom du fichier ou du dossier. */
export function basename(path: string): string {
  const i = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'))
  return i === -1 ? path : path.slice(i + 1)
}

/** Dossier parent. Renvoie la racine si le chemin n'a pas de parent. */
export function dirname(path: string): string {
  const i = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'))
  if (i === -1) return path
  if (i === 0) return '/' // « /fichier » sur unix
  if (/^[a-zA-Z]:$/.test(path.slice(0, i))) return path.slice(0, i + 1) // « C:\fichier »
  return path.slice(0, i)
}

/** Assemble un dossier et un nom avec le bon séparateur. */
export function joinPath(dir: string, name: string): string {
  const sep = sepOf(dir)
  return dir.endsWith(sep) ? `${dir}${name}` : `${dir}${sep}${name}`
}

/** Vrai si `path` est `parent` lui-même ou se trouve à l'intérieur. */
export function isInside(parent: string, path: string): boolean {
  return path === parent || path.startsWith(parent + sepOf(parent))
}

/** Chemin relatif à `root`, pour l'affichage (séparateurs conservés). */
export function relativeTo(root: string, path: string): string {
  if (!path.startsWith(root)) return path
  return path.slice(root.length).replace(/^[\\/]/, '')
}

const segments = (path: string): string[] => path.split(/[\\/]+/).filter(Boolean)

/** Chemin relatif d'un FICHIER vers un autre, tel qu'on l'écrit dans un lien
 *  markdown : toujours en « / », préfixé de « ./ » s'il reste dans le dossier.
 *  Ex. : (/notes/a/x.md, /notes/b/y.md) → « ../b/y.md ». */
export function relativeLink(fromFile: string, toFile: string): string {
  const from = segments(dirname(fromFile))
  const to = segments(toFile)
  let common = 0
  while (common < from.length && common < to.length && from[common] === to[common]) common++
  const remontees = from.slice(common).map(() => '..')
  const descente = to.slice(common)
  const parts = [...remontees, ...descente]
  const rel = parts.join('/')
  return remontees.length === 0 ? `./${rel}` : rel
}

/** Résout un lien relatif écrit dans une note en chemin absolu.
 *  Renvoie null pour une URL (http, mailto…) ou une ancre interne. */
export function resolveLink(fromFile: string, href: string): string | null {
  // Les destinations contenant une espace s'écrivent entre chevrons en markdown.
  const raw = href.startsWith('<') && href.endsWith('>') ? href.slice(1, -1) : href
  if (!raw || /^[a-z][a-z0-9+.-]*:/i.test(raw) || raw.startsWith('#')) return null
  let decoded = raw.split('#')[0]
  try {
    decoded = decodeURI(decoded)
  } catch {
    // séquence d'échappement invalide : on garde la chaîne telle quelle
  }
  if (!decoded) return null
  const sep = sepOf(fromFile)
  // Chemin déjà absolu (unix ou windows)
  if (/^([a-zA-Z]:[\\/]|\/)/.test(decoded)) return decoded
  const base = segments(dirname(fromFile))
  for (const part of segments(decoded)) {
    if (part === '.') continue
    if (part === '..') base.pop()
    else base.push(part)
  }
  const prefix = sep === '\\' ? '' : '/'
  return prefix + base.join(sep)
}
