import { useEffect, useRef } from 'react'
import {
  EditorView,
  keymap,
  lineNumbers,
  highlightActiveLine,
  highlightActiveLineGutter,
  drawSelection
} from '@codemirror/view'
import { EditorState, Compartment, type Extension } from '@codemirror/state'
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands'
import { search, searchKeymap } from '@codemirror/search'
import { bracketMatching, syntaxHighlighting, defaultHighlightStyle } from '@codemirror/language'
import { json } from '@codemirror/lang-json'
import { yaml } from '@codemirror/lang-yaml'
import { oneDarkHighlightStyle } from '@codemirror/theme-one-dark'
import { useTheme } from '../../stores/theme'
import type { Locale } from '../../i18n'

interface Props {
  path: string
  initialValue: string
  locale: Locale
  onChange: (value: string) => void
}

/* Libellés FR du panneau chercher/remplacer intégré de CodeMirror (Cmd+F). */
const FR_PHRASES: Record<string, string> = {
  Find: 'Rechercher',
  Replace: 'Remplacer',
  next: 'suivant',
  previous: 'précédent',
  all: 'tout',
  'match case': 'respecter la casse',
  'by word': 'mots entiers',
  regexp: 'regexp',
  replace: 'remplacer',
  'replace all': 'tout remplacer',
  close: 'fermer',
  'current match': 'occurrence courante',
  'replaced $ matches': '$ occurrences remplacées',
  'replaced match on line $': 'occurrence remplacée ligne $',
  'on line': 'à la ligne'
}

/* Thème éditeur assorti à la palette (variables CSS → suit jour/nuit). */
function cmTheme(dark: boolean): Extension {
  return EditorView.theme(
    {
      '&': { backgroundColor: 'transparent', color: 'var(--text)', height: '100%', fontSize: '13px' },
      '.cm-content': { fontFamily: 'var(--font-mono)', caretColor: 'var(--accent)' },
      '.cm-cursor, .cm-dropCursor': { borderLeftColor: 'var(--accent)' },
      '&.cm-focused': { outline: 'none' },
      '.cm-gutters': {
        backgroundColor: 'transparent',
        color: 'var(--text-dim)',
        border: 'none',
        fontFamily: 'var(--font-mono)'
      },
      '.cm-activeLine': { backgroundColor: 'var(--hover)' },
      '.cm-activeLineGutter': { backgroundColor: 'transparent', color: 'var(--text)' },
      '.cm-selectionBackground, &.cm-focused .cm-selectionBackground': {
        backgroundColor: 'var(--selected)'
      },
      '.cm-searchMatch': { backgroundColor: 'var(--mark)' },
      '.cm-searchMatch.cm-searchMatch-selected': {
        backgroundColor: 'var(--accent)',
        color: 'var(--accent-contrast)'
      },
      '.cm-panels': {
        backgroundColor: 'var(--bg-panel)',
        color: 'var(--text)',
        borderBottom: '1px solid var(--border)'
      },
      '.cm-panels input, .cm-panels button': { fontSize: '12px' }
    },
    { dark }
  )
}

function themedExtensions(dark: boolean): Extension {
  return [cmTheme(dark), syntaxHighlighting(dark ? oneDarkHighlightStyle : defaultHighlightStyle)]
}

/** Éditeur de code léger (json / yaml) — même auto-save que le markdown. */
export default function CodeEditor({ path, initialValue, locale, onChange }: Props): JSX.Element {
  const hostRef = useRef<HTMLDivElement>(null)
  const viewRef = useRef<EditorView | null>(null)
  const themeSlot = useRef(new Compartment())
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange
  const theme = useTheme((s) => s.theme)

  useEffect(() => {
    const dark = useTheme.getState().theme === 'dark'
    const view = new EditorView({
      parent: hostRef.current!,
      state: EditorState.create({
        doc: initialValue,
        extensions: [
          lineNumbers(),
          highlightActiveLine(),
          highlightActiveLineGutter(),
          drawSelection(),
          history(),
          bracketMatching(),
          search({ top: true }),
          keymap.of([...defaultKeymap, ...historyKeymap, ...searchKeymap, indentWithTab]),
          /\.json$/i.test(path) ? json() : yaml(),
          locale === 'fr' ? EditorState.phrases.of(FR_PHRASES) : [],
          themeSlot.current.of(themedExtensions(dark)),
          EditorView.lineWrapping,
          EditorView.updateListener.of((u) => {
            if (u.docChanged) onChangeRef.current(u.state.doc.toString())
          })
        ]
      })
    })
    viewRef.current = view
    return () => view.destroy()
    // initialValue/locale ignorés : le remount est piloté par la key
    // (path:version:locale) posée par EditorPane.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    viewRef.current?.dispatch({
      effects: themeSlot.current.reconfigure(themedExtensions(theme === 'dark'))
    })
  }, [theme])

  return <div className="code-host" ref={hostRef} />
}
