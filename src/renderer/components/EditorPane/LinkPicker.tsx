import { useEffect, useMemo, useRef, useState } from 'react'
import type { TreeNode } from '../../../shared/types'
import { useWorkspace } from '../../stores/workspace'
import { useT } from '../../i18n'
import { basename, dirname, relativeLink } from '../../lib/path'

interface Candidate {
  /** chemin absolu de la note */
  path: string
  /** nom affiché, sans l'extension */
  label: string
  /** « ici » ou le nom du dossier parent, pour situer la note */
  where: string
}

interface Props {
  /** note en cours d'édition : les liens sont relatifs à elle */
  notePath: string
  onClose: () => void
  /** insère le lien dans le document */
  onPick: (href: string, label: string) => void
}

/** Cherche un dossier dans l'arbre par son chemin absolu. */
function findDir(nodes: TreeNode[], path: string): TreeNode[] | null {
  for (const node of nodes) {
    if (node.type !== 'dir') continue
    if (node.path === path) return node.children ?? []
    const found = node.children ? findDir(node.children, path) : null
    if (found) return found
  }
  return null
}

const isNote = (n: TreeNode): boolean => n.type === 'file' && /\.(md|markdown|txt)$/i.test(n.name)
const withoutExt = (name: string): string => name.replace(/\.(md|markdown|txt)$/i, '')

/** Sélecteur de note à lier (Cmd+K) : notes du dossier courant et du dossier
 *  parent uniquement ; un nom inconnu crée la note dans le dossier courant. */
export default function LinkPicker({ notePath, onClose, onPick }: Props): JSX.Element {
  const t = useT()
  const { rootPath, tree } = useWorkspace()
  const [query, setQuery] = useState('')
  const [index, setIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => inputRef.current?.focus(), [])

  const noteDir = dirname(notePath)

  const candidates = useMemo<Candidate[]>(() => {
    if (!rootPath) return []
    const list: Candidate[] = []
    const add = (nodes: TreeNode[], where: string): void => {
      for (const node of nodes) {
        if (!isNote(node) || node.path === notePath) continue
        list.push({ path: node.path, label: withoutExt(node.name), where })
      }
    }
    // Dossier de la note (la racine du dossier ouvert n'est pas dans l'arbre).
    add(noteDir === rootPath ? tree : (findDir(tree, noteDir) ?? []), t('linkHere'))
    // Puis le dossier parent, sans sortir du dossier ouvert.
    const parent = dirname(noteDir)
    if (noteDir !== rootPath && parent.startsWith(rootPath)) {
      add(parent === rootPath ? tree : (findDir(tree, parent) ?? []), basename(parent))
    }
    return list
  }, [rootPath, tree, notePath, noteDir, t])

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase()
    const found = q ? candidates.filter((c) => c.label.toLowerCase().includes(q)) : candidates
    return found.slice(0, 50)
  }, [candidates, query])

  const trimmed = query.trim()
  // Proposition de création si le nom saisi ne correspond à aucune note.
  const canCreate =
    trimmed.length > 0 && !candidates.some((c) => c.label.toLowerCase() === trimmed.toLowerCase())
  const total = matches.length + (canCreate ? 1 : 0)

  useEffect(() => setIndex(0), [query])

  const choose = async (i: number): Promise<void> => {
    if (canCreate && i === matches.length) {
      // Nouvelle note, créée à côté de celle en cours.
      const name = /\.[^./]+$/.test(trimmed) ? trimmed : `${trimmed}.md`
      try {
        const created = await window.stancode.fs.create(noteDir, name, 'file')
        onPick(relativeLink(notePath, created), withoutExt(name))
      } catch (err) {
        console.error(err)
        onClose()
      }
      return
    }
    const target = matches[i]
    if (target) onPick(relativeLink(notePath, target.path), target.label)
  }

  return (
    <>
      <div className="popover-backdrop" onClick={onClose} />
      <div className="link-picker">
        <input
          ref={inputRef}
          className="link-picker-input"
          placeholder={t('linkPlaceholder')}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              e.preventDefault()
              onClose()
            } else if (e.key === 'ArrowDown') {
              e.preventDefault()
              setIndex((i) => (total ? (i + 1) % total : 0))
            } else if (e.key === 'ArrowUp') {
              e.preventDefault()
              setIndex((i) => (total ? (i - 1 + total) % total : 0))
            } else if (e.key === 'Enter') {
              e.preventDefault()
              void choose(index)
            }
          }}
        />
        <div className="link-picker-list">
          {matches.map((c, i) => (
            <div
              key={c.path}
              className={i === index ? 'link-picker-item selected' : 'link-picker-item'}
              onMouseEnter={() => setIndex(i)}
              onClick={() => void choose(i)}
            >
              <span className="link-picker-name">{c.label}</span>
              <span className="link-picker-where">{c.where}</span>
            </div>
          ))}
          {canCreate && (
            <div
              className={
                index === matches.length ? 'link-picker-item selected' : 'link-picker-item'
              }
              onMouseEnter={() => setIndex(matches.length)}
              onClick={() => void choose(matches.length)}
            >
              <span className="link-picker-name">{t('linkCreate', { name: trimmed })}</span>
              <span className="link-picker-where">{t('linkHere')}</span>
            </div>
          )}
          {total === 0 && <div className="link-picker-empty">{t('linkNoNote')}</div>}
        </div>
      </div>
    </>
  )
}
