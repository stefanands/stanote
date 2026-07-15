import { useEffect, useRef, useState } from 'react'
import type { TreeNode } from '../../../shared/types'
import { openFolderDialog, useWorkspace } from '../../stores/workspace'
import { fileKind, useTabs } from '../../stores/tabs'
import { useT } from '../../i18n'
import Icon, { type IconName } from '../Icon'

interface ContextMenuState {
  x: number
  y: number
  node: TreeNode | null // null = fond du panneau (racine)
}

interface EditingState {
  mode: 'create-file' | 'create-dir' | 'rename'
  /** rename : chemin du nœud ; create : dossier cible (rootPath pour la racine) */
  targetPath: string
  initial: string
}

/** Ajoute .md si aucune extension n'est fournie (nouveau fichier = markdown par défaut). */
function ensureExtension(name: string): string {
  return /\.[^./]+$/.test(name) ? name : `${name}.md`
}

const CODE_EXT = /\.(json|ya?ml|toml|xml|[jt]sx?|css|scss|sh|zsh|py|rb|go|rs|swift|sql)$/i

/** Icône selon le type : dossier ouvert/fermé, ou famille du fichier. */
function iconFor(node: TreeNode, open: boolean): IconName {
  if (node.type === 'dir') return open ? 'folder-open' : 'folder'
  const kind = fileKind(node.path)
  if (kind === 'markdown') return 'file-text'
  if (kind === 'image') return 'file-image'
  if (kind === 'html' || CODE_EXT.test(node.path)) return 'file-code'
  return 'file'
}

