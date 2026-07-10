import { create } from 'zustand'

export type Locale = 'fr' | 'en'

const dict = {
  fr: {
    files: 'Fichiers',
    terminal: 'Terminal',
    openFolder: 'Ouvrir un dossier',
    changeFolder: 'Changer de dossier',
    newFile: 'Nouveau fichier',
    newDir: 'Nouveau dossier',
    rename: 'Renommer',
    renameLabel: 'Renommer « {name} »',
    delete: 'Supprimer',
    trashConfirm: 'Mettre « {name} » à la corbeille ?',
    selectFile: "Sélectionne un fichier dans l'arbre pour l'ouvrir.",
    unsupported: "Type de fichier non pris en charge par l'éditeur (v1).",
    noFolder: 'Aucun dossier ouvert',
    shortcutsHint: 'Cmd+Shift+E fichiers · Cmd+J terminal',
    conflictMsg: 'Ce fichier a été modifié sur le disque.',
    reload: 'Recharger',
    keepMine: 'Conserver ma version',
    filesToggleTitle: 'Fichiers (Cmd+Shift+E)',
    terminalToggleTitle: 'Terminal (Cmd+J)',
    terminalExited: '[processus terminé — cliquez sur ⟳ pour relancer]',
    restartTerminal: 'Relancer le terminal dans le dossier ouvert',
    search: 'Recherche',
    searchPlaceholder: 'Rechercher dans le dossier…',
    searchNoResults: 'Aucun résultat',
    searchTooMany: 'Affichage limité aux {count} premiers résultats',
    closeSearch: 'Fermer la recherche (Cmd+Shift+E)',
    quickOpenPlaceholder: 'Aller au fichier…',
    themeToggle: 'Thème clair / sombre',
    fontCycle: 'Police (titre · corps)',
    reveal: 'Révéler dans le Finder',
    layout: 'Disposition',
    layoutEditorLeft: 'Éditeur à gauche',
    layoutEditorRight: 'Éditeur à droite',
    layoutSidebar: 'Barre latérale'
  },
  en: {
    files: 'Files',
    terminal: 'Terminal',
    openFolder: 'Open a folder',
    changeFolder: 'Change folder',
    newFile: 'New file',
    newDir: 'New folder',
    rename: 'Rename',
    renameLabel: 'Rename “{name}”',
    delete: 'Delete',
    trashConfirm: 'Move “{name}” to trash?',
    selectFile: 'Select a file in the tree to open it.',
    unsupported: 'File type not supported by the editor (v1).',
    noFolder: 'No folder open',
    shortcutsHint: 'Cmd+Shift+E files · Cmd+J terminal',
    conflictMsg: 'This file was changed on disk.',
    reload: 'Reload',
    keepMine: 'Keep my version',
    filesToggleTitle: 'Files (Cmd+Shift+E)',
    terminalToggleTitle: 'Terminal (Cmd+J)',
    terminalExited: '[process exited — click ⟳ to restart]',
    restartTerminal: 'Restart terminal in the open folder',
    search: 'Search',
    searchPlaceholder: 'Search in folder…',
    searchNoResults: 'No results',
    searchTooMany: 'Showing only the first {count} results',
    closeSearch: 'Close search (Cmd+Shift+E)',
    quickOpenPlaceholder: 'Go to file…',
    themeToggle: 'Light / dark theme',
    fontCycle: 'Font (title · body)',
    reveal: 'Reveal in Finder',
    layout: 'Layout',
    layoutEditorLeft: 'Editor left',
    layoutEditorRight: 'Editor right',
    layoutSidebar: 'Sidebar'
  }
} as const

export type TKey = keyof (typeof dict)['fr']

function detectLocale(): Locale {
  const stored = localStorage.getItem('stancode:locale')
  if (stored === 'fr' || stored === 'en') return stored
  return navigator.language.toLowerCase().startsWith('fr') ? 'fr' : 'en'
}

interface I18nState {
  locale: Locale
  setLocale: (locale: Locale) => void
}

export const useI18n = create<I18nState>((set) => ({
  locale: detectLocale(),
  setLocale: (locale) => {
    localStorage.setItem('stancode:locale', locale)
    window.stancode.setLocale(locale)
    set({ locale })
  }
}))

/** Hook réactif : const t = useT() ; t('openFolder') */
export function useT(): (key: TKey, vars?: Record<string, string>) => string {
  const locale = useI18n((s) => s.locale)
  return (key, vars) => {
    let text: string = dict[locale][key]
    if (vars) {
      for (const [k, v] of Object.entries(vars)) text = text.replace(`{${k}}`, v)
    }
    return text
  }
}
