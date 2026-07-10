import { useEffect, useRef } from 'react'
import { Crepe } from '@milkdown/crepe'
import '@milkdown/crepe/theme/common/style.css'
import { crepeFeatureConfigs } from './crepeText'
import type { Locale } from '../../i18n'

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

  useEffect(() => {
    const crepe = new Crepe({
      root: rootRef.current!,
      defaultValue: initialValue,
      featureConfigs: crepeFeatureConfigs(locale)
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

  return <div className="milkdown-host" ref={rootRef} />
}
