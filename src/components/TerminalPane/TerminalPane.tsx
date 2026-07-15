import { useEffect, useRef, useState } from 'react'
import { useWorkspace } from '../../stores/workspace'
import { useTheme } from '../../stores/theme'
import { useClaude } from '../../stores/claude'
import { useT } from '../../i18n'
import Icon from '../Icon'
import ClaudePane from './ClaudePane'
import {
  getTerminalHost,
  detachTerminalHost,
  refreshTerminal,
  spawnTerminalIfNeeded,
  restartTerminal,
  setTerminalTheme
} from './terminalHost'

/* L'hôte xterm survit au démontage (module singleton) : basculer en mode
   Claude et revenir ne perd ni le shell ni son historique. */
function TerminalHostSlot(): JSX.Element {
  const t = useT()
  const rootPath = useWorkspace((s) => s.rootPath)
  const slotRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const host = getTerminalHost(useTheme.getState().theme, t('terminalExited'))
    slotRef.current!.appendChild(host)
    requestAnimationFrame(refreshTerminal)

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

  return <div className="terminal-slot" ref={slotRef} />
}

export default function TerminalPane(): JSX.Element {
  const t = useT()
  const theme = useTheme((s) => s.theme)
  const [mode, setMode] = useState<'terminal' | 'claude'>('terminal')
  const claudeBusy = useClaude((s) => s.busy)

  useEffect(() => setTerminalTheme(theme), [theme])

  return (
    <div className={mode === 'claude' ? 'pane terminal-pane claude-mode' : 'pane terminal-pane'}>
      <div className="pane-header filetree-header">
        <span className={mode === 'claude' ? 'claude-title' : ''}>
          {mode === 'terminal' ? t('terminal') : t('claude')}
        </span>
        <span className="pane-header-actions">
          {mode === 'terminal' ? (
            <>
              <button className="icon-btn" title={t('restartTerminal')} onClick={restartTerminal}>
                <Icon name="refresh" size={17} />
              </button>
              <button
                className={claudeBusy ? 'icon-btn claude-btn claude-pulse' : 'icon-btn claude-btn'}
                title={t('askClaude')}
                onClick={() => setMode('claude')}
              >
                <Icon name="sparkle" size={17} />
              </button>
            </>
          ) : (
            <>
              <button
                className="icon-btn"
                title={t('claudeNew')}
                onClick={() => useClaude.getState().reset()}
              >
                <Icon name="file-plus" size={17} />
              </button>
              <button
                className="icon-btn"
                title={t('backToTerminal')}
                onClick={() => setMode('terminal')}
              >
                <Icon name="terminal" size={17} />
              </button>
            </>
          )}
        </span>
      </div>
      {mode === 'terminal' ? <TerminalHostSlot /> : <ClaudePane />}
    </div>
  )
}
