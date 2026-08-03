import type { StanCodeApi } from '../preload/preload'

declare global {
  interface Window {
    stancode: StanCodeApi
  }
}

export {}