export default function FileTree(): JSX.Element {
  const t = useT()
  const { rootPath, rootName, tree } = useWorkspace()
  const { activePath, openFile, closeTab, handleMoved } = useTabs()
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [menu, setMenu] = useState<ContextMenuState | null>(null)
  const [editing, setEditing] = useState<EditingState | null>(null)
  const [selected, setSelected] = useState<TreeNode | null>(null)
  const [dropTarget, setDropTarget] = useState<string | null>(null)
  const draggingRef = useRef<string | null>(null)

  useEffect(() => {
    if (!menu) return
    const close = (): void => setMenu(null)
    window.addEventListener('click', close)
    window.addEventListener('contextmenu', close, true)
    return () => {
      window.removeEventListener('click', close)
      window.removeEventListener('contextmenu', close, true)
    }
  }, [menu])

  const toggleDir = (path: string): void => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(path)) next.delete(path)
      else next.add(path)
      return next
    })
  }

  const openMenu = (e: React.MouseEvent, node: TreeNode | null): void => {
    e.preventDefault()
    e.stopPropagation()
    setMenu({ x: e.clientX, y: e.clientY, node })
  }

  const parentDirOf = (path: string): string => path.slice(0, path.lastIndexOf('/'))

  const folderFor = (node: TreeNode | null): string => {
    if (!node) return rootPath!
    return node.type === 'dir' ? node.path : parentDirOf(node.path)
  }

  const startCreate = (mode: 'create-file' | 'create-dir'): void => {
    const folder = folderFor(menu?.node ?? null)
    if (folder !== rootPath) setExpanded((prev) => new Set(prev).add(folder))
    setEditing({ mode, targetPath: folder, initial: '' })
    setMenu(null)
  }

  const startRenameNode = (node: TreeNode): void => {
    setEditing({ mode: 'rename', targetPath: node.path, initial: node.name })
    setMenu(null)
  }

  // Renommage clavier sur l'élément sélectionné : F2 (toujours) ou Entrée
  // (sauf quand on tape dans l'éditeur / le terminal / un champ).
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (editing || !selected) return
      const el = document.activeElement as HTMLElement | null
      const typing =
        !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)
      if (e.key === 'F2') {
        e.preventDefault()
        startRenameNode(selected)
      } else if (e.key === 'Enter' && !typing) {
        e.preventDefault()
        startRenameNode(selected)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [selected, editing])

  const doDelete = async (): Promise<void> => {
    const node = menu?.node
    setMenu(null)
    if (!node) return
    if (!confirm(t('trashConfirm', { name: node.name }))) return
    try {
      await window.stancode.fs.remove(node.path)
      await closeTab(node.path)
    } catch (err) {
      console.error(err)
    }
  }

  const doReveal = (): void => {
    const node = menu?.node
    setMenu(null)
    if (node) void window.stancode.fs.reveal(node.path)
  }

  const doCopyPath = (): void => {
    const node = menu?.node
    setMenu(null)
    if (node) void navigator.clipboard.writeText(node.path)
  }

  const submitEditing = async (value: string): Promise<void> => {
    const edit = editing
    setEditing(null)
    const name = value.trim()
    if (!edit || !name || !rootPath) return
    try {
      if (edit.mode === 'rename') {
        if (name === edit.targetPath.split('/').pop()) return
        const newPath = await window.stancode.fs.rename(edit.targetPath, name)
        handleMoved(edit.targetPath, newPath)
      } else if (edit.mode === 'create-file') {
        const created = await window.stancode.fs.create(edit.targetPath, ensureExtension(name), 'file')
        void openFile(created)
      } else {
        await window.stancode.fs.create(edit.targetPath, name, 'dir')
      }
    } catch (err) {
      console.error(err)
    }
  }

  const moveTo = async (destDir: string, src: string | null): Promise<void> => {
    if (!src) return
    if (destDir === parentDirOf(src)) return // déjà dans ce dossier
    if (destDir === src || destDir.startsWith(src + '/')) return // dans soi-même
    try {
      const newPath = await window.stancode.fs.move(src, destDir)
      handleMoved(src, newPath)
    } catch (err) {
      console.error(err)
    }
  }

  if (!rootPath) {
    return (
      <div className="pane filetree-pane">
        <div className="pane-header">{t('files')}</div>
        <div className="pane-placeholder">
          <button className="link-btn" onClick={openFolderDialog}>
            {t('openFolder')}
          </button>
        </div>
      </div>
    )
  }

  const rootDropActive = dropTarget === '__root__'

  return (
    <div className="pane filetree-pane" onContextMenu={(e) => openMenu(e, null)}>
      <div className="pane-header filetree-header">
        <span title={rootPath}>{rootName}</span>
        <button className="icon-btn" title={t('changeFolder')} onClick={openFolderDialog}>
          <Icon name="more" size={15} />
        </button>
      </div>
      <div
        className={`filetree-scroll ${rootDropActive ? 'drop-root' : ''}`}
        onDragOver={(e) => {
          if (draggingRef.current) {
            e.preventDefault()
            setDropTarget('__root__')
          }
        }}
        onDragLeave={(e) => {
          if (e.currentTarget === e.target) setDropTarget(null)
        }}
        onDrop={(e) => {
          e.preventDefault()
          void moveTo(rootPath, draggingRef.current)
          draggingRef.current = null
          setDropTarget(null)
        }}
      >
        <TreeLevel
          nodes={tree}
          depth={0}
          expanded={expanded}
          activeFile={activePath}
          selectedPath={selected?.path ?? null}
          editing={editing}
          dropTarget={dropTarget}
          draggingRef={draggingRef}
          onPick={setSelected}
          onToggle={toggleDir}
          onSelect={(path) => void openFile(path)}
          onRename={startRenameNode}
          onMenu={openMenu}
          onSubmit={submitEditing}
          onCancel={() => setEditing(null)}
          onSetDrop={setDropTarget}
          onMove={moveTo}
          folderFor={folderFor}
        />
        {editing && editing.mode !== 'rename' && editing.targetPath === rootPath && (
          <EditRow
            depth={0}
            initial={editing.initial}
            onSubmit={submitEditing}
            onCancel={() => setEditing(null)}
          />
        )}
      </div>

      {menu && (
        <div className="context-menu" style={{ top: menu.y, left: menu.x }}>
          <button onClick={() => startCreate('create-file')}>
            <Icon name="file-plus" size={15} />
            <span>{t('newFile')}</span>
          </button>
          <button onClick={() => startCreate('create-dir')}>
            <Icon name="folder-plus" size={15} />
            <span>{t('newDir')}</span>
          </button>
          {menu.node && (
            <>
              <div className="context-menu-sep" />
              <button onClick={() => menu.node && startRenameNode(menu.node)}>
                <Icon name="rename" size={15} />
                <span>{t('rename')}</span>
              </button>
              <button onClick={doCopyPath}>
                <Icon name="copy" size={15} />
                <span>{t('copyPath')}</span>
              </button>
              <button onClick={doReveal}>
                <Icon name="reveal" size={15} />
                <span>{t('reveal')}</span>
              </button>
              <div className="context-menu-sep" />
              <button className="danger" onClick={doDelete}>
                <Icon name="trash" size={15} />
                <span>{t('delete')}</span>
              </button>
            </>
          )}
        </div>
      )}
    </div>
  )
}

