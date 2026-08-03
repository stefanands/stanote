export type Locale = 'fr' | 'en'

let locale: Locale = 'en'

export function getLocale(): Locale {
  return locale
}

export function setLocale(l: Locale): void {
  locale = l
}
