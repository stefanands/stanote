import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { marked } from 'marked'
import type { ProviderInfo, Tier } from '../../../shared/types'
import {
  effectiveTier,
  isInstalled,
  useActiveProvider,
  useActiveThread,
  useAssistant,
  type AssistantMessage
} from '../../stores/assistant'
import { useWorkspace } from '../../stores/workspace'
import { useI18n, useT } from '../../i18n'
import { lookOf } from '../../lib/providers'
import Icon, { type IconName } from '../Icon'

/** Fil regroupé : les traces d'outils consécutives forment un bloc repliable. */
type Block = { kind: 'msg'; msg: AssistantMessage } | { kind: 'tools'; items: AssistantMessage[] }

function toBlocks(messages: AssistantMessage[]): Block[] {
  const blocks: Block[] = []
  for (const m of messages) {
    const last = blocks[blocks.length - 1]
    if (m.role === 'tool') {
      if (last?.kind === 'tools') last.items.push(m)
      else blocks.push({ kind: 'tools', items: [m] })
    } else {
      blocks.push({ kind: 'msg', msg: m })
    }
  }
  return blocks
}

/* Noms d'outils des agents → verbes français ; l'anglais garde le nom d'origine. */
const TOOL_FR: Record<string, string> = {
  Read: 'Lit',
  Edit: 'Modifie',
  MultiEdit: 'Modifie',
  Write: 'Écrit',
  NotebookEdit: 'Modifie',
  Bash: 'Exécute',
  Grep: 'Cherche',
  Glob: 'Cherche',
  LS: 'Liste',
  WebFetch: 'Consulte le web',
  WebSearch: 'Recherche sur le web',
  Task: 'Délègue à un agent',
  TodoWrite: 'Organise ses étapes'
}

function toolLabel(name: string, locale: 'fr' | 'en'): string {
  return locale === 'fr' ? (TOOL_FR[name] ?? name) : name
}

const TIER_UI: { tier: Tier; icon: IconName; label: 'tierFast' | 'tierStandard' | 'tierReasoning' }[] =
  [
    { tier: 'fast', icon: 'key', label: 'tierFast' },
    { tier: 'standard', icon: 'robot', label: 'tierStandard' },
    { tier: 'reasoning', icon: 'brain', label: 'tierReasoning' }
  ]

/** Gamme en cours, au-dessus du bouton d'envoi ; un clic déplie les gammes
 *  que propose le fournisseur, le choix les replie. L'infobulle nomme le
 *  modèle ou l'effort correspondant. */
