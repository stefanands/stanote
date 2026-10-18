import { useLayoutEffect, useRef, useState } from 'react'
import { useT } from '../../i18n'
import { frontmatterKeys, withYaml, type Frontmatter } from '../../lib/markdown'

interface Props {
  front: Frontmatter
  onChange: (front: Frontmatter) => void
}

/* Frontmatter YAML d'une note : retiré de l'éditeur WYSIWYG, qui le
   détruirait, et affiché ici en en-tête. Replié, il résume les champs ;
   déplié, le YAML se modifie tel quel. */
export default function FrontmatterHeader({ front, onChange }: Props): JSX.Element {
  const t = useT()
  const [open, setOpen] = useState(false)
  const areaRef = useRef<HTMLTextAreaElement>(null)
  const yaml = front.yaml.replace(/\r?\n$/, '')
  const keys = frontmatterKeys(front)

  // Le champ s'ajuste à son contenu : tout le YAML reste visible.
  useLayoutEffect(() => {
    const el = areaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight + 2}px`
  }, [open, yaml])

  return (
    <div className="frontmatter">
      <button className="frontmatter-toggle" onClick={() => setOpen((v) => !v)}>
        <span className="frontmatter-chevron">{open ? '▾' : '▸'}</span>
        {t('frontmatter')}
        {keys.length > 0 && <span className="frontmatter-keys">{keys.join(' · ')}</span>}
      </button>
      {open && (
        <textarea
          ref={areaRef}
          className="frontmatter-yaml"
          spellCheck={false}
          value={yaml}
          onChange={(e) => onChange(withYaml(front, e.target.value))}
        />
      )}
    </div>
  )
}
