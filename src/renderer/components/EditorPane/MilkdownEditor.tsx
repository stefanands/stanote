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
  /** chemin du fichier : sert à mémoriser la position de lecture */
  path: string
  initialValue: string
  locale: Locale
  onChange: (markdown: string) => void
}

/* Position de défilement par fichier : changer d'onglet démonte l'éditeur, on
   restaure donc la position à la réouverture plutôt que de repartir en haut. */
const scrollByPath = new Map<string, number>()

export default function MilkdownEditor({
  path,
  initialValue,
  locale,
  onChange
}: Props): JSX.Element {
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
    const host = rootRef.current
    void crepe.create().then(() => {
      if (disposed) {
        void crepe.destroy()
        return
      }
      readyRef.current = true
      // Restaure la position après le rendu du document.
      const top = scrollByPath.get(path)
      if (top && host) requestAnimationFrame(() => host.scrollTo({ top }))
    })

    return () => {
      disposed = true
      if (host) scrollByPath.set(path, host.scrollTop)
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
