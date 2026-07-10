import { app, BrowserWindow, ipcMain, Menu, type MenuItemConstructorOptions } from 'electron'

export type Locale = 'fr' | 'en'

const labels = {
  fr: {
    file: 'Fichier',
    newWindow: 'Nouvelle fenêtre',
    openFolder: 'Ouvrir un dossier…',
    exportPdf: 'Exporter en PDF…',
    save: 'Enregistrer',
    closeTab: "Fermer l'onglet",
    edit: 'Édition',
    undo: 'Annuler',
    redo: 'Rétablir',
    cut: 'Couper',
    copy: 'Copier',
    paste: 'Coller',
    selectAll: 'Tout sélectionner',
    view: 'Affichage',
    layout: 'Disposition',
    layoutEditorLeft: 'Éditeur à gauche',
    layoutEditorRight: 'Éditeur à droite',
    layoutSidebar: 'Barre latérale',
    reload: 'Recharger',
    devtools: 'Outils de développement',
    zoomIn: 'Agrandir',
    zoomOut: 'Réduire',
    zoomReset: 'Taille réelle',
    fullscreen: 'Plein écran',
    window: 'Fenêtre',
    minimize: 'Réduire',
    close: 'Fermer'
  },
  en: {
    file: 'File',
    newWindow: 'New Window',
    openFolder: 'Open Folder…',
    exportPdf: 'Export to PDF…',
    save: 'Save',
    closeTab: 'Close Tab',
    edit: 'Edit',
    undo: 'Undo',
    redo: 'Redo',
    cut: 'Cut',
    copy: 'Copy',
    paste: 'Paste',
    selectAll: 'Select All',
    view: 'View',
    layout: 'Layout',
    layoutEditorLeft: 'Editor Left',
    layoutEditorRight: 'Editor Right',
    layoutSidebar: 'Sidebar',
    reload: 'Reload',
    devtools: 'Toggle Developer Tools',
    zoomIn: 'Zoom In',
    zoomOut: 'Zoom Out',
    zoomReset: 'Actual Size',
    fullscreen: 'Toggle Full Screen',
    window: 'Window',
    minimize: 'Minimize',
    close: 'Close'
  }
} as const

interface MenuHandlers {
  onNewWindow: () => void
}

let handlers: MenuHandlers = { onNewWindow: () => {} }

function send(action: string): void {
  BrowserWindow.getFocusedWindow()?.webContents.send('menu:action', action)
}

function buildMenu(locale: Locale): void {
  const isMac = process.platform === 'darwin'
  const l = labels[locale]

  const template: MenuItemConstructorOptions[] = [
    ...(isMac
      ? [
          {
            label: app.name,
            submenu: [
              { role: 'about' as const },
              { type: 'separator' as const },
              { role: 'hide' as const },
              { role: 'hideOthers' as const },
              { role: 'unhide' as const },
              { type: 'separator' as const },
              { role: 'quit' as const }
            ]
          }
        ]
      : []),
    {
      label: l.file,
      submenu: [
        { label: l.newWindow, accelerator: 'CmdOrCtrl+Shift+N', click: () => handlers.onNewWindow() },
        { type: 'separator' },
        { label: l.openFolder, accelerator: 'CmdOrCtrl+O', click: () => send('openFolder') },
        { label: l.exportPdf, click: () => send('exportPdf') },
        { type: 'separator' },
        { label: l.save, accelerator: 'CmdOrCtrl+S', click: () => send('save') },
        { label: l.closeTab, accelerator: 'CmdOrCtrl+W', click: () => send('closeTab') }
      ]
    },
    {
      label: l.edit,
      submenu: [
        { label: l.undo, accelerator: 'CmdOrCtrl+Z', role: 'undo' },
        { label: l.redo, accelerator: 'Shift+CmdOrCtrl+Z', role: 'redo' },
        { type: 'separator' },
        { label: l.cut, accelerator: 'CmdOrCtrl+X', role: 'cut' },
        { label: l.copy, accelerator: 'CmdOrCtrl+C', role: 'copy' },
        { label: l.paste, accelerator: 'CmdOrCtrl+V', role: 'paste' },
        { label: l.selectAll, accelerator: 'CmdOrCtrl+A', role: 'selectAll' }
      ]
    },
    {
      label: l.view,
      submenu: [
        {
          label: l.layout,
          submenu: [
            {
              label: l.layoutEditorLeft,
              accelerator: 'CmdOrCtrl+Alt+1',
              click: () => send('layout:editor-left')
            },
            {
              label: l.layoutEditorRight,
              accelerator: 'CmdOrCtrl+Alt+2',
              click: () => send('layout:editor-right')
            },
            {
              label: l.layoutSidebar,
              accelerator: 'CmdOrCtrl+Alt+3',
              click: () => send('layout:sidebar')
            }
          ]
        },
        { type: 'separator' },
        { label: l.reload, accelerator: 'CmdOrCtrl+R', role: 'reload' },
        { label: l.devtools, accelerator: 'Alt+CmdOrCtrl+I', role: 'toggleDevTools' },
        { type: 'separator' },
        { label: l.zoomReset, accelerator: 'CmdOrCtrl+0', role: 'resetZoom' },
        { label: l.zoomIn, accelerator: 'CmdOrCtrl+Plus', role: 'zoomIn' },
        { label: l.zoomOut, accelerator: 'CmdOrCtrl+-', role: 'zoomOut' },
        { type: 'separator' },
        { label: l.fullscreen, role: 'togglefullscreen' }
      ]
    },
    {
      label: l.window,
      submenu: [
        { label: l.minimize, accelerator: 'CmdOrCtrl+M', role: 'minimize' },
        { label: l.close, accelerator: 'Shift+CmdOrCtrl+W', role: 'close' }
      ]
    }
  ]

  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

export function setupMenu(menuHandlers: MenuHandlers): void {
  handlers = menuHandlers
  buildMenu(app.getLocale().toLowerCase().startsWith('fr') ? 'fr' : 'en')
  ipcMain.on('app:setLocale', (_event, locale: Locale) => {
    buildMenu(locale === 'fr' ? 'fr' : 'en')
  })
}
