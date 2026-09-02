import { useEffect, useRef, useState } from 'react'
import type { EditorView } from '@milkdown/prose/view'
import { TextSelection, type Command } from '@milkdown/prose/state'
import {
  SearchQuery,
  setSearchState,
  getMatchHighlights,
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
  /** position de chaque occurrence, en fraction de la hauteur du document */
  const [marks, setMarks] = useState<number[]>([])
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  /* Pousse la requête dans le plugin (surlignage), compte les occurrences,
     saute à la première et calcule leur position dans le document pour les
     repères du bord droit. */
  useEffect(() => {
    const view = getView()
    if (!view) return
    const q = new SearchQuery({
      search: query,
      replace: replaceText,
      caseSensitive: false
    })
    view.dispatch(setSearchState(view.state.tr, q))
    if (!query) {
      setCount(0)
      setMarks([])
      return
    }

    // Occurrences telles que les voit le plugin (plus fiable qu'une recherche
    // sur le texte brut, qui ignore les frontières de blocs).
    const found = getMatchHighlights(view.state).find()
    setCount(found.length)

    // Amène la première occurrence sous les yeux, comme un navigateur.
    if (found.length > 0) {
      view.dispatch(
        view.state.tr
          .setSelection(TextSelection.create(view.state.doc, found[0].from, found[0].to))
          .scrollIntoView()
      )
    }

    // Position relative de chaque occurrence dans la hauteur du document.
    const host = view.dom.closest('.milkdown-host') as HTMLElement | null
    if (!host) return
    requestAnimationFrame(() => {
      const total = host.scrollHeight || 1
      const top = host.getBoundingClientRect().top
      setMarks(
        found
          .map((m) => {
            try {
              return (host.scrollTop + view.coordsAtPos(m.from).top - top) / total
            } catch {
              return -1 // position non rendue
            }
          })
          .filter((r) => r >= 0 && r <= 1)
      )
    })
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
    <>
      {/* Repères le long du bord droit : où se trouvent les occurrences dans
          l'ensemble du document, y compris hors de l'écran. */}
      {marks.length > 0 && (
        <div className="find-rail" aria-hidden="true">
          {marks.map((ratio, i) => (
            <span key={i} className="find-rail-mark" style={{ top: `${ratio * 100}%` }} />
          ))}
        </div>
      )}
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
    </>
  )
}
