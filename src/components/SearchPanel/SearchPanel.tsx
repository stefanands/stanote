import { useEffect, useMemo, useRef, useState } from 'react'
import type { SearchMatch } from '../../../shared/types'
import { useWorkspace } from '../../stores/workspace'
import { useTabs } from '../../stores/tabs'
import { useUi } from '../../stores/ui'
import { useT } from '../../i18n'
import Icon from '../Icon'

const MAX_SHOWN = 500

function Highlighted({ text, query }: { text: string; query: string }): JSX.Element {
  const idx = text.toLowerCase().indexOf(query.toLowerCase())
  if (idx < 0) return <>{text}</>
  return (
    <>
      {text.slice(0, idx)}
      <mark>{text.slice(idx, idx + query.length)}</mark>
      {text.slice(idx + query.length)}
    </>
  )
}

export default function SearchPanel(): JSX.Element {
  const t = useT()
  const rootPath = useWorkspace((s) => s.rootPath)
  const openFile = useTabs((s) => s.openFile)
  const setSidebarView = useUi((s) => s.setSidebarView)

  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchMatch[]>([])
  const [searched, setSearched] = useState(false)
  const seq = useRef(0)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  useEffect(() => {
    const id = ++seq.current
    if (!rootPath || query.trim().length < 2) {
      setResults([])
      setSearched(false)
      return
    }
    const timer = setTimeout(async () => {
      const found = await window.stancode.search.query(rootPath, query)
      if (seq.current === id) {
        setResults(found)
        setSearched(true)
      }
    }, 250)
    return () => clearTimeout(timer)
  }, [query, rootPath])

  const groups = useMemo(() => {
    const map = new Map<string, SearchMatch[]>()
    for (const match of results) {
      const list = map.get(match.file)
      if (list) list.push(match)
      else map.set(match.file, [match])
    }
    return [...map.entries()]
  }, [results])

  const relName = (file: string): string =>
    rootPath && file.startsWith(rootPath) ? file.slice(rootPath.length + 1) : file

  return (
    <div className="pane filetree-pane">
      <div className="pane-header filetree-header">
        <span>{t('search')}</span>
        <button className="icon-btn" title={t('closeSearch')} onClick={() => setSidebarView('files')}>
          <Icon name="close" size={14} />
        </button>
      </div>
      <div className="search-input-row">
        <input
          ref={inputRef}
          className="inline-input search-input"
          placeholder={t('searchPlaceholder')}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') setSidebarView('files')
          }}
        />
      </div>
      <div className="filetree-scroll search-results">
        {searched && results.length === 0 && (
          <p className="hint search-empty">{t('searchNoResults')}</p>
        )}
        {results.length >= MAX_SHOWN && (
          <p className="hint search-empty">
            {t('searchTooMany', { count: String(MAX_SHOWN) })}
          </p>
        )}
        {groups.map(([file, matches]) => (
          <div key={file} className="search-group">
            <div className="search-file" title={file} onClick={() => void openFile(file)}>
              {relName(file)}
              <span className="search-count">{matches.length}</span>
            </div>
            {matches.map((match, i) => (
              <div
                key={`${match.line}-${i}`}
                className="search-match"
                onClick={() => void openFile(file)}
              >
                <span className="search-line">{match.line}</span>
                <span className="search-text">
                  <Highlighted text={match.text.trim()} query={query} />
                </span>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}
