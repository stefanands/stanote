import { useEffect, useState } from 'react'
import MilkdownEditor from './MilkdownEditor'
import CodeEditor from './CodeEditor'
import Backlinks from './Backlinks'
import FrontmatterHeader from './FrontmatterHeader'
import { frontmatterText, keepObsidianSyntax, splitFrontmatter } from '../../lib/markdown'
import DocumentViewer from './DocumentViewer'
import TabBar, { TAB_DRAG_TYPE } from '../TabBar'
import Icon from '../Icon'
import { fileKind, useTabs, type PaneId, type Tab } from '../../stores/tabs'
import { openFolderDialog, useWorkspace } from '../../stores/workspace'
import { useUi } from '../../stores/ui'
import { useI18n, useT } from '../../i18n'

interface Props {
  /** colonne affichée (0 = gauche, 1 = droite en vue double) */
  pane?: PaneId
}

/** Nombre d'onglets gardés montés par colonne : au-delà, le plus ancien est
 *  recréé à son retour (position de lecture conservée, mais pas l'historique
 *  d'annulation). */
const KEEP_ALIVE = 5

interface TabViewProps {
  tab: Tab
  /** onglet affiché ; les autres restent montés, mais invisibles */
  visible: boolean
  /** onglet affiché dans la colonne qui a le focus */
  current: boolean
  /** html : code source plutôt qu'aperçu (onglet affiché seulement) */
  htmlAsCode: boolean
  onToggleHtml: () => void
}

/* Un onglet. Caché plutôt que démonté quand on en change : on y revient sans
   rien recharger, à la même position, avec curseur et historique d'annulation
   intacts. Caché en gardant sa mise en page (visibility), pour que chaque zone
   défilante (note, aperçu HTML, PDF) conserve sa position. */
function TabView({ tab, visible, current, htmlAsCode, onToggleHtml }: TabViewProps): JSX.Element {
  const t = useT()
  const locale = useI18n((s) => s.locale)
  const content = useTabs((s) => s.contents[tab.path])
  const updateContent = useTabs((s) => s.updateContent)
  const kind = tab.untitled ? 'markdown' : fileKind(tab.path)
  const editorKey = `${tab.path}:${tab.version}:${locale}`

  let body: JSX.Element
  if (kind === 'markdown') {
    /* Le frontmatter est tenu hors de l'éditeur WYSIWYG (qui le détruirait)
       et recollé tel quel à chaque enregistrement. */
    const note = splitFrontmatter(content ?? '')
    body = (
      <>
        {note.front && (
          <FrontmatterHeader
            front={note.front}
            onChange={(front) => updateContent(tab.path, frontmatterText(front) + note.body)}
          />
        )}
        <MilkdownEditor
          key={editorKey}
          path={tab.path}
          initialValue={note.body}
          locale={locale}
          current={current}
          onChange={(md) =>
            updateContent(tab.path, frontmatterText(note.front) + keepObsidianSyntax(md))
          }
        />
        {visible && !tab.untitled && <Backlinks path={tab.path} />}
      </>
    )
  } else if (kind === 'code') {
    body = (
      <CodeEditor
        key={editorKey}
        path={tab.path}
        initialValue={content ?? ''}
        locale={locale}
        onChange={(v) => updateContent(tab.path, v)}
      />
    )
  } else if (kind === 'html') {
    body = (
      <>
        <div className="doc-toolbar">
          <button
            className="tbar-btn"
            title={htmlAsCode ? t('htmlPreview') : t('htmlSource')}
            onClick={onToggleHtml}
          >
            <Icon name={htmlAsCode ? 'eye' : 'file-code'} />
          </button>
        </div>
        {htmlAsCode ? (
          <CodeEditor
            key={editorKey}
            path={tab.path}
            initialValue={content ?? ''}
            locale={locale}
            onChange={(v) => updateContent(tab.path, v)}
          />
        ) : (
          <DocumentViewer key={tab.path} path={tab.path} kind="html" content={content} />
        )}
      </>
    )
  } else if (kind === 'other') {
    body = (
      <div className="pane-placeholder">
        <p className="hint">{t('unsupported')}</p>
      </div>
    )
  } else {
    body = <DocumentViewer key={tab.path} path={tab.path} kind={kind} />
  }

  return (
    <div
      className={visible ? 'tab-view' : 'tab-view is-hidden'}
      aria-hidden={visible ? undefined : true}
    >
      {body}
    </div>
  )
}

export default function EditorPane({ pane = 0 }: Props): JSX.Element {
  const t = useT()
  const { rootPath } = useWorkspace()
  const { tabs, activeByPane, focusedPane, reloadFromDisk, keepMine } = useTabs()
  const layout = useUi((s) => s.layout)
  /** HTML : aperçu rendu (défaut) ou code source éditable. */
  const [htmlAsCode, setHtmlAsCode] = useState(false)
  /** un onglet est glissé au-dessus de la moitié droite : ouvrirait la colonne */
  const [splitHint, setSplitHint] = useState(false)

  const activePath = activeByPane[pane]
  const active = tabs.find((tb) => tb.path === activePath)
  const kind = active ? (active.untitled ? 'markdown' : fileKind(active.path)) : 'other'
  const splitOpen = tabs.some((tb) => tb.pane === 1)
  /* Onglets de la colonne gardés montés : l'affiché et les derniers consultés.
     Rendus dans l'ordre de la barre, pas dans l'ordre de consultation : un
     élément déplacé dans la page, une iframe d'aperçu surtout, se recharge. */
  const [recent, setRecent] = useState<string[]>([])
  useEffect(() => {
    if (activePath) setRecent((r) => [activePath, ...r.filter((p) => p !== activePath)].slice(0, 50))
  }, [activePath])
  const keep = new Set(
    [activePath, ...recent]
      .filter(
        (p, i, list): p is string =>
          !!p && list.indexOf(p) === i && tabs.some((tb) => tb.path === p && tb.pane === pane)
      )
      .slice(0, KEEP_ALIVE)
  )
  const alive = tabs.filter((tb) => tb.pane === pane && keep.has(tb.path))

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

      <div className="tab-views">
        {alive.map((tab) => (
          <TabView
            key={tab.path}
            tab={tab}
            visible={tab.path === activePath}
            current={tab.path === activePath && (focusedPane === pane || !splitOpen)}
            htmlAsCode={tab.path === activePath && htmlAsCode}
            onToggleHtml={() => setHtmlAsCode((v) => !v)}
          />
        ))}
        {!active && (
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
    </div>
  )
}
