import type { IconName } from '../components/Icon'

/* Identité visuelle de chaque fournisseur : icône, couleur (variable CSS du
   thème) et page d'installation. Deux fournisseurs de même couleur doivent se
   distinguer par la forme de l'icône. */
export interface ProviderLook {
  icon: IconName
  color: string
  installUrl: string
}

const LOOKS: Record<string, ProviderLook> = {
  claude: {
    icon: 'sparkle',
    color: 'var(--claude)',
    installUrl: 'https://code.claude.com/docs/en/setup'
  },
  codex: {
    icon: 'hexagon',
    color: 'var(--text)',
    installUrl: 'https://developers.openai.com/codex/cli'
  },
  mistral: {
    icon: 'wind',
    color: 'var(--mistral)',
    installUrl: 'https://docs.mistral.ai/mistral-vibe/introduction'
  },
  /* Ollama : une maison, le modèle tourne sur l'ordinateur. */
  ollama: {
    icon: 'home',
    color: 'var(--accent)',
    installUrl: 'https://ollama.com/download'
  }
}

/** Apparence par défaut d'un fournisseur sans identité dédiée. */
const FALLBACK: ProviderLook = { icon: 'sparkle', color: 'var(--accent)', installUrl: '' }

export const lookOf = (id: string | null | undefined): ProviderLook =>
  (id && LOOKS[id]) || FALLBACK
