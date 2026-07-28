import { create } from 'zustand'
import type { RadioState as SharedRadioState } from '../../shared/types'

export interface Station {
  id: string
  name: string
  mood: string
  kind: 'audio' | 'youtube'
  /** kind 'audio' : URL du flux Icecast/AAC. */
  url?: string
  /** kind 'youtube' : identifiant de la vidéo/live. */
  videoId?: string
}

/** Stations sans pub. `audio` = flux direct (Radio Paradise renvoie un CORS à notre
 *  origine). `youtube` = lecteur officiel embarqué (Claude FM, chaîne @claude).
 *  Pour en ajouter, voir _Atelier/stanote/radio/liste radio.md. */
export const STATIONS: Station[] = [
  { id: 'claude-fm', name: 'Claude FM', mood: 'music for thinking', kind: 'youtube', videoId: 'tRsQsTMvPNg' },
  { id: 'dreamgaze', name: 'Dreamgaze FM', mood: 'dream pop/indie', kind: 'youtube', videoId: 'P25UFyozJDA' },
  { id: 'morning-frog', name: 'Morning Frog', mood: 'lofi', kind: 'youtube', videoId: 'hdQS3NJ5S4Q' },
  { id: 'honey-coffee', name: 'Honey Coffee', mood: 'lofi hip hop', kind: 'youtube', videoId: 'dw_Bx0e0lis' },
  { id: 'summer-coffee', name: 'Summer Coffee', mood: 'lofi hip hop', kind: 'youtube', videoId: '5IMF6DeLoEg' },
  { id: 'lofi-hiphop', name: 'Lofi Hip Hop Radio', mood: 'lofi hip hop', kind: 'youtube', videoId: 'rPjez8z61rI' },
  { id: 'ethio-lofi', name: 'Ethio Lofi', mood: 'ethio jazz/lofi', kind: 'youtube', videoId: 'sjRtONZKoTI' },
  { id: 'rp-mellow', name: 'Radio Paradise · Mellow', mood: 'chill/acoustic', kind: 'audio', url: 'https://stream.radioparadise.com/mellow-128' },
  { id: 'rp-main', name: 'Radio Paradise · Main', mood: 'éclectique', kind: 'audio', url: 'https://stream.radioparadise.com/aac-128' },
  { id: 'rp-global', name: 'Radio Paradise · Global', mood: 'world/chill', kind: 'audio', url: 'https://stream.radioparadise.com/global-128' }
]

/** Repli automatique du player après cette durée de pause. */
const IDLE_MS = 5 * 60 * 1000

/** Élément audio unique, hors React (survit au démontage des composants). Sert
 *  aux stations `audio` ; les stations `youtube` sont gérées par <RadioYouTube>. */
const audio = new Audio()
audio.preload = 'none'

// Attention : localStorage.getItem renvoie null si absent, et Number(null) === 0
// (pas NaN) → il faut écarter null explicitement, sinon le volume tombe à 0.
const storedVolRaw = localStorage.getItem('stanote:radioVolume')
const storedVol = storedVolRaw === null ? NaN : Number(storedVolRaw)
audio.volume = Number.isFinite(storedVol) && storedVol > 0 && storedVol <= 1 ? storedVol : 0.8

function detectIndex(): number {
  const s = Number(localStorage.getItem('stanote:radioStation'))
  return Number.isInteger(s) && s >= 0 && s < STATIONS.length ? s : 0
}

interface RadioState {
  index: number
  station: Station
  /** état partagé par toutes les fenêtres (source de vérité : processus principal) */
  isPlaying: boolean
  /** cette fenêtre est celle qui émet réellement le son */
  isOwner: boolean
  expanded: boolean
  coverOpen: boolean
  lastError: string | null
  toggleExpanded: () => void
  play: () => void
  pause: () => void
  toggle: () => void
  next: () => void
  setStation: (index: number) => void
  toggleCover: () => void
}

