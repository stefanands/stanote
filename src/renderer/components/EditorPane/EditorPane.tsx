import { useEffect, useState } from 'react'
import MilkdownEditor from './MilkdownEditor'
import CodeEditor from './CodeEditor'
import DocumentViewer from './DocumentViewer'
import TabBar from '../TabBar'
import Icon from '../Icon'
import { fileKind, useTabs } from '../../stores/tabs'
import { openFolderDialog, useWorkspace } from '../../stores/workspace'
import { useUi } from '../../stores/ui'
import { useI18n, useT } from '../../i18n'

export default function EditorPane(): JSX.Element {
  const t = useT()
  const locale = useI18n((s) => s.locale)
  const { rootPath } = useWorkspace()
  const { tabs, activePath, contents, updateContent, reloadFromDisk, keepMine } = useTabs()
  const layout = useUi((s) => s.layout)
  /** HTML : aperçu rendu (défaut) ou code source éditable. */
  const [htmlAsCode, setHtmlAsCode] = useState(false)

  const active = tabs.find((t) => t.path === activePath)
  const kind = active ? (active.untitled ? 'markdown' : fileKind(active.path)) : 'other'

  // Chaque fichier s'ouvre en aperçu.
  useEffect(() => setHtmlAsCode(false), [activePath])

  // Cmd+Maj+P : bascule aperçu ↔ code source (fichiers html).
  const isHtml = kind === 'html'
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

  return (
    <div className="pane editor-pane">
      {layout !== 'editor-left' && <TabBar variant="pane" />}
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
