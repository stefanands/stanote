import { useEffect, useRef, useState } from 'react'
import { useRadio, STATIONS } from '../stores/radio'
import { useT } from '../i18n'
import Icon from './Icon'
import stanLoopWebm from '../assets/stan-loop.webm'
import stanLoopMp4 from '../assets/stan-loop.mp4'
import stanPoster from '../assets/stan-poster.png'

/** Pochette flottante (bas-droite, au-dessus de la barre). Stan s'anime en
 *  lecture, se fige (poster) en pause. Nom de la radio qui défile s'il est long.
 *  Icône radio → déploie la liste des stations par-dessus la pochette. */
export default function RadioCover(): JSX.Element | null {
  const t = useT()
  const coverOpen = useRadio((s) => s.coverOpen)
  const isPlaying = useRadio((s) => s.isPlaying)
  const station = useRadio((s) => s.station)
  const index = useRadio((s) => s.index)
  const setStation = useRadio((s) => s.setStation)
  const videoRef = useRef<HTMLVideoElement>(null)
  const nameRef = useRef<HTMLSpanElement>(null)
  const [scroll, setScroll] = useState(false)
  const [listOpen, setListOpen] = useState(false)

  // Stan joue quand la radio joue, se fige sinon.
  useEffect(() => {
    const v = videoRef.current
    if (!v) return
    if (coverOpen && isPlaying) void v.play().catch(() => undefined)
    else v.pause()
  }, [coverOpen, isPlaying])

  // Marquee uniquement si le nom déborde.
  useEffect(() => {
    const el = nameRef.current
    const box = el?.parentElement
    if (!el || !box) return
    const overflow = el.scrollWidth - box.clientWidth
    if (overflow > 4) {
      el.style.setProperty('--marquee-dist', `-${overflow + 12}px`)
      setScroll(true)
    } else {
      setScroll(false)
    }
  }, [station.name, coverOpen, listOpen])

  // Referme la liste quand la pochette se ferme.
  useEffect(() => {
    if (!coverOpen) setListOpen(false)
  }, [coverOpen])

  if (!coverOpen) return null

  return (
    <div className="radio-cover">
      <video
        ref={videoRef}
        className="radio-cover-video"
        poster={stanPoster}
        muted
        loop
        playsInline
        preload="auto"
      >
        <source src={stanLoopWebm} type="video/webm" />
        <source src={stanLoopMp4} type="video/mp4" />
      </video>
      <div className="radio-cover-name">
        <button
          className={listOpen ? 'radio-pick-btn on' : 'radio-pick-btn'}
          title={t('radioChoose')}
          aria-label={t('radioChoose')}
          onClick={() => setListOpen((v) => !v)}
        >
          <Icon name="radio" size={14} />
        </button>
        <span ref={nameRef} className={scroll ? 'radio-cover-marquee scroll' : 'radio-cover-marquee'}>
          {station.name}
        </span>
      </div>
      {listOpen && (
        <div className="radio-list">
          {STATIONS.map((s, i) => (
            <button
              key={s.id}
              className={i === index ? 'radio-list-item on' : 'radio-list-item'}
              onClick={() => {
                setStation(i)
                setListOpen(false)
              }}
            >
              {s.name}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
