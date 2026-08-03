import { useRef } from 'react'
import { useTabs, type Tab } from '../stores/tabs'
import { useT } from '../i18n'

interface Props {
  /** 'titlebar' : logés dans la barre de titre (vue éditeur à gauche) ;
   *  'pane' : bandeau en haut du panneau éditeur (autres vues). */
  variant: 'titlebar' | 'pane'
}

/** Onglets réordonnançables au glisser (déplacement au franchissement du
 *  point médian de l'onglet survolé). */
export default function TabBar({ variant }: Props): JSX.Element | null {
  const t = useT()
  const { tabs, activePath, activate, closeTab, reorderTab } = useTabs()
  const dragging = useRef<string | null>(null)

  if (tabs.length === 0) return null

  const requestClose = (tab: Tab): void => {
    if (tab.untitled && tab.dirty && !confirm(t('discardUntitled'))) return
    void closeTab(tab.path)
  }

  return (
    <div
      className={variant === 'titlebar' ? 'titlebar-tabs' : 'tabbar'}
      // Accepte le dépôt partout dans la barre (y compris l'espace vide et
      // l'onglet déplacé lui-même), sinon le navigateur joue l'animation de
      // retour du fantôme vers la position d'origine.
      onDragOver={(e) => {
        if (!dragging.current) return
        e.preventDefault()
        e.dataTransfer.dropEffect = 'move'
      }}
      onDrop={(e) => {
        if (dragging.current) e.preventDefault()
        dragging.current = null
      }}
    >
      {tabs.map((tab) => (
        <div
          key={tab.path}
          className={`tab ${tab.path === activePath ? 'active' : ''} ${tab.dirty ? 'dirty' : ''}`}
          title={tab.untitled ? tab.name : tab.path}
          draggable
          onDragStart={(e) => {
            dragging.current = tab.path
            e.dataTransfer.effectAllowed = 'move'
          }}
          onDragEnd={() => {
            dragging.current = null
          }}
          onDragOver={(e) => {
            const src = dragging.current
            if (!src) return
            e.preventDefault()
            e.dataTransfer.dropEffect = 'move'
            if (src === tab.path) return
            // On ne déplace qu'au franchissement du milieu de l'onglet survolé,
            // sinon deux onglets de largeurs différentes oscillent en boucle.
            const rect = e.currentTarget.getBoundingClientRect()
            reorderTab(src, tab.path, e.clientX < rect.left + rect.width / 2)
          }}
          onDrop={(e) => e.preventDefault()}
          onClick={() => activate(tab.path)}
          onAuxClick={(e) => {
            if (e.button === 1) requestClose(tab)
          }}
        >
          <span className="tab-name">{tab.name}</span>
          <span
            className="tab-indicator"
            onClick={(e) => {
              e.stopPropagation()
              requestClose(tab)
            }}
          >
            <span className="tab-dot">●</span>
            <span className="tab-x">×</span>
          </span>
        </div>
      ))}
    </div>
  )
}
