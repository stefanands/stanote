import { useEffect, useRef, useState } from 'react'
import { useWorkspace } from '../../stores/workspace'
import { useTheme } from '../../stores/theme'
import { isInstalled, useActiveProvider, useAssistant } from '../../stores/assistant'
import { useT } from '../../i18n'
import { lookOf } from '../../lib/providers'
import Icon from '../Icon'
import AssistantPane from './AssistantPane'
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
   passer en mode assistant ou changer de disposition ne perd ni le shell ni son
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

type PanelMode = 'terminal' | 'assistant'

/* Le panneau s'ouvre sur l'assistant : le terminal seul intimide qui n'en a
   pas l'habitude. Le dernier mode choisi est retenu, si bien qu'un habitué du
   terminal le retrouve à chaque lancement. */
const MODE_KEY = 'stanote:panelMode'

function readMode(): PanelMode {
  try {
    return localStorage.getItem(MODE_KEY) === 'terminal' ? 'terminal' : 'assistant'
  } catch {
    return 'assistant'
  }
}

function saveMode(mode: PanelMode): void {
  try {
    localStorage.setItem(MODE_KEY, mode)
  } catch {
    // préférence perdue au prochain lancement, sans conséquence
  }
}

export default function TerminalPane(): JSX.Element {
  const t = useT()
  const theme = useTheme((s) => s.theme)
  const [mode, setModeState] = useState<PanelMode>(readMode)
  const setMode = (next: PanelMode): void => {
    saveMode(next)
    setModeState(next)
  }
  const assistantBusy = useAssistant((s) => s.busy)
  const provider = useActiveProvider()
  // Un fournisseur désinstallé ne prête plus son nom ni sa couleur au panneau.
  const active = provider && isInstalled(provider) ? provider : null
  const look = lookOf(active?.id)
  /** plusieurs fournisseurs installés : le titre permet d'en changer */
  const canSwitch = useAssistant((s) => (s.providers ?? []).filter(isInstalled).length > 1)
  /** onglets de terminal ; le premier est créé au montage */
  const [terminals, setTerminals] = useState<string[]>(() => [newTerminalId()])
  const [activeId, setActiveId] = useState<string>(() => terminals[0])

  useEffect(() => setTerminalTheme(theme), [theme])

  // En mode terminal, le panneau assistant n'est pas monté : on détecte quand
  // même le fournisseur, pour que le bouton porte d'emblée la bonne icône.
  useEffect(() => {
    if (mode === 'terminal' && useAssistant.getState().providers === null) {
      void useAssistant.getState().refresh()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

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
    <div
      className={isTerminal ? 'pane terminal-pane' : 'pane terminal-pane assistant-mode'}
      style={{ '--provider': look.color } as React.CSSProperties}
    >
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
          <span className={isTerminal ? '' : 'assistant-title'}>
            {isTerminal ? (
              t('terminal')
            ) : canSwitch ? (
              <button
                className="assistant-title-btn"
                title={t('assistantSwitch')}
                onClick={() => useAssistant.getState().setPicking(true)}
              >
                {active?.name ?? t('assistant')}
              </button>
            ) : (
              (active?.name ?? t('assistant'))
            )}
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
                className={
                  assistantBusy ? 'icon-btn assistant-btn assistant-pulse' : 'icon-btn assistant-btn'
                }
                title={t('askAssistant')}
                onClick={() => setMode('assistant')}
              >
                <Icon name={look.icon} size={17} />
              </button>
            </>
          ) : (
            <>
              {active && (
                <button
                  className="icon-btn"
                  title={t('assistantNew')}
                  onClick={() => useAssistant.getState().reset()}
                >
                  <Icon name="new-tab" size={17} />
                </button>
              )}
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
      {isTerminal ? <TerminalHostSlot id={activeId} /> : <AssistantPane />}
    </div>
  )
}
