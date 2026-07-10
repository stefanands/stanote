import { useEffect, useState } from 'react'
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels'
import { marked } from 'marked'
import EditorPane from './components/EditorPane/EditorPane'
import FileTree from './components/FileTree/FileTree'
import TerminalPane from './components/TerminalPane/TerminalPane'
import SearchPanel from './components/SearchPanel/SearchPanel'
import QuickOpen from './components/QuickOpen'
import StatusBar from './components/StatusBar'
import Icon, { type IconName } from './components/Icon'
import {
  openFolderDialog,
  openWorkspaceByPath,
  restoreLastFolder,
  useWorkspace
} from './stores/workspace'
import { useTabs } from './stores/tabs'
import { useUi, type Layout } from './stores/ui'
import { useTheme } from './stores/theme'
import { useFont, applyFont, FONT_PAIRS } from './stores/font'
import { useI18n, useT, type TKey } from './i18n'
import milkdownFrameDark from '@milkdown/crepe/theme/frame-dark.css?inline'
import milkdownFrameLight from '@milkdown/crepe/theme/frame.css?inline'

const LAYOUTS: { id: Layout; icon: IconName; key: TKey }[] = [
  { id: 'editor-left', icon: 'layout-left', key: 'layoutEditorLeft' },
  { id: 'editor-right', icon: 'layout-right', key: 'layoutEditorRight' },
  { id: 'sidebar', icon: 'layout-sidebar', key: 'layoutSidebar' }
]

function usePersistedFlag(
  key: string,
  initial: boolean
): [boolean, (v: (prev: boolean) => boolean) => void] {
  const [value, setValue] = useState<boolean>(() => {
    const stored = localStorage.getItem(key)
    return stored === null ? initial : stored === 'true'
  })
  const update = (fn: (prev: boolean) => boolean): void => {
    setValue((prev) => {
      const next = fn(prev)
      localStorage.setItem(key, String(next))
      return next
    })
  }
  return [value, update]
}

