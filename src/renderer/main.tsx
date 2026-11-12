import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import '@fontsource/jetbrains-mono/400.css'
import '@fontsource/jetbrains-mono/800.css'
// Équivalents libres des polices macOS des paires titre/corps (voir
// stores/font.ts) : ils ne servent que là où la police Mac manque (Windows).
import '@fontsource/inter/400.css'
import '@fontsource/inter/400-italic.css'
import '@fontsource/inter/700.css'
import '@fontsource/inter/700-italic.css'
import '@fontsource/jost/700.css'
import '@fontsource/playfair-display/700.css'
import './styles/index.css'

// Sert aux réglages spécifiques à la plateforme (barre de titre Windows).
document.documentElement.dataset['platform'] = window.stancode.platform

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
