import { create } from 'zustand'

export type Theme = 'dark' | 'light'

function detectTheme(): Theme {
  const stored = localStorage.getItem('stancode:theme')
  if (stored === 'dark' || stored === 'light') return stored
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'
}

interface ThemeState {
  theme: Theme
  setTheme: (theme: Theme) => void
}

export const useTheme = create<ThemeState>((set) => ({
  theme: detectTheme(),
  setTheme: (theme) => {
    localStorage.setItem('stancode:theme', theme)
    set({ theme })
  }
}))
