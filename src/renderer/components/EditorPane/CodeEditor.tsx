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
import {
  autocompletion,
  completionKeymap,
  closeBrackets,
  closeBracketsKeymap
} from '@codemirror/autocomplete'
import { linter, lintGutter } from '@codemirror/lint'
import { indentationMarkers } from '@replit/codemirror-indentation-markers'
import { colorPicker } from '@replit/codemirror-css-color-picker'
import {
  bracketMatching,
  syntaxHighlighting,
  defaultHighlightStyle,
  codeFolding,
  foldGutter,
  foldKeymap,
  indentOnInput
} from '@codemirror/language'
import { StreamLanguage } from '@codemirror/language'
import { json, jsonParseLinter } from '@codemirror/lang-json'
import { yaml } from '@codemirror/lang-yaml'
import { xml, autoCloseTags as xmlAutoCloseTags } from '@codemirror/lang-xml'
import { html } from '@codemirror/lang-html'
import { css } from '@codemirror/lang-css'
import { python } from '@codemirror/lang-python'
import { php } from '@codemirror/lang-php'
import { toml } from '@codemirror/legacy-modes/mode/toml'
import { properties } from '@codemirror/legacy-modes/mode/properties'
import { oneDarkHighlightStyle } from '@codemirror/theme-one-dark'
import { useTheme } from '../../stores/theme'
import { basename } from '../../lib/path'
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

/** Coloration selon l'extension. `properties` couvre ini/cfg/conf/.env (même
 *  forme clé=valeur) ; csv et log restent en texte brut. */
function languageFor(path: string): Extension | null {
  const name = basename(path).toLowerCase()
  if (name.startsWith('.env')) return StreamLanguage.define(properties)
  const ext = name.includes('.') ? name.slice(name.lastIndexOf('.') + 1) : ''
  switch (ext) {
    case 'json':
      // Signale les erreurs de syntaxe (virgule oubliée, accolade manquante…).
      return [json(), linter(jsonParseLinter()), lintGutter()]
    case 'yaml':
    case 'yml':
      return yaml()
    case 'xml':
      return [xml(), xmlAutoCloseTags]
    case 'css':
      return css()
    case 'html':
      // html() ferme déjà les balises automatiquement et complète
      // balises/attributs.
      return html()
    case 'htm':
      return html()
    case 'py':
      return python()
    case 'php':
      return php()
    case 'toml':
      return StreamLanguage.define(toml)
    case 'ini':
    case 'cfg':
    case 'conf':
      return StreamLanguage.define(properties)
    default:
      return null
  }
}

/** Chevron plein de la gouttière de repliage (les triangles ▸/▾ par défaut de
 *  CodeMirror sont minuscules). Pivote de 90° à l'ouverture. */
function foldMarker(open: boolean): HTMLElement {
  const span = document.createElement('span')
  span.className = open ? 'cm-fold-marker open' : 'cm-fold-marker'
  span.innerHTML =
    '<svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">' +
    '<path d="M5.5 3.5 11 8l-5.5 4.5z" fill="currentColor"/></svg>'
  return span
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
      '.cm-foldGutter': { width: '18px' },
      '.cm-fold-marker': {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100%',
        color: 'var(--text-dim)',
        cursor: 'pointer',
        transition: 'transform .12s ease, color .12s ease'
      },
      '.cm-fold-marker.open': { transform: 'rotate(90deg)' },
      '.cm-fold-marker:hover': { color: 'var(--accent)' },
      // Parenthèse / balise jumelle
      '.cm-matchingBracket, &.cm-focused .cm-matchingBracket': {
        backgroundColor: 'var(--hover-strong)',
        outline: '1px solid var(--accent)'
      },
      '.cm-nonmatchingBracket': { color: '#d9534f' },
      // Complétion
      '.cm-tooltip.cm-tooltip-autocomplete > ul': {
        fontFamily: 'var(--font-mono)',
        fontSize: '12px',
        backgroundColor: 'var(--bg-panel)',
        border: '1px solid var(--border)',
        borderRadius: '6px'
      },
      '.cm-tooltip.cm-tooltip-autocomplete > ul > li[aria-selected]': {
        backgroundColor: 'var(--accent)',
        color: 'var(--accent-contrast)'
      },
      '.cm-foldPlaceholder': {
        backgroundColor: 'var(--hover-strong)',
        border: 'none',
        borderRadius: '3px',
        color: 'var(--text-dim)',
        padding: '0 4px'
      },
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
          // Met en évidence la parenthèse/balise jumelle du curseur.
          bracketMatching(),
          // Ferme automatiquement guillemets, parenthèses et accolades.
          closeBrackets(),
          autocompletion(),
          indentOnInput(),
          // Repères verticaux d'imbrication + pastille cliquable devant les
          // couleurs (#d97757, rgb(…)) ouvrant un sélecteur.
          indentationMarkers({ hideFirstIndent: true, colors: { light: '#00000018', dark: '#ffffff14' } }),
          colorPicker,
          // Repliage des blocs (balises html/xml, objets json, fonctions…).
          codeFolding(),
          foldGutter({ markerDOM: foldMarker }),
          search({ top: true }),
          keymap.of([
            ...closeBracketsKeymap,
            ...defaultKeymap,
            ...historyKeymap,
            ...searchKeymap,
            ...foldKeymap,
            ...completionKeymap,
            indentWithTab
          ]),
          languageFor(path) ?? [],
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
