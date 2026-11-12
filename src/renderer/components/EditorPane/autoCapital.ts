import { Plugin } from '@milkdown/prose/state'
import { closeHistory } from '@milkdown/prose/history'

/* Majuscule en début de bloc : la première lettre tapée dans un paragraphe,
   un titre ou un élément de liste passe en majuscule. Après Maj+Entrée (saut
   de ligne dans le même bloc), on n'est plus en début de bloc : rien ne change.

   La lettre est d'abord insérée telle quelle, puis corrigée dans une étape
   d'historique à part : Cmd+Z juste après rend la minuscule (iPhone, npm…). */

export function autoCapitalPlugin(): Plugin {
  return new Plugin({
    props: {
      handleTextInput(view, from, to, text) {
        if (from !== to || !/^\p{Ll}$/u.test(text)) return false
        const $from = view.state.doc.resolve(from)
        const block = $from.parent
        if (!block.isTextblock || block.type.spec.code || $from.parentOffset !== 0) return false
        // Code en ligne déjà actif au curseur : on n'y touche pas.
        const marks = view.state.storedMarks ?? $from.marks()
        if (marks.some((m) => m.type.spec.code)) return false
        const upper = text.toUpperCase()
        if (upper === text) return false

        view.dispatch(view.state.tr.insertText(text, from, to))
        view.dispatch(closeHistory(view.state.tr.insertText(upper, from, from + text.length)))
        return true
      }
    }
  })
}
