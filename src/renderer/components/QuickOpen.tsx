import { useEffect, useMemo, useRef, useState } from 'react'
import type { TreeNode } from '../../shared/types'
import { useWorkspace } from '../stores/workspace'
import { useTabs } from '../stores/tabs'
import { useUi } from '../stores/ui'
import { useT } from '../i18n'

interface FileEntry {
  path: string
  rel: string
}

function flatten(nodes: TreeNode[], rootPath: string, out: FileEntry[] = []): FileEntry[] {
  for (const node of nodes) {
    if (node.type === 'file') {
      out.push({ path: node.path, rel: node.path.slice(rootPath.length + 1) })
    } else if (node.children) {
      flatten(node.children, rootPath, out)
    }
  }
  return out
}

/** Score fuzzy simple : sous-séquence requise, bonus si la sous-chaîne est
 *  contiguë ou en début de nom de fichier. Plus petit = meilleur. */
function fuzzyScore(rel: string, query: string): number | null {
  const hay = rel.toLowerCase()
  const q = query.toLowerCase()
  const substrIdx = hay.indexOf(q)
  if (substrIdx >= 0) {
    const nameIdx = hay.lastIndexOf('/') + 1
    return substrIdx >= nameIdx ? substrIdx - nameIdx : 100 + substrIdx
  }
  let i = 0
  for (const ch of q) {
    i = hay.indexOf(ch, i)
    if (i < 0) return null
    i++
  }
  return 1000 + hay.length
}

export default function QuickOpen(): JSX.Element | null {
  const t = useT()
  const { rootPath, tree } = useWorkspace()
  const openFile = useTabs((s) => s.openFile)
  const { quickOpen, setQuickOpen } = useUi()

  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (quickOpen) {
      setQuery('')
      setSelected(0)
      // focus après le rendu de l'overlay
      requestAnimationFrame(() => inputRef.current?.focus())
    }
  }, [quickOpen])

  const files = useMemo(
    () => (rootPath ? flatten(tree, rootPath) : []),
    [tree, rootPath]
  )

  const matches = useMemo(() => {
    if (!query.trim()) return files.slice(0, 50)
    const scored: { entry: FileEntry; score: number }[] = []
    for (const entry of files) {
      const score = fuzzyScore(entry.rel, query.trim())
      if (score !== null) scored.push({ entry, score })
    }
    scored.sort((a, b) => a.score - b.score || a.entry.rel.length - b.entry.rel.length)
    return scored.slice(0, 50).map((s) => s.entry)
  }, [files, query])

  if (!quickOpen || !rootPath) return null

  const choose = (entry: FileEntry | undefined): void => {
    setQuickOpen(false)
    if (entry) void openFile(entry.path)
  }

  return (
    <div className="quickopen-overlay" onMouseDown={() => setQuickOpen(false)}>
      <div className="quickopen-box" onMouseDown={(e) => e.stopPropagation()}>
        <input
          ref={inputRef}
          className="inline-input quickopen-input"
          placeholder={t('quickOpenPlaceholder')}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            setSelected(0)
          }}
          onKeyDown={(e) => {
            if (e.key === 'Escape') setQuickOpen(false)
            else if (e.key === 'ArrowDown') {
              e.preventDefault()
              setSelected((s) => Math.min(s + 1, matches.length - 1))
            } else if (e.key === 'ArrowUp') {
              e.preventDefault()
              setSelected((s) => Math.max(s - 1, 0))
            } else if (e.key === 'Enter') {
              choose(matches[selected])
            }
          }}
        />
        <div className="quickopen-list">
          {matches.map((entry, i) => (
            <div
              key={entry.path}
              className={`quickopen-item ${i === selected ? 'selected' : ''}`}
              onMouseEnter={() => setSelected(i)}
              onClick={() => choose(entry)}
              title={entry.path}
            >
              {entry.rel}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