function buildPrintHtml(bodyHtml: string, titleFont: string, bodyFont: string): string {
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    * { box-sizing: border-box; }
    body { font-family: ${bodyFont}; color: #1a1a1a; line-height: 1.6;
           font-size: 12pt; margin: 0; padding: 0; }
    h1, h2, h3, h4, h5, h6 { font-family: ${titleFont}; font-weight: 700; line-height: 1.25;
           margin: 1.4em 0 0.5em; }
    h1 { font-size: 2em; } h2 { font-size: 1.5em; } h3 { font-size: 1.25em; }
    p, ul, ol, blockquote, table, pre { margin: 0 0 0.8em; }
    a { color: #2a2a2a; }
    code { font-family: "Courier New", monospace; font-size: 0.9em;
           background: #f2f2f0; padding: 0.1em 0.3em; border-radius: 3px; }
    pre { background: #f2f2f0; padding: 12px 14px; border-radius: 6px; overflow-x: auto; }
    pre code { background: none; padding: 0; }
    blockquote { border-left: 3px solid #ccc; padding-left: 1em; color: #555; }
    img { max-width: 100%; }
    table { border-collapse: collapse; }
    th, td { border: 1px solid #ddd; padding: 6px 10px; }
    hr { border: none; border-top: 1px solid #ddd; margin: 1.5em 0; }
  </style></head><body>${bodyHtml}</body></html>`
}

function exportActivePdf(): void {
  const { tabs, activePath, contents } = useTabs.getState()
  const active = tabs.find((t) => t.path === activePath)
  if (!active) return
  const md = contents[active.path] ?? ''
  const pair = FONT_PAIRS[useFont.getState().index]
  const bodyHtml = marked.parse(md, { async: false }) as string
  const name = active.name.replace(/\.(md|markdown|txt)$/i, '')
  void window.stancode.pdf.export(buildPrintHtml(bodyHtml, pair.title, pair.body), name)
}

export default function App(): JSX.Element {
  const t = useT()
  const [showExplorer, setShowExplorer] = usePersistedFlag('stanote:showExplorer', true)
  const [showTerminal, setShowTerminal] = usePersistedFlag('stanote:showTerminal', true)
  const sidebarView = useUi((s) => s.sidebarView)
  const layout = useUi((s) => s.layout)
  const theme = useTheme((s) => s.theme)
  const fontIndex = useFont((s) => s.index)
  const [layoutMenu, setLayoutMenu] = useState(false)

  useEffect(() => {
    document.documentElement.dataset['theme'] = theme
    let styleTag = document.getElementById('milkdown-theme') as HTMLStyleElement | null
    if (!styleTag) {
      styleTag = document.createElement('style')
      styleTag.id = 'milkdown-theme'
      document.head.appendChild(styleTag)
    }
    styleTag.textContent = theme === 'light' ? milkdownFrameLight : milkdownFrameDark
  }, [theme])

  useEffect(() => {
    applyFont(fontIndex)
  }, [fontIndex])

  useEffect(() => {
    const target = window.stancode.openTarget
    if (target) {
      const parent = target.slice(0, target.lastIndexOf('/')) || '/'
      void openWorkspaceByPath(parent).then((ok) => {
        if (ok) void useTabs.getState().openFile(target)
      })
    } else if (window.stancode.isNewWindow) {
      void openFolderDialog()
    } else {
      void restoreLastFolder().then((restored) => {
        if (!restored) void openFolderDialog()
      })
    }
    window.stancode.setLocale(useI18n.getState().locale)

    const offTree = window.stancode.fs.onTreeChanged((tree) => {
      useWorkspace.getState().setTree(tree)
    })
    const offFile = window.stancode.fs.onFileChanged((path) => {
      void useTabs.getState().externalChange(path)
    })
    const offMenu = window.stancode.onMenuAction((action) => {
      if (action === 'openFolder') void openFolderDialog()
      else if (action === 'save') void useTabs.getState().saveActive()
      else if (action === 'closeTab') void useTabs.getState().closeActive()
      else if (action === 'exportPdf') exportActivePdf()
      else if (action.startsWith('layout:')) useUi.getState().setLayout(action.slice(7) as Layout)
    })
    return () => {
      offTree()
      offFile()
      offMenu()
    }
  }, [])

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent): void => {
      const mod = e.metaKey || e.ctrlKey
      if (mod && e.shiftKey && e.key.toLowerCase() === 'e') {
        e.preventDefault()
        if (useUi.getState().sidebarView === 'search') {
          useUi.getState().setSidebarView('files')
          setShowExplorer(() => true)
        } else {
          setShowExplorer((v) => !v)
        }
      } else if (mod && e.shiftKey && e.key.toLowerCase() === 'f') {
        e.preventDefault()
        useUi.getState().setSidebarView('search')
        setShowExplorer(() => true)
      } else if (mod && !e.shiftKey && e.key.toLowerCase() === 'p') {
        e.preventDefault()
        useUi.getState().setQuickOpen(!useUi.getState().quickOpen)
      } else if (mod && !e.shiftKey && e.key.toLowerCase() === 'j') {
        e.preventDefault()
        setShowTerminal((v) => !v)
      } else if (e.ctrlKey && e.key === 'Tab') {
        e.preventDefault()
        useTabs.getState().cycle(e.shiftKey ? -1 : 1)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const toggleExplorer = (): void => {
    if (useUi.getState().sidebarView === 'search') {
      useUi.getState().setSidebarView('files')
      setShowExplorer(() => true)
    } else {
      setShowExplorer((v) => !v)
    }
  }
  const toggleTerminal = (): void => setShowTerminal((v) => !v)

  const filesPane = sidebarView === 'search' ? <SearchPanel /> : <FileTree />

  const filesTerminalColumn = (vId: string): JSX.Element => (
    <PanelGroup direction="vertical" autoSaveId={vId}>
      {showExplorer && (
        <Panel key="files" id="files" order={1} minSize={10} defaultSize={55}>
          {filesPane}
        </Panel>
      )}
      {showExplorer && showTerminal && <PanelResizeHandle className="resize-handle horizontal" />}
      {showTerminal && (
        <Panel key="terminal" id="terminal" order={2} minSize={10} defaultSize={45}>
          <TerminalPane />
        </Panel>
      )}
    </PanelGroup>
  )

  const rightShown = showExplorer || showTerminal

  const renderLayout = (): JSX.Element => {
    if (layout === 'editor-right') {
      return (
        <PanelGroup key="editor-right" direction="horizontal" autoSaveId="stanote:B-h">
          {rightShown && (
            <>
              <Panel key="side" id="side" order={1} minSize={15} defaultSize={30}>
                {filesTerminalColumn('stanote:B-v')}
              </Panel>
              <PanelResizeHandle className="resize-handle vertical" />
            </>
          )}
          <Panel key="editor" id="editor" order={2} minSize={30} defaultSize={70}>
            <EditorPane />
          </Panel>
        </PanelGroup>
      )
    }
    if (layout === 'sidebar') {
      return (
        <PanelGroup key="sidebar" direction="horizontal" autoSaveId="stanote:C-h">
          {showExplorer && (
            <>
              <Panel key="files" id="files" order={1} minSize={12} defaultSize={22}>
                {filesPane}
              </Panel>
              <PanelResizeHandle className="resize-handle vertical" />
            </>
          )}
          <Panel key="main" id="main" order={2} minSize={40}>
            <PanelGroup direction="vertical" autoSaveId="stanote:C-v">
              <Panel key="editor" id="editor" order={1} minSize={20}>
                <EditorPane />
              </Panel>
              {showTerminal && <PanelResizeHandle className="resize-handle horizontal" />}
              {showTerminal && (
                <Panel key="terminal" id="terminal" order={2} minSize={10} defaultSize={35}>
                  <TerminalPane />
                </Panel>
              )}
            </PanelGroup>
          </Panel>
        </PanelGroup>
      )
    }
    // editor-left (défaut)
    return (
      <PanelGroup key="editor-left" direction="horizontal" autoSaveId="stanote:A-h">
        <Panel key="editor" id="editor" order={1} minSize={30} defaultSize={70}>
          <EditorPane />
        </Panel>
        {rightShown && (
          <>
            <PanelResizeHandle className="resize-handle vertical" />
            <Panel key="side" id="side" order={2} minSize={15} defaultSize={30}>
              {filesTerminalColumn('stanote:A-v')}
            </Panel>
          </>
        )}
      </PanelGroup>
    )
  }

  const currentLayoutIcon = LAYOUTS.find((l) => l.id === layout)?.icon ?? 'layout-left'

  return (
    <div className="app">
      <div className="titlebar">
        <span className="titlebar-title">Stanote</span>
        <div className="titlebar-actions">
          <button
            className={showExplorer ? 'tbar-btn active' : 'tbar-btn'}
            title={t('filesToggleTitle')}
            onClick={toggleExplorer}
          >
            <Icon name="files" />
          </button>
          <button
            className={showTerminal ? 'tbar-btn active' : 'tbar-btn'}
            title={t('terminalToggleTitle')}
            onClick={toggleTerminal}
          >
            <Icon name="terminal" />
          </button>
          <div className="layout-picker">
            <button
              className={layoutMenu ? 'tbar-btn active' : 'tbar-btn'}
              title={t('layout')}
              onClick={() => setLayoutMenu((v) => !v)}
            >
              <Icon name={currentLayoutIcon} />
            </button>
            {layoutMenu && (
              <>
                <div className="popover-backdrop" onClick={() => setLayoutMenu(false)} />
                <div className="layout-menu">
                  {LAYOUTS.map((l) => (
                    <button
                      key={l.id}
                      className={l.id === layout ? 'layout-option active' : 'layout-option'}
                      onClick={() => {
                        useUi.getState().setLayout(l.id)
                        setLayoutMenu(false)
                      }}
                    >
                      <Icon name={l.icon} size={18} />
                      <span>{t(l.key)}</span>
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      <div className="workspace">{renderLayout()}</div>

      <StatusBar />
      <QuickOpen />
    </div>
  )
}