function TierButton({ provider }: { provider: ProviderInfo }): JSX.Element | null {
  const t = useT()
  const tier = useAssistant((s) => s.tier)
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const options = TIER_UI.filter((u) => provider.tiers[u.tier])
  const current = TIER_UI.find((u) => u.tier === effectiveTier(provider, tier)) ?? TIER_UI[1]

  // Repli au clic ailleurs ou sur Échap.
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent): void => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  if (options.length < 2) return null // rien à choisir
  const label = (u: (typeof TIER_UI)[number]): string => `${t(u.label)} — ${provider.tiers[u.tier]}`

  return (
    <div ref={ref}>
      <button
        className={open ? 'assistant-tier-btn open' : 'assistant-tier-btn'}
        title={label(current)}
        onClick={() => setOpen((v) => !v)}
      >
        <Icon name={current.icon} size={18} />
      </button>
      {open && (
        <div className="assistant-tier-menu">
          {options.map((u) => (
            <button
              key={u.tier}
              className={u.tier === current.tier ? 'assistant-tier-option active' : 'assistant-tier-option'}
              title={label(u)}
              onClick={() => {
                useAssistant.getState().setTier(u.tier)
                setOpen(false)
              }}
            >
              <Icon name={u.icon} size={18} />
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

/** Au-delà, le champ cesse de grandir et défile. */
const INPUT_MAX_HEIGHT = 168

/** Écran de choix : fournisseurs connus, leur état, et l'action utile pour
 *  chacun. Sans aucun fournisseur installé, il devient un écran d'accueil. */
function ProviderPicker({ providers }: { providers: ProviderInfo[] }): JSX.Element {
  const t = useT()
  const anyInstalled = providers.some(isInstalled)

  return (
    <div className="assistant-picker">
      <p className="assistant-picker-title">
        {anyInstalled ? t('assistantPickTitle') : t('assistantNoneTitle')}
      </p>
      {!anyInstalled && <p className="hint">{t('assistantNoneHint')}</p>}
      <ul className="assistant-picker-list">
        {providers.map((p) => {
          const look = lookOf(p.id)
          const status =
            p.status === 'missing'
              ? t('assistantMissing')
              : p.status === 'needs-login'
                ? t('assistantLoginShort')
                : p.status === 'needs-setup'
                  ? t('assistantSetupShort')
                  : t('assistantReady')
          return (
            <li key={p.id} className="assistant-picker-item">
              <span className="assistant-picker-icon" style={{ color: look.color }}>
                <Icon name={look.icon} size={15} />
              </span>
              <span className="assistant-picker-name">{p.name}</span>
              <span className="assistant-picker-status">
                {status} · {p.kind === 'agent' ? t('assistantKindAgent') : t('assistantKindChat')}
              </span>
              {isInstalled(p) ? (
                <button className="link-btn" onClick={() => useAssistant.getState().choose(p.id)}>
                  {t('assistantUse')}
                </button>
              ) : (
                look.installUrl && (
                  <button className="link-btn" onClick={() => window.open(look.installUrl, '_blank')}>
                    {t('assistantInstall')}
                  </button>
                )
              )}
            </li>
          )
        })}
      </ul>
      <button className="link-btn" onClick={() => void useAssistant.getState().refresh()}>
        {t('assistantRecheck')}
      </button>
    </div>
  )
}

/** Conversation avec l'assistant branché — occupe le panneau terminal en mode assistant. */
export default function AssistantPane(): JSX.Element {
  const t = useT()
  const locale = useI18n((s) => s.locale)
  const { providers, picking, send, cancel } = useAssistant()
  const { messages, busy, currentTool } = useActiveThread()
  const active = useActiveProvider()
  const rootName = useWorkspace((s) => s.rootName)
  const rootPath = useWorkspace((s) => s.rootPath)
  const [input, setInput] = useState('')
  const [openTools, setOpenTools] = useState<Set<number>>(new Set())
  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  // Détection à chaque ouverture du panneau, pas une seule fois par lancement :
  // l'utilisateur revient souvent ici juste après avoir installé ou connecté.
  useEffect(() => {
    void useAssistant.getState().refresh()
    inputRef.current?.focus()
  }, [])

  // Champ d'une ligne par défaut, qui grandit avec le texte jusqu'à
  // INPUT_MAX_HEIGHT, puis défile.
  useLayoutEffect(() => {
    const el = inputRef.current
    if (!el) return
    el.style.height = 'auto'
    const border = el.offsetHeight - el.clientHeight
    const wanted = el.scrollHeight + border
    el.style.height = `${Math.min(wanted, INPUT_MAX_HEIGHT)}px`
    el.style.overflowY = wanted > INPUT_MAX_HEIGHT ? 'auto' : 'hidden'
  }, [input, active?.id])

  // Suit le fil : colle en bas à chaque nouveau contenu.
  useEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [messages, currentTool])

  if (providers === null) {
    return (
      <div className="assistant-pane">
        <div className="pane-placeholder">
          <p className="hint">{t('assistantDetecting')}</p>
        </div>
      </div>
    )
  }

  if (!active || !isInstalled(active) || picking) {
    return (
      <div className="assistant-pane">
        <ProviderPicker providers={providers} />
      </div>
    )
  }

  const name = active.name
  const look = lookOf(active.id)
  const needsLogin = active.status === 'needs-login'
  const needsSetup = active.status === 'needs-setup'

  const submit = (): void => {
    const text = input.trim()
    if (!text || busy || !rootPath) return
    setInput('')
    send(text)
  }

  return (
    <div className="assistant-pane">
      {(needsLogin || needsSetup) && (
        <div className="assistant-login-notice">
          <Icon name={look.icon} size={12} />
          <span>
            {needsSetup
              ? active.setupHint
                ? t('assistantNeedsSetup', { name, cmd: active.setupHint })
                : t('assistantNeedsSetupPlain', { name })
              : active.loginCommand
                ? t('assistantNeedsLogin', { cmd: active.loginCommand })
                : t('assistantNeedsLoginPlain', { name })}
          </span>
          <button className="link-btn" onClick={() => void useAssistant.getState().refresh()}>
            {t('assistantRecheck')}
          </button>
        </div>
      )}
      <div className="assistant-scroll" ref={scrollRef}>
        {messages.length === 0 && !rootPath && (
          <div className="pane-placeholder">
            <p className="hint">{t('assistantOpenFolder')}</p>
          </div>
        )}
        {toBlocks(messages).map((block, i) => {
          if (block.kind === 'tools') {
            const open = openTools.has(i)
            return (
              <div key={i} className="assistant-tools">
                <button
                  className="assistant-tools-toggle"
                  title={t('assistantActions', { n: String(block.items.length) })}
                  onClick={() =>
                    setOpenTools((prev) => {
                      const next = new Set(prev)
                      if (next.has(i)) next.delete(i)
                      else next.add(i)
                      return next
                    })
                  }
                >
                  <span className={`assistant-tools-chevron ${open ? 'open' : ''}`}>
                    <Icon name="chevron" size={11} />
                  </span>
                  <Icon name={look.icon} size={11} />
                </button>
                {open && (
                  <div className="assistant-tools-list">
                    {block.items.map((item, j) => (
                      <div key={j} className="assistant-msg tool">
                        {toolLabel(item.text, locale)}
                        {item.detail ? ` · ${item.detail}` : ''}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )
          }
          const m = block.msg
          return m.role === 'user' ? (
            <div key={i} className="assistant-msg user">
              {m.text}
            </div>
          ) : (
            <div
              key={i}
              className="assistant-msg assistant"
              // markdown rendu localement ; les scripts sont bloqués par la CSP
              dangerouslySetInnerHTML={{ __html: marked.parse(m.text, { async: false }) as string }}
            />
          )
        })}
        {busy && (
          <div className="assistant-status">
            {currentTool
              ? t('assistantTool', {
                  name,
                  tool:
                    locale === 'fr'
                      ? toolLabel(currentTool, 'fr').replace(/^./, (c) => c.toLowerCase())
                      : currentTool
                })
              : t('assistantThinking', { name })}
          </div>
        )}
      </div>
      <div className="assistant-input-row">
        <textarea
          ref={inputRef}
          className="assistant-input"
          rows={1}
          disabled={!rootPath}
          placeholder={t('assistantPlaceholder')}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              submit()
            }
          }}
        />
        <div className="assistant-actions">
          <TierButton provider={active} />
          {busy ? (
            <button className="icon-btn assistant-send" title={t('assistantStop')} onClick={cancel}>
              <Icon name="stop" size={17} />
            </button>
          ) : (
            <button
              className="icon-btn assistant-send"
              title={t('assistantSend')}
              disabled={!rootPath}
              onClick={submit}
            >
              <Icon name="send" size={17} />
            </button>
          )}
        </div>
      </div>
      {rootPath && (
        <div className="assistant-footer">
          <Icon name="folder" size={12} />
          <span className="assistant-cwd" title={rootPath}>
            {rootName}
          </span>
          <span className="assistant-scope">
            —{' '}
            {active.kind === 'agent'
              ? t('assistantScopeAgent', { name })
              : t('assistantScopeChat', { name })}
          </span>
        </div>
      )}
    </div>
  )
}
