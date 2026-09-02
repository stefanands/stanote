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
  disposeTerminal,
  setTerminalTheme
} from './terminalHost'

/* L'hôte xterm survit au démontage (instances hors React) : changer d'onglet,
   passer en mode Claude ou changer de disposition ne perd ni le shell ni son
   historique. */
function TerminalHostSlot({ id }: { id: string }): JSX.Element {
  const t = useT()
  const rootPath = useWorkspace((s) => s.rootPath)
  const slotRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const host = getTerminalHost(id, useTheme.getState().theme, t('terminalExited'))
    slotRef.current!.appendChild(host)
    requestAnimationFrame(() => refreshTerminal(id))

    // Démarre le shell : dès qu'un dossier est connu, sinon après un court délai
    // (le temps que la restauration fixe le dossier courant). Idempotent.
    let timer: ReturnType<typeof setTimeout> | undefined
    if (rootPath) spawnTerminalIfNeeded(id)
    else timer = setTimeout(() => spawnTerminalIfNeeded(id), 800)

    return () => {
      if (timer) clearTimeout(timer)
      detachTerminalHost(id) // ne détruit pas le terminal : il survit au démontage
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  return <div className="terminal-slot" ref={slotRef} />
}

let counter = 0
const newTerminalId = (): string => `term-${++counter}`

export default function TerminalPane(): JSX.Element {
  const t = useT()
  const theme = useTheme((s) => s.theme)
  const [mode, setMode] = useState<'terminal' | 'claude'>('terminal')
  const claudeBusy = useClaude((s) => s.busy)
  /** onglets de terminal ; le premier est créé au montage */
  const [terminals, setTerminals] = useState<string[]>(() => [newTerminalId()])
  const [activeId, setActiveId] = useState<string>(() => terminals[0])

  useEffect(() => setTerminalTheme(theme), [theme])

  const addTerminal = (): void => {
    const id = newTerminalId()
    setTerminals((list) => [...list, id])
    setActiveId(id)
  }

  const closeTerminal = (id: string): void => {
    setTerminals((list) => {
      const rest = list.filter((t2) => t2 !== id)
      // Le panneau garde toujours un terminal : on en recrée un si c'était le
      // dernier, plutôt que d'afficher une zone vide.
      const next = rest.length > 0 ? rest : [newTerminalId()]
      setActiveId((current) => {
        if (current !== id) return current
        const i = list.indexOf(id)
        return next[Math.min(i, next.length - 1)]
      })
      return next
    })
    disposeTerminal(id)
  }

  const isTerminal = mode === 'terminal'
  const multiple = terminals.length > 1

  return (
    <div className={mode === 'claude' ? 'pane terminal-pane claude-mode' : 'pane terminal-pane'}>
      <div className="pane-header filetree-header">
        {isTerminal && multiple ? (
          // Plusieurs terminaux : le titre laisse place aux onglets.
          <span className="term-tabs">
            {terminals.map((id, i) => (
              <span
                key={id}
                className={id === activeId ? 'term-tab active' : 'term-tab'}
                onClick={() => setActiveId(id)}
              >
                <span className="term-tab-name">{`${t('terminal')} ${i + 1}`}</span>
                <button
                  className="term-tab-close"
                  title={t('terminalClose')}
                  onClick={(e) => {
                    e.stopPropagation()
                    closeTerminal(id)
                  }}
                >
                  <Icon name="close" size={11} />
                </button>
              </span>
            ))}
          </span>
        ) : (
          <span className={mode === 'claude' ? 'claude-title' : ''}>
            {isTerminal ? t('terminal') : t('claude')}
          </span>
        )}

        <span className="pane-header-actions">
          {isTerminal ? (
            <>
              <button className="icon-btn" title={t('terminalNew')} onClick={addTerminal}>
                <Icon name="new-tab" size={17} />
              </button>
              <button
                className="icon-btn"
                title={t('restartTerminal')}
                onClick={() => restartTerminal(activeId)}
              >
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
                <Icon name="new-tab" size={17} />
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
      {isTerminal ? <TerminalHostSlot id={activeId} /> : <ClaudePane />}
    </div>
  )
}
