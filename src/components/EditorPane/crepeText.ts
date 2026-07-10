import { Crepe } from '@milkdown/crepe'
import type { Locale } from '../../i18n'

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
    }
  }
}
