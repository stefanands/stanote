import { useEffect, useRef, useState } from 'react'
import { marked } from 'marked'
import { useClaude, type ClaudeMessage } from '../../stores/claude'
import { useI18n, useT } from '../../i18n'
import Icon from '../Icon'

/** Fil regroupé : les traces d'outils consécutives forment un bloc repliable. */
type Block = { kind: 'msg'; msg: ClaudeMessage } | { kind: 'tools'; items: ClaudeMessage[] }

function toBlocks(messages: ClaudeMessage[]): Block[] {
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

/* Noms d'outils du CLI → verbes français ; l'anglais garde le nom d'origine. */
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

/** Conversation « Demander à Claude » — occupe le panneau terminal en mode Claude. */
export default function ClaudePane(): JSX.Element {
  const t = useT()
  const locale = useI18n((s) => s.locale)
  const { messages, busy, currentTool, available, send, cancel } = useClaude()
  const [input, setInput] = useState('')
  const [openTools, setOpenTools] = useState<Set<number>>(new Set())
  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    void useClaude.getState().checkAvailable()
    inputRef.current?.focus()
  }, [])

  // Suit le fil : colle en bas à chaque nouveau contenu.
  useEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [messages, currentTool])

  const submit = (): void => {
    const text = input.trim()
    if (!text || busy) return
    setInput('')
    send(text)
  }

  if (available === false) {
    return (
      <div className="claude-pane">
        <div className="pane-placeholder">
          <p className="hint">{t('claudeMissing')}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="claude-pane">
      <div className="claude-scroll" ref={scrollRef}>
        {messages.length === 0 && (
          <div className="pane-placeholder">
            <p className="hint">{t('claudeEmpty')}</p>
          </div>
        )}
        {toBlocks(messages).map((block, i) => {
          if (block.kind === 'tools') {
            const open = openTools.has(i)
            return (
              <div key={i} className="claude-tools">
                <button
                  className="claude-tools-toggle"
                  title={t('claudeActions', { n: String(block.items.length) })}
                  onClick={() =>
                    setOpenTools((prev) => {
                      const next = new Set(prev)
                      if (next.has(i)) next.delete(i)
                      else next.add(i)
                      return next
                    })
                  }
                >
                  <span className={`claude-tools-chevron ${open ? 'open' : ''}`}>
                    <Icon name="chevron" size={11} />
                  </span>
                  <Icon name="sparkle" size={11} />
                </button>
                {open && (
                  <div className="claude-tools-list">
                    {block.items.map((item, j) => (
                      <div key={j} className="claude-msg tool">
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
            <div key={i} className="claude-msg user">
              {m.text}
            </div>
          ) : (
            <div
              key={i}
              className="claude-msg assistant"
              // markdown rendu localement ; les scripts sont bloqués par la CSP
              dangerouslySetInnerHTML={{ __html: marked.parse(m.text, { async: false }) as string }}
            />
          )
        })}
        {busy && (
          <div className="claude-status">
            {currentTool
              ? t('claudeTool', {
                  tool:
                    locale === 'fr'
                      ? toolLabel(currentTool, 'fr').replace(/^./, (c) => c.toLowerCase())
                      : currentTool
                })
              : t('claudeThinking')}
          </div>
        )}
      </div>
      <div className="claude-input-row">
        <textarea
          ref={inputRef}
          className="claude-input"
          rows={2}
          placeholder={t('claudePlaceholder')}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              submit()
            }
          }}
        />
        {busy ? (
          <button className="icon-btn claude-send" title={t('claudeStop')} onClick={cancel}>
            <Icon name="stop" size={15} />
          </button>
        ) : (
          <button className="icon-btn claude-send" title={t('claudeSend')} onClick={submit}>
            <Icon name="send" size={15} />
          </button>
        )}
      </div>
    </div>
  )
}
