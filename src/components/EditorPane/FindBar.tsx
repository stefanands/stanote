import { useEffect, useRef, useState } from 'react'
import type { EditorView } from '@milkdown/prose/view'
import type { Command } from '@milkdown/prose/state'
import {
  SearchQuery,
  setSearchState,
  findNext,
  findPrev,
  replaceNext,
  replaceAll
} from 'prosemirror-search'
import { useT } from '../../i18n'
import Icon from '../Icon'

interface Props {
  getView: () => EditorView | null
  onClose: () => void
}

/** Barre flottante chercher/remplacer de la note markdown (Cmd+F). */
export default function FindBar({ getView, onClose }: Props): JSX.Element {
  const t = useT()
  const [query, setQuery] = useState('')
  const [replaceText, setReplaceText] = useState('')
  const [showReplace, setShowReplace] = useState(false)
  const [count, setCount] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  // Pousse la requête dans le plugin (surlignage) + compte les occurrences.
  useEffect(() => {
    const view = getView()
    if (!view) return
    view.dispatch(
      setSearchState(
        view.state.tr,
        new SearchQuery({ search: query, replace: replaceText, caseSensitive: false })
      )
    )
    if (!query) {
      setCount(0)
      return
    }
    const text = view.state.doc
      .textBetween(0, view.state.doc.content.size, '\n', '\n')
      .toLowerCase()
    const needle = query.toLowerCase()
    let n = 0
    let i = text.indexOf(needle)
    while (i !== -1) {
      n++
      i = text.indexOf(needle, i + needle.length)
    }
    setCount(n)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, replaceText])

  // À la fermeture : efface la requête pour retirer les surlignages.
  useEffect(
    () => () => {
      const view = getView()
      if (view) view.dispatch(setSearchState(view.state.tr, new SearchQuery({ search: '' })))
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  )

  const run = (cmd: Command): void => {
    const view = getView()
    if (view) cmd(view.state, view.dispatch, view)
  }

  const onKeyDown = (e: React.KeyboardEvent): void => {
    if (e.key === 'Enter') {
      e.preventDefault()
      run(e.shiftKey ? findPrev : findNext)
    } else if (e.key === 'Escape') {
      e.preventDefault()
      onClose()
    }
  }

  return (
    <div className="find-bar">
      <div className="find-row">
        <button
          className={`find-chevron ${showReplace ? 'open' : ''}`}
          title={t('replace')}
          onClick={() => setShowReplace((v) => !v)}
        >
          <Icon name="chevron" size={12} />
        </button>
        <input
          ref={inputRef}
          className="find-input"
          placeholder={t('findPlaceholder')}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={onKeyDown}
        />
        {query && <span className="find-count">{count}</span>}
        <button className="find-nav prev" title={t('findPrev')} onClick={() => run(findPrev)}>
          <Icon name="chevron" size={13} />
        </button>
        <button className="find-nav next" title={t('findNext')} onClick={() => run(findNext)}>
          <Icon name="chevron" size={13} />
        </button>
        <button className="find-nav" title={t('findClose')} onClick={onClose}>
          <Icon name="close" size={13} />
        </button>
      </div>
      {showReplace && (
        <div className="find-row">
          <span className="find-chevron-spacer" />
          <input
            className="find-input"
            placeholder={t('replaceWith')}
            value={replaceText}
            onChange={(e) => setReplaceText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                run(replaceNext)
              } else if (e.key === 'Escape') {
                e.preventDefault()
                onClose()
              }
            }}
          />
          <button className="find-btn" onClick={() => run(replaceNext)}>
            {t('replace')}
          </button>
          <button className="find-btn" onClick={() => run(replaceAll)}>
            {t('replaceAll')}
          </button>
        </div>
      )}
    </div>
  )
}
