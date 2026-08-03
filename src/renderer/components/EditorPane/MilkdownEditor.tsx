import { useEffect, useRef } from 'react'
import { Crepe } from '@milkdown/crepe'
import { editorViewCtx, prosePluginsCtx } from '@milkdown/kit/core'
import type { EditorView } from '@milkdown/prose/view'
import { search } from 'prosemirror-search'
import '@milkdown/crepe/theme/common/style.css'
import { crepeFeatureConfigs } from './crepeText'
import { useUi } from '../../stores/ui'
import type { Locale } from '../../i18n'
import FindBar from './FindBar'

interface Props {
  initialValue: string
  locale: Locale
  onChange: (markdown: string) => void
}

export default function MilkdownEditor({ initialValue, locale, onChange }: Props): JSX.Element {
  const rootRef = useRef<HTMLDivElement>(null)
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange
  const readyRef = useRef(false)
  const crepeRef = useRef<Crepe | null>(null)
  const findOpen = useUi((s) => s.findOpen)

  useEffect(() => {
    const crepe = new Crepe({
      root: rootRef.current!,
      defaultValue: initialValue,
      featureConfigs: crepeFeatureConfigs(locale)
    })
    crepeRef.current = crepe

    // Plugin chercher/remplacer (surlignage des occurrences), piloté par FindBar.
    crepe.editor.config((ctx) => {
      ctx.update(prosePluginsCtx, (plugins) => [...plugins, search()])
    })

    crepe.on((listener) => {
      listener.markdownUpdated((_ctx, markdown, prev) => {
        // Ignore les updates émis pendant le chargement (normalisation
        // ProseMirror) : ils marqueraient le doc « modifié » sans frappe
        // de l'utilisateur, déclenchant une écriture parasite à l'ouverture.
        if (!readyRef.current) return
        if (markdown !== prev) onChangeRef.current(markdown)
      })
    })

    let disposed = false
    void crepe.create().then(() => {
      if (disposed) void crepe.destroy()
      else readyRef.current = true
    })

    return () => {
      disposed = true
      crepeRef.current = null
      try {
        void crepe.destroy()
      } catch {
        // instance déjà détruite
      }
    }
    // initialValue volontairement ignoré : le remount est piloté par la key
    // (path:version) posée par EditorPane.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const getView = (): EditorView | null => {
    if (!readyRef.current || !crepeRef.current) return null
    try {
      return crepeRef.current.editor.ctx.get(editorViewCtx)
    } catch {
      return null
    }
  }

  return (
    <div className="milkdown-wrap">
      {findOpen && <FindBar getView={getView} onClose={() => useUi.getState().setFindOpen(false)} />}
      <div className="milkdown-host" ref={rootRef} />
    </div>
  )
}
