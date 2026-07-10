import { useEffect, useRef, useState } from 'react'
import type { TreeNode } from '../../../shared/types'
import { openFolderDialog, useWorkspace } from '../../stores/workspace'
import { useTabs } from '../../stores/tabs'
import { useT } from '../../i18n'
import Icon from '../Icon'

interface ContextMenuState {
  x: number
  y: number
  node: TreeNode | null // null = fond du panneau (racine)
}

interface EditingState {
  mode: 'create-file' | 'create-dir' | 'rename'
  /** dossier parent pour create, nœud visé pour rename */
  target: TreeNode | null
  initial: string
}

export default function FileTree(): JSX.Element {
  const t = useT()
  const { rootPath, rootName, tree } = useWorkspace()
  const { activePath, openFile, closeTab, handleRenamed } = useTabs()
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [menu, setMenu] = useState<ContextMenuState | null>(null)
  const [editing, setEditing] = useState<EditingState | null>(null)
  const [selected, setSelected] = useState<TreeNode | null>(null)

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

  const parentDirOf = (node: TreeNode | null): string => {
    if (!node) return rootPath!
    if (node.type === 'dir') return node.path
    return node.path.slice(0, node.path.lastIndexOf('/'))
  }

  const startCreate = (mode: 'create-file' | 'create-dir'): void => {
    const target = menu?.node ?? null
    if (target && target.type === 'dir') {
      setExpanded((prev) => new Set(prev).add(target.path))
    }
    setEditing({ mode, target, initial: '' })
    setMenu(null)
  }

  const startRenameNode = (node: TreeNode): void => {
    setEditing({ mode: 'rename', target: node, initial: node.name })
    setMenu(null)
  }

  const startRename = (): void => {
    if (menu?.node) startRenameNode(menu.node)
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

  const submitEditing = async (value: string): Promise<void> => {
    const edit = editing
    setEditing(null)
    if (!edit || !value.trim() || !rootPath) return
    const name = value.trim()
    try {
      if (edit.mode === 'rename' && edit.target) {
        const newPath = await window.stancode.fs.rename(edit.target.path, name)
        handleRenamed(edit.target.path, newPath)
      } else {
        await window.stancode.fs.create(
          parentDirOf(edit.target),
          name,
          edit.mode === 'create-dir' ? 'dir' : 'file'
        )
      }
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

  return (
    <div className="pane filetree-pane" onContextMenu={(e) => openMenu(e, null)}>
      <div className="pane-header filetree-header">
        <span title={rootPath}>{rootName}</span>
        <button className="icon-btn" title={t('changeFolder')} onClick={openFolderDialog}>
          <Icon name="more" size={15} />
        </button>
      </div>
      <div className="filetree-scroll">
        <TreeLevel
          nodes={tree}
          depth={0}
          expanded={expanded}
          activeFile={activePath}
          selectedPath={selected?.path ?? null}
          onPick={setSelected}
          onToggle={toggleDir}
          onSelect={(path) => void openFile(path)}
          onMenu={openMenu}
        />
        {editing && editing.target === null && (
          <InlineInput
            depth={0}
            initial={editing.initial}
            onSubmit={submitEditing}
            onCancel={() => setEditing(null)}
          />
        )}
      </div>

      {editing && editing.target !== null && (
        <EditingOverlay editing={editing} onSubmit={submitEditing} onCancel={() => setEditing(null)} />
      )}

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
              <button onClick={startRename}>
                <Icon name="rename" size={15} />
                <span>{t('rename')}</span>
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
  onPick: (node: TreeNode) => void
  onToggle: (path: string) => void
  onSelect: (path: string) => void
  onMenu: (e: React.MouseEvent, node: TreeNode) => void
}

function TreeLevel(props: TreeLevelProps): JSX.Element {
  const { nodes, depth, expanded, activeFile, selectedPath, onPick, onToggle, onSelect, onMenu } =
    props
  return (
    <>
      {nodes.map((node) => (
        <div key={node.path}>
          <div
            className={[
              'tree-item',
              node.type,
              node.name.endsWith('.md') ? 'md' : '',
              activeFile === node.path ? 'active' : '',
              selectedPath === node.path ? 'selected' : ''
            ].join(' ')}
            style={{ paddingLeft: 10 + depth * 14 }}
            onClick={() => {
              onPick(node)
              if (node.type === 'dir') onToggle(node.path)
              else onSelect(node.path)
            }}
            onContextMenu={(e) => onMenu(e, node)}
            title={node.path}
          >
            <span
              className={`tree-chevron ${node.type === 'dir' && expanded.has(node.path) ? 'open' : ''}`}
            >
              {node.type === 'dir' ? <Icon name="chevron" size={14} /> : null}
            </span>
            <span className="tree-name">{node.name}</span>
          </div>
          {node.type === 'dir' && expanded.has(node.path) && node.children && (
            <TreeLevel {...props} nodes={node.children} depth={depth + 1} />
          )}
        </div>
      ))}
    </>
  )
}

function EditingOverlay(props: {
  editing: EditingState
  onSubmit: (value: string) => void
  onCancel: () => void
}): JSX.Element {
  const t = useT()
  const label =
    props.editing.mode === 'rename'
      ? t('renameLabel', { name: props.editing.target?.name ?? '' })
      : props.editing.mode === 'create-dir'
        ? t('newDir')
        : t('newFile')
  return (
    <div className="editing-overlay">
      <div className="editing-box">
        <div className="editing-label">{label}</div>
        <InlineInput
          depth={0}
          initial={props.editing.initial}
          onSubmit={props.onSubmit}
          onCancel={props.onCancel}
        />
      </div>
    </div>
  )
}

function InlineInput(props: {
  depth: number
  initial: string
  onSubmit: (value: string) => void
  onCancel: () => void
}): JSX.Element {
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => {
    ref.current?.focus()
    ref.current?.select()
  }, [])
  return (
    <input
      ref={ref}
      className="inline-input"
      style={{ marginLeft: 10 + props.depth * 14 }}
      defaultValue={props.initial}
      onKeyDown={(e) => {
        if (e.key === 'Enter') props.onSubmit(e.currentTarget.value)
        else if (e.key === 'Escape') props.onCancel()
      }}
      onBlur={(e) => props.onSubmit(e.currentTarget.value)}
    />
  )
}
