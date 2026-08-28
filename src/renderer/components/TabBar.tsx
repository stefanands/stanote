import { useRef } from 'react'
import { useTabs, type PaneId, type Tab } from '../stores/tabs'
import { useT } from '../i18n'

/** Type de glisser propre aux onglets : permet aux zones de dépôt (colonne de
 *  droite) de reconnaître un onglet sans lire les données, interdit pendant le
 *  survol. La valeur transportée est le chemin du fichier. */
export const TAB_DRAG_TYPE = 'application/x-stanote-tab'

interface Props {
  /** 'titlebar' : logés dans la barre de titre (vue éditeur à gauche) ;
   *  'pane' : bandeau en haut du panneau éditeur (autres vues). */
  variant: 'titlebar' | 'pane'
  /** colonne dont on affiche les onglets */
  pane: PaneId
}

/** Onglets d'une colonne, réordonnançables au glisser (déplacement au
 *  franchissement du point médian de l'onglet survolé). */
export default function TabBar({ variant, pane }: Props): JSX.Element | null {
  const t = useT()
  const { tabs, activeByPane, focusedPane, activate, closeTab, reorderTab } = useTabs()
  const dragging = useRef<string | null>(null)

  const paneTabs = tabs.filter((tab) => tab.pane === pane)
  if (paneTabs.length === 0) return null
  const activePath = activeByPane[pane]

  const requestClose = (tab: Tab): void => {
    if (tab.untitled && tab.dirty && !confirm(t('discardUntitled'))) return
    void closeTab(tab.path)
  }

  return (
    <div
      className={[
        variant === 'titlebar' ? 'titlebar-tabs' : 'tabbar',
        focusedPane === pane ? 'focused' : ''
      ].join(' ')}
      // Accepte le dépôt partout dans la barre (y compris l'espace vide et
      // l'onglet déplacé lui-même), sinon le navigateur joue l'animation de
      // retour du fantôme vers la position d'origine.
      onDragOver={(e) => {
        if (!e.dataTransfer.types.includes(TAB_DRAG_TYPE)) return
        e.preventDefault()
        e.stopPropagation()
        e.dataTransfer.dropEffect = 'move'
      }}
      onDrop={(e) => {
        if (!e.dataTransfer.types.includes(TAB_DRAG_TYPE)) return
        e.preventDefault()
        e.stopPropagation()
        // Déposé sur la barre d'une autre colonne (hors d'un onglet) : rattache.
        const src = e.dataTransfer.getData(TAB_DRAG_TYPE)
        if (src) useTabs.getState().moveTabToPane(src, pane)
        dragging.current = null
      }}
    >
      {paneTabs.map((tab) => (
        <div
          key={tab.path}
          className={`tab ${tab.path === activePath ? 'active' : ''} ${tab.dirty ? 'dirty' : ''}`}
          title={tab.untitled ? tab.name : tab.path}
          draggable
          onDragStart={(e) => {
            dragging.current = tab.path
            e.dataTransfer.effectAllowed = 'move'
            e.dataTransfer.setData(TAB_DRAG_TYPE, tab.path)
          }}
          onDragEnd={() => {
            dragging.current = null
          }}
          onDragOver={(e) => {
            const src = dragging.current
            if (!src) return
            e.preventDefault()
            e.stopPropagation()
            e.dataTransfer.dropEffect = 'move'
            if (src === tab.path) return
            // On ne déplace qu'au franchissement du milieu de l'onglet survolé,
            // sinon deux onglets de largeurs différentes oscillent en boucle.
            const rect = e.currentTarget.getBoundingClientRect()
            reorderTab(src, tab.path, e.clientX < rect.left + rect.width / 2)
          }}
          onDrop={(e) => {
            e.preventDefault()
            e.stopPropagation()
          }}
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
