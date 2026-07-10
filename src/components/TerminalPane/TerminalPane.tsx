import { useEffect, useRef } from 'react'
import { useWorkspace } from '../../stores/workspace'
import { useTheme } from '../../stores/theme'
import { useT } from '../../i18n'
import Icon from '../Icon'
import {
  getTerminalHost,
  detachTerminalHost,
  fitTerminal,
  spawnTerminalIfNeeded,
  restartTerminal,
  setTerminalTheme
} from './terminalHost'

export default function TerminalPane(): JSX.Element {
  const t = useT()
  const rootPath = useWorkspace((s) => s.rootPath)
  const theme = useTheme((s) => s.theme)
  const slotRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const host = getTerminalHost(useTheme.getState().theme, t('terminalExited'))
    slotRef.current!.appendChild(host)
    requestAnimationFrame(fitTerminal)

    // Démarre le shell : dès qu'un dossier est connu, sinon après un court délai
    // (le temps que la restauration fixe le dossier courant). Idempotent.
    let timer: ReturnType<typeof setTimeout> | undefined
    if (rootPath) spawnTerminalIfNeeded()
    else timer = setTimeout(spawnTerminalIfNeeded, 800)

    return () => {
      if (timer) clearTimeout(timer)
      detachTerminalHost() // ne détruit pas le terminal : il survit au démontage
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => setTerminalTheme(theme), [theme])

  return (
    <div className="pane terminal-pane">
      <div className="pane-header filetree-header">
        <span>{t('terminal')}</span>
        <button className="icon-btn" title={t('restartTerminal')} onClick={restartTerminal}>
          <Icon name="refresh" size={14} />
        </button>
      </div>
      <div className="terminal-slot" ref={slotRef} />
    </div>
  )
}
