import { useEffect, useRef } from 'react'
import { useRadio } from '../stores/radio'

/** Lecteur des stations YouTube (Claude FM). L'iframe n'est montée que pendant la
 *  lecture, cachée hors écran. On ne se repose PAS sur autoplay=1 (peu fiable à la
 *  réouverture) : on pilote explicitement via l'API du lecteur (enablejsapi +
 *  postMessage playVideo), avec relances pour couvrir le délai d'initialisation. */
export default function RadioYouTube(): JSX.Element | null {
  const station = useRadio((s) => s.station)
  const isPlaying = useRadio((s) => s.isPlaying)
  // Une seule radio pour l'app : seule la fenêtre porteuse émet le son.
  const isOwner = useRadio((s) => s.isOwner)
  const iframeRef = useRef<HTMLIFrameElement>(null)

  const active = station.kind === 'youtube' && !!station.videoId && isPlaying && isOwner

  useEffect(() => {
    if (!active) return
    const post = (func: string): void => {
      iframeRef.current?.contentWindow?.postMessage(
        JSON.stringify({ event: 'command', func, args: [] }),
        '*'
      )
    }
    // Relance playVideo jusqu'à ce que le player soit prêt (init ~1-3 s).
    let n = 0
    const iv = setInterval(() => {
      post('playVideo')
      if (++n >= 16) clearInterval(iv)
    }, 400)
    post('playVideo')
    return () => clearInterval(iv)
  }, [active, station.videoId])

  if (!active) return null

  const origin = encodeURIComponent(window.location.origin)
  const src =
    `https://www.youtube-nocookie.com/embed/${station.videoId}` +
    `?enablejsapi=1&autoplay=1&controls=0&playsinline=1&modestbranding=1&rel=0&iv_load_policy=3&origin=${origin}`

  return (
    <iframe
      ref={iframeRef}
      title={station.name}
      src={src}
      allow="autoplay; encrypted-media"
      style={{
        position: 'fixed',
        width: 1,
        height: 1,
        left: -9999,
        top: -9999,
        border: 0,
        opacity: 0,
        pointerEvents: 'none'
      }}
    />
  )
}
