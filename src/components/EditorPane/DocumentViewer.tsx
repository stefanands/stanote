import { useEffect, useState } from 'react'

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

export default function DocumentViewer({ path, kind }: { path: string; kind: Kind }): JSX.Element {
  const [url, setUrl] = useState<string | null>(null)
  const [html, setHtml] = useState<string | null>(null)

  useEffect(() => {
    let objectUrl: string | null = null
    let cancelled = false

    if (kind === 'html') {
      void window.stancode.fs.readFile(path).then((content) => {
        if (!cancelled) setHtml(withBase(content, path))
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
  }, [path, kind])

  if (kind === 'image') {
    return (
      <div className="doc-image">{url && <img src={url} alt={path.split('/').pop()} />}</div>
    )
  }
  if (kind === 'html') {
    return <iframe className="doc-viewer" sandbox="" srcDoc={html ?? ''} title="preview" />
  }
  return url ? (
    <iframe className="doc-viewer" src={url} title="pdf" />
  ) : (
    <div className="pane-placeholder" />
  )
}
