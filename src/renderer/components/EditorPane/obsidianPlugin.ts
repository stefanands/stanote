import { Plugin, PluginKey, type EditorState } from '@milkdown/prose/state'
import { Decoration, DecorationSet } from '@milkdown/prose/view'
import type { TreeNode } from '../../../shared/types'
import { WIKILINK, parseWikilink, resolveWikilink } from '../../lib/wikilinks'

/* Affichage de la syntaxe Obsidian dans l'éditeur, par décorations : le texte
   de la note reste tel quel (et s'enregistre tel quel), seul son rendu change.

   - [[cible|libellé]] s'affiche comme un lien, crochets et cible masqués ;
     dès que le curseur y entre, la syntaxe brute réapparaît pour l'éditer.
   - > [!type] Titre devient un encadré coloré selon son type ; le marqueur
     [!type] ne se montre que lorsque le curseur est dans l'encadré. */

export interface WikiContext {
  /** note affichée : les cibles se cherchent d'abord dans son dossier */
  path: string
  root: string | null
  tree: TreeNode[]
}

/** Types de callout Obsidian → famille de couleur. */
const FAMILY: Record<string, string> = {
  note: 'note', info: 'note', todo: 'note', abstract: 'note', summary: 'note', tldr: 'note',
  tip: 'tip', hint: 'tip', important: 'tip',
  success: 'success', check: 'success', done: 'success',
  question: 'question', help: 'question', faq: 'question',
  warning: 'warning', caution: 'warning', attention: 'warning',
  failure: 'danger', fail: 'danger', missing: 'danger', danger: 'danger', error: 'danger', bug: 'danger',
  example: 'example',
  quote: 'quote', cite: 'quote'
}

const CALLOUT = /^\[!([\w-]+)\]([+-]?)/

function build(state: EditorState, ctx: WikiContext): DecorationSet {
  const decos: Decoration[] = []
  const { from: selFrom, to: selTo } = state.selection
  const touches = (a: number, b: number): boolean => selFrom <= b && selTo >= a

  state.doc.descendants((node, pos) => {
    // --- callouts ---
    if (node.type.name === 'blockquote') {
      const first = node.firstChild
      const m = first && first.type.name === 'paragraph' ? CALLOUT.exec(first.textContent) : null
      if (first && m) {
        const type = m[1].toLowerCase()
        const family = FAMILY[type] ?? 'note'
        const editing = touches(pos, pos + node.nodeSize)
        decos.push(Decoration.node(pos, pos + node.nodeSize, { class: 'callout', 'data-family': family }))
        const headStart = pos + 1 // ouverture du paragraphe de tête
        decos.push(Decoration.node(headStart, headStart + first.nodeSize, { class: 'callout-head' }))
        const textStart = headStart + 1
        const markerEnd = textStart + m[0].length
        decos.push(
          Decoration.inline(textStart, markerEnd, {
            class: editing ? 'callout-marker' : 'callout-marker is-hidden'
          })
        )
        // Titre : le reste de la première ligne ; à défaut, le nom du type.
        const text = first.textContent
        const nl = text.indexOf('\n')
        const titleEnd = textStart + (nl === -1 ? text.length : nl)
        if (text.slice(m[0].length, nl === -1 ? undefined : nl).trim()) {
          decos.push(Decoration.inline(markerEnd, titleEnd, { class: 'callout-title' }))
        } else if (!editing) {
          decos.push(
            Decoration.widget(markerEnd, () => {
              const span = document.createElement('span')
              span.className = 'callout-title'
              span.textContent = type.charAt(0).toUpperCase() + type.slice(1)
              return span
            }, { side: 1 })
          )
        }
      }
    }

    // --- wikilinks ---
    if (node.isText && node.text && node.text.includes('[[')) {
      for (const m of node.text.matchAll(WIKILINK)) {
        const a = pos + (m.index ?? 0)
        const b = a + m[0].length
        const link = parseWikilink(m[1], m[2])
        const resolved = ctx.root ? resolveWikilink(link.target, ctx.path, ctx.root, ctx.tree) : null
        const editing = touches(a, b)
        decos.push(
          Decoration.inline(a, b, {
            class: [
              'wikilink',
              resolved ? '' : 'is-unresolved',
              editing ? 'is-editing' : ''
            ].join(' ').trim(),
            // Cliquable seulement une fois rendu : en édition, un clic place le curseur.
            ...(editing ? {} : { 'data-wikilink': link.target })
          })
        )
        if (!editing) {
          // Masque « [[ », « ]] » et, avec un libellé, « cible| ».
          const hideEnd = m[2] !== undefined ? a + 2 + m[1].length + 1 : a + 2
          decos.push(Decoration.inline(a, hideEnd, { class: 'wikilink-syntax' }))
          decos.push(Decoration.inline(b - 2, b, { class: 'wikilink-syntax' }))
        }
      }
    }
  })
  return DecorationSet.create(state.doc, decos)
}

export const obsidianKey = new PluginKey('stanote-obsidian')

/** `getContext` est relu à chaque rendu : dossier et arborescence restent à jour. */
export function obsidianPlugin(getContext: () => WikiContext): Plugin {
  return new Plugin({
    key: obsidianKey,
    props: {
      decorations: (state) => build(state, getContext())
    }
  })
}
