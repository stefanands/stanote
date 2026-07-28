import { useRadio } from '../stores/radio'
import { useT } from '../i18n'
import Icon from './Icon'

/** Micro-player radio inline dans la barre de statut : cassette → déplie
 *  play/pause · suivant · disque (ouvre la pochette Stan). */
export default function RadioPlayer(): JSX.Element {
  const t = useT()
  const expanded = useRadio((s) => s.expanded)
  const isPlaying = useRadio((s) => s.isPlaying)
  const coverOpen = useRadio((s) => s.coverOpen)
  const toggleExpanded = useRadio((s) => s.toggleExpanded)
  const toggle = useRadio((s) => s.toggle)
  const next = useRadio((s) => s.next)
  const toggleCover = useRadio((s) => s.toggleCover)
  const lastError = useRadio((s) => s.lastError)

  return (
    <span className="radio">
      <button
        className={isPlaying ? 'chip-btn playing' : 'chip-btn'}
        title={t('radioTitle')}
        onClick={toggleExpanded}
      >
        <Icon name="cassette" size={20} />
      </button>
      <span className={expanded ? 'radio-strip open' : 'radio-strip'}>
        <button
          className="chip-btn"
          title={isPlaying ? t('radioPause') : t('radioPlay')}
          onClick={toggle}
        >
          <Icon name={isPlaying ? 'pause' : 'play'} size={18} />
        </button>
        <button className="chip-btn" title={t('radioNext')} onClick={next}>
          <Icon name="next" size={18} />
        </button>
        <button
          className={coverOpen ? 'chip-btn active' : 'chip-btn'}
          title={coverOpen ? t('radioHideCover') : t('radioShowCover')}
          onClick={toggleCover}
        >
          <Icon
            name={coverOpen ? 'close' : 'disc'}
            size={18}
            className={!coverOpen && isPlaying ? 'icon-spin' : undefined}
          />
        </button>
        {lastError && (
          <span className="radio-error" title={lastError}>
            ⚠︎
          </span>
        )}
      </span>
    </span>
  )
}
