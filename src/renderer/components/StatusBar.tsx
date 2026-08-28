import { useActiveTab } from '../stores/tabs'
import { useWorkspace } from '../stores/workspace'
import { useTheme } from '../stores/theme'
import { useFont, FONT_PAIRS } from '../stores/font'
import { useI18n, useT } from '../i18n'
import Icon from './Icon'
import RadioPlayer from './RadioPlayer'

export default function StatusBar(): JSX.Element {
  const t = useT()
  const { locale, setLocale } = useI18n()
  const { theme, setTheme } = useTheme()
  const { index: fontIndex, cycle: cycleFont } = useFont()
  const { rootPath } = useWorkspace()
  const active = useActiveTab()
  const relative = active?.untitled
    ? `${active.name} — ${t('untitled')}`
    : active && rootPath && active.path.startsWith(rootPath)
      ? active.path.slice(rootPath.length + 1)
      : active?.path

  return (
    <div className="statusbar">
      <span className="statusbar-path">
        {active ? `${relative}${active.dirty ? ' ●' : ''}` : ''}
      </span>
      <span className="statusbar-right">
        <RadioPlayer />
        <button
          className="chip-btn"
          title={`${t('fontCycle')} — ${FONT_PAIRS[fontIndex].label}`}
          onClick={cycleFont}
        >
          <span className="chip-aa">Aa</span>
        </button>
        <button
          className="chip-btn"
          title={t('themeToggle')}
          onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
        >
          <Icon name={theme === 'dark' ? 'moon' : 'sun'} size={18} />
        </button>
        <button
          className="chip-btn"
          title="Français / English"
          onClick={() => setLocale(locale === 'fr' ? 'en' : 'fr')}
        >
          {locale.toUpperCase()}
        </button>
      </span>
    </div>
  )
}
