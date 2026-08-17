import { useEffect, useState } from 'react'
import { basename, dirname } from '../../lib/path'

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
  const dir = dirname(path)
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
      <div className="doc-image">{url && <img src={url} alt={basename(path)} />}</div>
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
        <iframe className="doc-viewer" sandbox="allow-scripts" src={docUrl} title="preview" />
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