// Repli automatique du player après une pause prolongée.
let idleTimer: ReturnType<typeof setTimeout> | null = null
function clearIdle(): void {
  if (idleTimer) {
    clearTimeout(idleTimer)
    idleTimer = null
  }
}
function armIdle(): void {
  clearIdle()
  idleTimer = setTimeout(() => useRadio.setState({ expanded: false, coverOpen: false }), IDLE_MS)
}

export const useRadio = create<RadioState>((set, get) => {
  audio.addEventListener('playing', () => {
    if (get().station.kind !== 'audio') return
    clearIdle()
    set({ lastError: null })
  })
  audio.addEventListener('error', () => {
    if (get().station.kind !== 'audio') return
    const err = audio.error
    const msg = `media error ${err?.code ?? '?'}${err?.message ? ' — ' + err.message : ''}`
    console.warn('[radio]', msg, 'src=', audio.currentSrc)
    set({ lastError: msg })
  })

  const persist = (i: number): void => localStorage.setItem('stanote:radioStation', String(i))

  const initial = detectIndex()
  return {
    index: initial,
    station: STATIONS[initial],
    isPlaying: false,
    isOwner: false,
    expanded: false,
    coverOpen: false,
    lastError: null,
    toggleExpanded: () => set((s) => ({ expanded: !s.expanded })),
    // Les commandes ne changent pas l'état localement : elles sont envoyées au
    // processus principal, qui rediffuse le nouvel état à toutes les fenêtres.
    play: () => window.stancode.radio.play(get().index),
    pause: () => window.stancode.radio.pause(),
    toggle: () => (get().isPlaying ? get().pause() : get().play()),
    next: () => {
      const n = STATIONS.length
      let j = get().index
      while (n > 1 && j === get().index) j = Math.floor(Math.random() * n)
      get().setStation(j)
    },
    setStation: (i: number) => {
      if (i < 0 || i >= STATIONS.length) return
      persist(i)
      window.stancode.radio.play(i)
    },
    toggleCover: () => set((s) => ({ coverOpen: !s.coverOpen }))
  }
})

/* Réconciliation : aligne le lecteur local sur l'état partagé. Seule la fenêtre
   porteuse émet le son ; les autres n'affichent que l'état. */
function applyShared(shared: SharedRadioState): void {
  const store = useRadio.getState()
  const i = shared.index ?? store.index
  const station = STATIONS[i] ?? STATIONS[0]
  const wasPlaying = store.isPlaying
  const stationChanged = station.id !== store.station.id

  useRadio.setState({
    index: i,
    station,
    isPlaying: shared.isPlaying,
    isOwner: shared.isOwner,
    ...(shared.isPlaying ? { expanded: true } : {}),
    ...(stationChanged ? { lastError: null } : {})
  })

  const shouldSound = shared.isPlaying && shared.isOwner
  if (shouldSound && station.kind === 'audio') {
    if (audio.src !== station.url) audio.src = station.url as string
    if (audio.paused || stationChanged) {
      audio.play().catch((e: unknown) => {
        const msg = e instanceof Error ? `${e.name}: ${e.message}` : String(e)
        console.warn('[radio] play() failed:', msg, 'src=', audio.src)
        useRadio.setState({ lastError: msg })
      })
    }
    clearIdle()
  } else {
    // Station youtube (l'iframe est montée par <RadioYouTube> selon isPlaying
    // && isOwner), fenêtre non porteuse, ou lecture arrêtée.
    audio.pause()
    if (shouldSound) clearIdle()
    else if (wasPlaying) armIdle()
  }
}

// État initial + suivi des changements venant des autres fenêtres.
window.stancode.radio.onState(applyShared)
void window.stancode.radio.getState().then((shared) => {
  if (shared.index === null) window.stancode.radio.seed(useRadio.getState().index)
  applyShared(shared)
})

export function setRadioVolume(v: number): void {
  audio.volume = v
  localStorage.setItem('stanote:radioVolume', String(v))
}
