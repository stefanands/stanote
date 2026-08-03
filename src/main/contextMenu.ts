import { Menu, type MenuItemConstructorOptions, type WebContents } from 'electron'
import { getLocale } from './appState'

const labels = {
  fr: {
    addToDict: 'Ajouter au dictionnaire',
    cut: 'Couper',
    copy: 'Copier',
    paste: 'Coller',
    selectAll: 'Tout sélectionner'
  },
  en: {
    addToDict: 'Add to Dictionary',
    cut: 'Cut',
    copy: 'Copy',
    paste: 'Paste',
    selectAll: 'Select All'
  }
} as const

/** Menu contextuel de l'éditeur : suggestions d'orthographe (Chromium/OS) +
 *  actions d'édition. Ne s'affiche que dans une zone éditable ou sur un mot
 *  mal orthographié, pour ne pas entrer en conflit avec le menu de l'arbre. */
export function registerContextMenu(wc: WebContents): void {
  wc.on('context-menu', (_event, params) => {
    if (!params.isEditable && !params.misspelledWord) return
    const l = labels[getLocale()]
    const items: MenuItemConstructorOptions[] = []

    if (params.misspelledWord && params.dictionarySuggestions.length > 0) {
      for (const s of params.dictionarySuggestions) {
        items.push({ label: s, click: () => wc.replaceMisspelling(s) })
      }
      items.push({ type: 'separator' })
    }
    if (params.misspelledWord) {
      items.push({
        label: l.addToDict,
        click: () => wc.session.addWordToSpellCheckerDictionary(params.misspelledWord)
      })
      items.push({ type: 'separator' })
    }

    const canEdit = params.isEditable
    items.push({ label: l.cut, role: 'cut', enabled: canEdit && params.editFlags.canCut })
    items.push({ label: l.copy, role: 'copy', enabled: params.editFlags.canCopy })
    items.push({ label: l.paste, role: 'paste', enabled: canEdit && params.editFlags.canPaste })
    items.push({ label: l.selectAll, role: 'selectAll', enabled: params.editFlags.canSelectAll })

    Menu.buildFromTemplate(items).popup()
  })
}
