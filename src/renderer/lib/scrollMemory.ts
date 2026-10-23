/* Position de lecture par fichier, pour la retrouver quand un éditeur est
   recréé (onglet sorti des onglets gardés en mémoire, fichier rechargé depuis
   le disque, changement de langue).

   La position est notée à chaque défilement : la lire au moment de détruire
   l'éditeur ne marche pas, l'élément est alors déjà retiré de la page et
   indique toujours 0. */

const positions = new Map<string, number>()

/** Suit le défilement de `el` sous la clé `key`. Rend la fonction d'arrêt. */
export function rememberScroll(el: HTMLElement, key: string): () => void {
  const onScroll = (): void => {
    positions.set(key, el.scrollTop)
  }
  el.addEventListener('scroll', onScroll, { passive: true })
  return () => el.removeEventListener('scroll', onScroll)
}

/** Remet `el` à la position notée. Le contenu peut grandir encore quelques
 *  instants après la création (rendu progressif, blocs de code) : on réessaie
 *  tant que la position n'est pas atteinte, une demi-seconde au plus. */
export function restoreScroll(el: HTMLElement, key: string): void {
  const top = positions.get(key)
  if (!top) return
  let tries = 0
  const attempt = (): void => {
    el.scrollTop = top
    if (Math.abs(el.scrollTop - top) > 2 && ++tries < 30) requestAnimationFrame(attempt)
  }
  // Tout de suite (le contenu est souvent déjà là), puis aux images suivantes.
  attempt()
}
