import { useEffect, useState } from 'react'
import MilkdownEditor from './MilkdownEditor'
import CodeEditor from './CodeEditor'
import DocumentViewer from './DocumentViewer'
import TabBar, { TAB_DRAG_TYPE } from '../TabBar'
import Icon from '../Icon'
import { fileKind, useTabs, type PaneId } from '../../stores/tabs'
import { openFolderDialog, useWorkspace } from '../../stores/workspace'
import { useUi } from '../../stores/ui'
import { useI18n, useT } from '../../i18n'

interface Props {
  /** colonne affichée (0 = gauche, 1 = droite en vue double) */
  pane?: PaneId
}

export default function EditorPane({ pane = 0 }: Props): JSX.Element {
  const t = useT()
  const locale = useI18n((s) => s.locale)
  const { rootPath } = useWorkspace()
  const { tabs, activeByPane, focusedPane, contents, updateContent, reloadFromDisk, keepMine } =
    useTabs()
  const layout = useUi((s) => s.layout)
  /** HTML : aperçu rendu (défaut) ou code source éditable. */
  const [htmlAsCode, setHtmlAsCode] = useState(false)
  /** un onglet est glissé au-dessus de la moitié droite : ouvrirait la colonne */
  const [splitHint, setSplitHint] = useState(false)

  const activePath = activeByPane[pane]
  const active = tabs.find((tb) => tb.path === activePath)
  const kind = active ? (active.untitled ? 'markdown' : fileKind(active.path)) : 'other'
  const splitOpen = tabs.some((tb) => tb.pane === 1)

  // Chaque fichier s'ouvre en aperçu.
  useEffect(() => setHtmlAsCode(false), [activePath])

  // Cmd+Maj+P : bascule aperçu ↔ code source (fichiers html), colonne active.
  const isHtml = kind === 'html' && focusedPane === pane
  useEffect(() => {
    if (!isHtml) return
    const onKey = (e: KeyboardEvent): void => {
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === 'p') {
        e.preventDefault()
        setHtmlAsCode((v) => !v)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [isHtml])

  /* Dépôt d'un onglet : sur la colonne de gauche non scindée, la moitié droite
     ouvre la vue double ; ailleurs, l'onglet rejoint la colonne survolée. */
  const dropPaneFor = (e: React.DragEvent): PaneId => {
    if (pane === 1 || splitOpen) return pane
    const rect = e.currentTarget.getBoundingClientRect()
    return e.clientX > rect.left + rect.width * 0.6 ? 1 : 0
  }

  return (
    <div
      className={[
        'pane editor-pane',
        focusedPane === pane && splitOpen ? 'pane-focused' : '',
        splitHint ? 'split-hint' : ''
      ].join(' ')}
      onMouseDown={() => useTabs.getState().focusPane(pane)}
      onDragOver={(e) => {
        if (!e.dataTransfer.types.includes(TAB_DRAG_TYPE)) return
        e.preventDefault()
        e.dataTransfer.dropEffect = 'move'
        setSplitHint(dropPaneFor(e) === 1 && !splitOpen)
      }}
      onDragLeave={() => setSplitHint(false)}
      onDrop={(e) => {
        if (!e.dataTransfer.types.includes(TAB_DRAG_TYPE)) return
        e.preventDefault()
        const src = e.dataTransfer.getData(TAB_DRAG_TYPE)
        setSplitHint(false)
        if (src) useTabs.getState().moveTabToPane(src, dropPaneFor(e))
      }}
    >
      {/* En disposition « éditeur à gauche », les onglets vivent dans la barre
          de titre (les deux colonnes y sont côte à côte). */}
      {layout !== 'editor-left' && <TabBar variant="pane" pane={pane} />}
      {active?.conflict && (
        <div className="conflict-banner">
          <span>{t('conflictMsg')}</span>
          <div className="conflict-actions">
            <button onClick={() => void reloadFromDisk(active.path)}>{t('reload')}</button>
            <button onClick={() => keepMine(active.path)}>{t('keepMine')}</button>
          </div>
        </div>
      )}

      {active ? (
        kind === 'markdown' ? (
          <MilkdownEditor
            key={`${active.path}:${active.version}:${locale}`}
            path={active.path}
            initialValue={contents[active.path] ?? ''}
            locale={locale}
            onChange={(md) => updateContent(active.path, md)}
          />
        ) : kind === 'code' ? (
          <CodeEditor
            key={`${active.path}:${active.version}:${locale}`}
            path={active.path}
            initialValue={contents[active.path] ?? ''}
            locale={locale}
            onChange={(v) => updateContent(active.path, v)}
          />
        ) : kind === 'html' ? (
          <>
            <div className="doc-toolbar">
              <button
                className="tbar-btn"
                title={htmlAsCode ? t('htmlPreview') : t('htmlSource')}
                onClick={() => setHtmlAsCode((v) => !v)}
              >
                <Icon name={htmlAsCode ? 'eye' : 'file-code'} />
              </button>
            </div>
            {htmlAsCode ? (
              <CodeEditor
                key={`${active.path}:${active.version}:${locale}`}
                path={active.path}
                initialValue={contents[active.path] ?? ''}
                locale={locale}
                onChange={(v) => updateContent(active.path, v)}
              />
            ) : (
              <DocumentViewer
                key={active.path}
                path={active.path}
                kind="html"
                content={contents[active.path]}
              />
            )}
          </>
        ) : kind === 'other' ? (
          <div className="pane-placeholder">
            <p className="hint">{t('unsupported')}</p>
          </div>
        ) : (
          <DocumentViewer key={active.path} path={active.path} kind={kind} />
        )
      ) : (
        <div className="pane-placeholder">
          {rootPath ? (
            <p className="hint">{t('selectFile')}</p>
          ) : (
            <button className="link-btn" onClick={openFolderDialog}>
              {t('openFolder')}
            </button>
          )}
        </div>
      )}
    </div>
  )
}
