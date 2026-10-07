import { useEffect, useRef, useState } from 'react'
import { useTabs } from '../../stores/tabs'
import { useWorkspace } from '../../stores/workspace'
import { useT } from '../../i18n'
import { isInside, resolveLink } from '../../lib/path'

type Kind = 'pdf' | 'image' | 'html'

function imageMime(path: string): string {
  const p = path.toLowerCase()
  if (p.endsWith('.png')) return 'image/png'
  if (p.endsWith('.jpg') || p.endsWith('.jpeg')) return 'image/jpeg'
  if (p.endsWith('.gif')) return 'image/gif'
  if (p.endsWith('.webp')) return 'image/webp'
  if (p.endsWith('.svg')) return 'image/svg+xml'
  if (p.endsWith('.bmp')) return 'image/bmp'
  if (p.endsWith('.ico')) return 'image/x-icon'
  if (p.endsWith('.avif')) return 'image/avif'
  return 'application/octet-stream'
}

/** Aperçu en lecture seule des fichiers non-markdown (PDF, image, HTML). */
/** Injecte une balise <base> pointant vers le dossier du fichier (via le
 *  protocole interne stanote-file) : les css/images/polices en chemins
 *  relatifs du document se chargent, sans navigation de l'iframe vers une
 *  URL personnalisée (que macOS tenterait d'ouvrir comme app externe). */
function withBase(html: string, path: string): string {
  const dir = path.slice(0, path.lastIndexOf('/'))
  const base = `<base href="stanote-file://local${encodeURI(dir)}/">`
  if (/<head[^>]*>/i.test(html)) return html.replace(/<head[^>]*>/i, (m) => m + base)
  return base + html
}

interface Props {
  path: string
  kind: Kind
  /** html : contenu en mémoire (édition en cours) ; sinon relu sur le disque. */
  content?: string
}

export default function DocumentViewer({ path, kind, content }: Props): JSX.Element {
  const [url, setUrl] = useState<string | null>(null)
  const [html, setHtml] = useState<string | null>(null)
  /** URL servie en local : permet au document d'exécuter son JavaScript. */
  const [docUrl, setDocUrl] = useState<string | null>(null)
  const [docUrlReady, setDocUrlReady] = useState(false)
  const frameRef = useRef<HTMLIFrameElement>(null)
  const t = useT()
  // Message lu depuis un écouteur natif : gardé en ref pour rester à jour.
  const missingRef = useRef(t('linkMissing'))
  missingRef.current = t('linkMissing')

  /* Liens de la page : relayés par le script que le serveur local injecte.
     Un fichier du dossier ouvert s'ouvre dans un onglet (Cmd : dans l'autre
     colonne), une adresse web dans le navigateur. Seuls les messages de cette
     iframe sont écoutés, et rien hors du dossier ouvert n'est ouvert. */
  useEffect(() => {
    if (kind !== 'html') return
    const onMessage = (e: MessageEvent): void => {
      if (!frameRef.current || e.source !== frameRef.current.contentWindow) return
      const data = e.data as { stanote?: string; href?: unknown; other?: unknown }
      if (data?.stanote !== 'open-link' || typeof data.href !== 'string') return
      const href = data.href.trim()
      if (/^(https?|mailto):/i.test(href)) {
        window.open(href, '_blank')
        return
      }
      const target = resolveLink(path, href)
      const root = useWorkspace.getState().rootPath
      if (!target || !root || !isInside(root, target)) return
      const tabs = useTabs.getState()
      if (data.other === true) tabs.focusPane(tabs.focusedPane === 0 ? 1 : 0)
      void tabs.openFile(target).then(() => {
        if (!useTabs.getState().tabs.some((tb) => tb.path === target)) alert(missingRef.current)
      })
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [kind, path])

  // Rechargé à chaque changement de contenu : l'aperçu suit les modifications
  // enregistrées (l'auto-save écrit le fichier que sert le serveur local).
  useEffect(() => {
    if (kind !== 'html') return
    let cancelled = false
    void window.stancode.docUrl(path).then((u) => {
      if (cancelled) return
      setDocUrl(u ? `${u}?v=${Date.now()}` : null)
      setDocUrlReady(true)
    })
    return () => {
      cancelled = true
    }
  }, [path, kind, content])

  useEffect(() => {
    let objectUrl: string | null = null
    let cancelled = false

    if (kind === 'html') {
      if (content !== undefined) {
        setHtml(withBase(content, path))
        return
      }
      void window.stancode.fs.readFile(path).then((c) => {
        if (!cancelled) setHtml(withBase(c, path))
      })
    } else {
      void window.stancode.fs.readBinary(path).then((bytes) => {
        if (cancelled) return
        const type = kind === 'pdf' ? 'application/pdf' : imageMime(path)
        objectUrl = URL.createObjectURL(new Blob([bytes as BlobPart], { type }))
        setUrl(objectUrl)
      })
    }

    return () => {
      cancelled = true
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [path, kind, content])

  if (kind === 'image') {
    return (
      <div className="doc-image">{url && <img src={url} alt={path.split('/').pop()} />}</div>
    )
  }
  if (kind === 'html') {
    if (!docUrlReady) return <div className="pane-placeholder" />
    // Servi en http local : le document garde son URL de base (ressources
    // relatives) et peut exécuter son JavaScript — diaporamas, pages
    // interactives. `allow-scripts` sans `allow-same-origin` : origine opaque,
    // donc aucun accès à l'application, à ses données ni aux fichiers.
    if (docUrl) {
      return (
        <iframe
          ref={frameRef}
          className="doc-viewer"
          sandbox="allow-scripts"
          src={docUrl}
          title="preview"
        />
      )
    }
    // Repli si le serveur local n'a pas démarré : rendu sans JavaScript.
    return <iframe className="doc-viewer" sandbox="" srcDoc={html ?? ''} title="preview" />
  }
  return url ? (
    <iframe className="doc-viewer" src={url} title="pdf" />
  ) : (
    <div className="pane-placeholder" />
  )
}
