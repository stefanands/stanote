import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import '@fontsource/jetbrains-mono/400.css'
import '@fontsource/jetbrains-mono/800.css'
import './styles/index.css'

// Sert aux réglages spécifiques à la plateforme (barre de titre Windows).
document.documentElement.dataset['platform'] = window.stancode.platform

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
