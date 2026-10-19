import { useEffect, useRef } from 'react'
import { Crepe } from '@milkdown/crepe'
import { editorViewCtx, prosePluginsCtx } from '@milkdown/kit/core'
import type { EditorView } from '@milkdown/prose/view'
import { search } from 'prosemirror-search'
import '@milkdown/crepe/theme/common/style.css'
import { crepeFeatureConfigs } from './crepeText'
import { useUi } from '../../stores/ui'
import { useT, type Locale } from '../../i18n'
import FindBar from './FindBar'
import LinkPicker from './LinkPicker'
import { useTabs } from '../../stores/tabs'
import { useWorkspace } from '../../stores/workspace'
import { dirname, resolveLink } from '../../lib/path'
import { resolveWikilink } from '../../lib/wikilinks'
import { obsidianKey, obsidianPlugin } from './obsidianPlugin'

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
  const linkPickerOpen = useUi((s) => s.linkPicker)
  const t = useT()
  // Message lu depuis un écouteur natif : gardé en ref pour rester à jour.
  const missingLinkRef = useRef(t('linkMissing'))
  missingLinkRef.current = t('linkMissing')

  useEffect(() => {
    const crepe = new Crepe({
      root: rootRef.current!,
      defaultValue: initialValue,
      featureConfigs: crepeFeatureConfigs(locale)
    })
    crepeRef.current = crepe

    // Chercher/remplacer (surlignage des occurrences, piloté par FindBar), et
    // rendu de la syntaxe Obsidian (wikilinks, callouts).
    crepe.editor.config((ctx) => {
      ctx.update(prosePluginsCtx, (plugins) => [
        ...plugins,
        search(),
        obsidianPlugin(() => {
          const ws = useWorkspace.getState()
          return { path, root: ws.rootPath, tree: ws.tree }
        })
      ])
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

  /* Clic sur un lien : une note du dossier s'ouvre dans un onglet, une URL part
     au navigateur. Sans ça, l'éditeur tenterait de « naviguer » vers un chemin
     relatif à l'application — page inexistante, interface perdue. */
  useEffect(() => {
    const host = rootRef.current
    if (!host) return
    const onClick = (e: MouseEvent): void => {
      // Wikilink rendu : ouvre la note visée, ou la crée dans ce dossier.
      const wiki = (e.target as HTMLElement | null)?.closest?.('[data-wikilink]') as HTMLElement | null
      if (wiki?.dataset.wikilink) {
        e.preventDefault()
        e.stopPropagation()
        void openWikilink(wiki.dataset.wikilink, e.metaKey || e.ctrlKey)
        return
      }
      const link = (e.target as HTMLElement | null)?.closest?.('a')
      const href = link?.getAttribute('href')
      if (!href) return
      e.preventDefault()
      e.stopPropagation()
      if (/^[a-z][a-z0-9+.-]*:/i.test(href)) {
        if (/^https?:/i.test(href)) window.open(href, '_blank')
        return
      }
      const target = resolveLink(path, href)
      if (!target) return
      // Cmd/Ctrl + clic : ouvrir dans l'autre colonne.
      const tabs = useTabs.getState()
      if (e.metaKey || e.ctrlKey) tabs.focusPane(tabs.focusedPane === 0 ? 1 : 0)
      void tabs.openFile(target).then(() => {
        if (!useTabs.getState().tabs.some((tb) => tb.path === target)) {
          alert(missingLinkRef.current)
        }
      })
    }
    host.addEventListener('click', onClick, true)
    return () => host.removeEventListener('click', onClick, true)
  }, [path])

  /** Ouvre la note d'un wikilink ; une cible introuvable (nom simple) est créée
   *  à côté de la note courante, comme dans Obsidian. */
  const openWikilink = async (target: string, otherPane: boolean): Promise<void> => {
    const { rootPath, tree } = useWorkspace.getState()
    if (!rootPath) return
    let file = resolveWikilink(target, path, rootPath, tree)
    if (!file) {
      if (/[\\/]/.test(target)) {
        alert(missingLinkRef.current)
        return
      }
      const name = /\.[^./]+$/.test(target) ? target : `${target}.md`
      try {
        file = await window.stancode.fs.create(dirname(path), name, 'file')
      } catch (err) {
        console.error(err)
        return
      }
    }
    const tabs = useTabs.getState()
    if (otherPane) tabs.focusPane(tabs.focusedPane === 0 ? 1 : 0)
    void tabs.openFile(file)
  }

  // Une note créée, renommée ou supprimée change la résolution des wikilinks :
  // on redemande le rendu des décorations.
  useEffect(
    () =>
      useWorkspace.subscribe((s, prev) => {
        if (s.tree === prev.tree) return
        const view = getView()
        if (view) view.dispatch(view.state.tr.setMeta(obsidianKey, 'refresh'))
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  )

  const getView = (): EditorView | null => {
    if (!readyRef.current || !crepeRef.current) return null
    try {
      return crepeRef.current.editor.ctx.get(editorViewCtx)
    } catch {
      return null
    }
  }

  /** Insère (ou transforme la sélection en) un lien vers une autre note. */
  const insertLink = (href: string, label: string): void => {
    useUi.getState().setLinkPicker(false)
    const view = getView()
    if (!view) return
    const { state } = view
    const mark = state.schema.marks['link']
    if (!mark) return
    const { from, to, empty } = state.selection
    const tr = empty
      ? state.tr.replaceSelectionWith(state.schema.text(label, [mark.create({ href })]), false)
      : state.tr.addMark(from, to, mark.create({ href }))
    // Sans ça, la marque reste active au curseur et tout ce qui est tapé
    // ensuite vient s'ajouter au libellé du lien.
    tr.removeStoredMark(mark)
    view.dispatch(tr.scrollIntoView())
    view.focus()
  }

  return (
    <div className="milkdown-wrap">
      {findOpen && <FindBar getView={getView} onClose={() => useUi.getState().setFindOpen(false)} />}
      {linkPickerOpen && (
        <LinkPicker
          notePath={path}
          onClose={() => useUi.getState().setLinkPicker(false)}
          onPick={insertLink}
        />
      )}
      <div className="milkdown-host" ref={rootRef} />
    </div>
  )
}
