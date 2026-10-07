import { useCallback, useEffect, useState } from 'react'
import { useWorkspace } from '../../stores/workspace'
import { useTabs } from '../../stores/tabs'
import { useT } from '../../i18n'
import { basename } from '../../lib/path'

interface Props {
  /** note affichée : on cherche qui pointe vers elle */
  path: string
}

const withoutExt = (name: string): string => name.replace(/\.(md|markdown|txt)$/i, '')

/* Liens entrants, en pied de note : « qu'est-ce qui renvoie à cette page ? ».
   Replié par défaut, et entièrement absent tant que personne ne pointe ici —
   une note isolée ne doit pas afficher une ligne vide. */
export default function Backlinks({ path }: Props): JSX.Element | null {
  const t = useT()
  const rootPath = useWorkspace((s) => s.rootPath)
  const [notes, setNotes] = useState<string[]>([])
  const [open, setOpen] = useState(false)

  const refresh = useCallback(() => {
    if (!rootPath) {
      setNotes([])
      return
    }
    void window.stancode
      .backlinks(rootPath, path)
      .then(setNotes)
      .catch(() => setNotes([]))
  }, [rootPath, path])

  // Au changement de note, puis à chaque modification de l'arborescence
  // (création, déplacement, suppression d'une note qui pointait ici).
  useEffect(() => {
    setOpen(false)
    refresh()
    return window.stancode.fs.onTreeChanged(refresh)
  }, [refresh])

  if (notes.length === 0) return null

  return (
    <div className="backlinks">
      <button
        className="backlinks-toggle"
        onClick={() => {
          // Une note a pu être écrite depuis le dernier scan.
          if (!open) refresh()
          setOpen((v) => !v)
        }}
      >
        <span className="backlinks-chevron">{open ? '▾' : '▸'}</span>
        {notes.length === 1 ? t('backlinksOne') : t('backlinksMany', { count: String(notes.length) })}
      </button>
      {open && (
        <ul className="backlinks-list">
          {notes.map((note) => (
            <li key={note}>
              <button
                className="backlinks-item"
                title={note}
                onClick={() => void useTabs.getState().openFile(note)}
              >
                {withoutExt(basename(note))}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
