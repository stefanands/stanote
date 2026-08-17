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
  // « C:\fichier » → garder « C:\ »
  if (/^[a-zA-Z]:$/.test(path.slice(0, i))) return path.slice(0, i + 1)
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
