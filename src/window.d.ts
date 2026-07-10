import type { StanCodeApi } from '../electron/preload'

declare global {
  interface Window {
    stancode: StanCodeApi
  }
}

export {}
