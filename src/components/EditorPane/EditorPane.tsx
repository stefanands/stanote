import MilkdownEditor from './MilkdownEditor'
import DocumentViewer from './DocumentViewer'
import { fileKind, useTabs } from '../../stores/tabs'
import { openFolderDialog, useWorkspace } from '../../stores/workspace'
import { useI18n, useT } from '../../i18n'

export default function EditorPane(): JSX.Element {
  const t = useT()
  const locale = useI18n((s) => s.locale)
  const { rootPath } = useWorkspace()
  const { tabs, activePath, contents, activate, closeTab, updateContent, reloadFromDisk, keepMine } =
    useTabs()

  const active = tabs.find((t) => t.path === activePath)
  const kind = active ? (active.untitled ? 'markdown' : fileKind(active.path)) : 'other'

  const requestClose = (tab: (typeof tabs)[number]): void => {
    if (tab.untitled && tab.dirty && !confirm(t('discardUntitled'))) return
    void closeTab(tab.path)
  }

  return (
    <div className="pane editor-pane">
      {tabs.length > 0 && (
        <div className="tabbar">
          {tabs.map((tab) => (
            <div
              key={tab.path}
              className={`tab ${tab.path === activePath ? 'active' : ''} ${tab.dirty ? 'dirty' : ''}`}
              title={tab.untitled ? tab.name : tab.path}
              onClick={() => activate(tab.path)}
              onAuxClick={(e) => {
                if (e.button === 1) requestClose(tab)
              }}
            >
              <span className="tab-name">{tab.name}</span>
              <span
                className="tab-indicator"
                onClick={(e) => {
                  e.stopPropagation()
                  requestClose(tab)
                }}
              >
                <span className="tab-dot">●</span>
                <span className="tab-x">×</span>
              </span>
            </div>
          ))}
        </div>
      )}

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
