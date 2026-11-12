import { Crepe } from '@milkdown/crepe'
import { commandsCtx } from '@milkdown/kit/core'
import { clearTextInCurrentBlockCommand } from '@milkdown/kit/preset/commonmark'
import { EditorView } from '@codemirror/view'
import type { Locale } from '../../i18n'
import { useUi } from '../../stores/ui'

/** Icône « nouvelle note » du menu slash : page au coin plié, avec un +. */
const newNoteIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/><path d="M12 11v6M9 14h6"/></svg>`

/** Libellés localisés de l'UI Milkdown/Crepe (menu slash, placeholder, liens,
 *  images). Ne passe que du texte : les icônes gardent leurs valeurs par défaut. */
export function crepeFeatureConfigs(locale: Locale): NonNullable<
  ConstructorParameters<typeof Crepe>[0]
>['featureConfigs'] {
  const fr = locale === 'fr'
  return {
    [Crepe.Feature.Placeholder]: {
      text: fr ? 'Écrivez, ou tapez « / » pour les commandes…' : 'Write, or type "/" for commands…'
    },
    [Crepe.Feature.BlockEdit]: {
      // La poignée de bloc se pose dans la marge gauche de la note. Depuis que
      // les marges suivent la largeur du panneau, les 16 px de décalage par
      // défaut poussaient le « + » hors de la zone visible.
      blockHandle: { getOffset: () => 6 },
      // « Nouvelle note », en tête du menu : le « / » tapé est effacé, puis on
      // demande le nom de la note (LinkPicker en mode création).
      buildMenu: (builder) => {
        builder.addGroup('note', fr ? 'Note' : 'Note').addItem('newNote', {
          label: fr ? 'Nouvelle note' : 'New note',
          icon: newNoteIcon,
          onRun: (ctx) => {
            ctx.get(commandsCtx).call(clearTextInCurrentBlockCommand.key)
            useUi.getState().setNewNote(true)
          }
        })
        // build() rend la liste interne des groupes : on y remonte le nôtre.
        const groups = builder.build()
        groups.unshift(groups.pop()!)
      },
      textGroup: {
        label: fr ? 'Texte' : 'Text',
        text: { label: fr ? 'Texte' : 'Text' },
        h1: { label: fr ? 'Titre 1' : 'Heading 1' },
        h2: { label: fr ? 'Titre 2' : 'Heading 2' },
        h3: { label: fr ? 'Titre 3' : 'Heading 3' },
        h4: { label: fr ? 'Titre 4' : 'Heading 4' },
        h5: { label: fr ? 'Titre 5' : 'Heading 5' },
        h6: { label: fr ? 'Titre 6' : 'Heading 6' },
        quote: { label: fr ? 'Citation' : 'Quote' },
        divider: { label: fr ? 'Séparateur' : 'Divider' }
      },
      listGroup: {
        label: fr ? 'Listes' : 'List',
        bulletList: { label: fr ? 'Liste à puces' : 'Bullet List' },
        orderedList: { label: fr ? 'Liste numérotée' : 'Ordered List' },
        taskList: { label: fr ? 'Liste de tâches' : 'Task List' }
      },
      advancedGroup: {
        label: fr ? 'Avancé' : 'Advanced',
        image: { label: fr ? 'Image' : 'Image' },
        codeBlock: { label: fr ? 'Bloc de code' : 'Code Block' },
        table: { label: fr ? 'Tableau' : 'Table' },
        math: { label: fr ? 'Formule' : 'Math' }
      }
    },
    [Crepe.Feature.LinkTooltip]: {
      editButton: fr ? 'Modifier' : 'Edit',
      removeButton: fr ? 'Supprimer' : 'Remove',
      confirmButton: fr ? 'Confirmer' : 'Confirm',
      inputPlaceholder: fr ? 'Collez un lien…' : 'Paste a link…'
    },
    [Crepe.Feature.ImageBlock]: {
      inlineConfirmButton: fr ? 'Confirmer' : 'Confirm',
      inlineUploadButton: fr ? 'Téléverser' : 'Upload',
      inlineUploadPlaceholderText: fr ? "Ou collez le lien de l'image" : 'Or paste image link',
      blockConfirmButton: fr ? 'Confirmer' : 'Confirm',
      blockUploadButton: fr ? 'Téléverser un fichier' : 'Upload file',
      blockCaptionPlaceholderText: fr ? 'Légende…' : 'Write a caption…',
      blockUploadPlaceholderText: fr ? "Ou collez le lien de l'image" : 'Or paste image link'
    },
    [Crepe.Feature.CodeMirror]: {
      // Retour à la ligne dans les blocs de code : sans cette extension,
      // CodeMirror mesure ses lignes en supposant qu'elles ne s'enroulent
      // jamais (une pure surcharge CSS casserait son calcul de hauteur).
      extensions: [EditorView.lineWrapping]
    }
  }
}
