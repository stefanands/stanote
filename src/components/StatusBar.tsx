import { useTabs } from '../stores/tabs'
import { useWorkspace } from '../stores/workspace'
import { useTheme } from '../stores/theme'
import { useFont, FONT_PAIRS } from '../stores/font'
import { useI18n, useT } from '../i18n'
import Icon from './Icon'

export default function StatusBar(): JSX.Element {
  const t = useT()
  const { locale, setLocale } = useI18n()
  const { theme, setTheme } = useTheme()
  const { index: fontIndex, cycle: cycleFont } = useFont()
  const { rootPath } = useWorkspace()
  const { tabs, activePath } = useTabs()

  const active = tabs.find((tab) => tab.path === activePath)
  const relative =
    active && rootPath && active.path.startsWith(rootPath)
      ? active.path.slice(rootPath.length + 1)
      : active?.path

  return (
    <div className="statusbar">
      <span className="statusbar-path">{rootPath ?? t('noFolder')}</span>
      <span className="statusbar-right">
        <span className="statusbar-file">
          {active ? `${relative}${active.dirty ? ' ●' : ''}` : t('shortcutsHint')}
        </span>
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
          <Icon name={theme === 'dark' ? 'moon' : 'sun'} size={14} />
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