interface TreeLevelProps {
  nodes: TreeNode[]
  depth: number
  expanded: Set<string>
  activeFile: string | null
  selectedPath: string | null
  editing: EditingState | null
  dropTarget: string | null
  draggingRef: React.MutableRefObject<string | null>
  onPick: (node: TreeNode) => void
  onToggle: (path: string) => void
  onSelect: (path: string) => void
  onRename: (node: TreeNode) => void
  onMenu: (e: React.MouseEvent, node: TreeNode) => void
  onSubmit: (value: string) => void
  onCancel: () => void
  onSetDrop: (path: string | null) => void
  onMove: (destDir: string, src: string | null) => void
  folderFor: (node: TreeNode) => string
}

function TreeLevel(props: TreeLevelProps): JSX.Element {
  const {
    nodes,
    depth,
    expanded,
    activeFile,
    selectedPath,
    editing,
    dropTarget,
    draggingRef,
    onPick,
    onToggle,
    onSelect,
    onRename,
    onMenu,
    onSubmit,
    onCancel,
    onSetDrop,
    onMove,
    folderFor
  } = props

  return (
    <>
      {nodes.map((node) => {
        if (editing?.mode === 'rename' && editing.targetPath === node.path) {
          return (
            <EditRow
              key={node.path}
              depth={depth}
              initial={editing.initial}
              onSubmit={onSubmit}
              onCancel={onCancel}
            />
          )
        }
        const dropDir = folderFor(node)
        return (
          <div key={node.path}>
            <div
              className={[
                'tree-item',
                node.type,
                node.name.endsWith('.md') ? 'md' : '',
                activeFile === node.path ? 'active' : '',
                selectedPath === node.path ? 'selected' : '',
                node.type === 'dir' && dropTarget === node.path ? 'drop-target' : ''
              ].join(' ')}
              style={{ paddingLeft: 10 + depth * 14 }}
              draggable
              onDragStart={(e) => {
                draggingRef.current = node.path
                e.dataTransfer.effectAllowed = 'move'
              }}
              onDragEnd={() => {
                draggingRef.current = null
                onSetDrop(null)
              }}
              onDragOver={(e) => {
                const src = draggingRef.current
                if (!src || dropDir === parentDirOf(src) || dropDir === src) return
                e.preventDefault()
                e.stopPropagation()
                if (node.type === 'dir') onSetDrop(node.path)
              }}
              onDrop={(e) => {
                e.preventDefault()
                e.stopPropagation()
                onMove(dropDir, draggingRef.current)
                draggingRef.current = null
                onSetDrop(null)
              }}
              onClick={() => {
                onPick(node)
                if (node.type === 'dir') onToggle(node.path)
                else onSelect(node.path)
              }}
              onDoubleClick={() => onRename(node)}
              onContextMenu={(e) => onMenu(e, node)}
              title={node.path}
            >
              <span className="tree-icon">
                <Icon name={iconFor(node, expanded.has(node.path))} size={15} />
              </span>
              <span className="tree-name">{node.name}</span>
            </div>
            {node.type === 'dir' && expanded.has(node.path) && (
              <>
                {node.children && <TreeLevel {...props} nodes={node.children} depth={depth + 1} />}
                {editing && editing.mode !== 'rename' && editing.targetPath === node.path && (
                  <EditRow
                    depth={depth + 1}
                    initial={editing.initial}
                    onSubmit={onSubmit}
                    onCancel={onCancel}
                  />
                )}
              </>
            )}
          </div>
        )
      })}
    </>
  )
}

function parentDirOf(path: string): string {
  return path.slice(0, path.lastIndexOf('/'))
}

function EditRow(props: {
  depth: number
  initial: string
  onSubmit: (value: string) => void
  onCancel: () => void
}): JSX.Element {
  const ref = useRef<HTMLInputElement>(null)
  const done = useRef(false)
  useEffect(() => {
    const input = ref.current
    if (!input) return
    input.focus()
    // Sélectionne le nom sans l'extension (comme le Finder).
    const dot = input.value.lastIndexOf('.')
    if (dot > 0) input.setSelectionRange(0, dot)
    else input.select()
  }, [])
  const submit = (v: string): void => {
    if (done.current) return
    done.current = true
    props.onSubmit(v)
  }
  const cancel = (): void => {
    if (done.current) return
    done.current = true
    props.onCancel()
  }
  return (
    <div className="tree-item editing-row" style={{ paddingLeft: 10 + props.depth * 14 }}>
      <span className="tree-icon" />
      <input
        ref={ref}
        className="tree-rename-input"
        defaultValue={props.initial}
        onKeyDown={(e) => {
          if (e.key === 'Enter') submit(e.currentTarget.value)
          else if (e.key === 'Escape') cancel()
        }}
        onBlur={(e) => submit(e.currentTarget.value)}
      />
    </div>
  )
}
