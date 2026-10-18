/* Ce que l'éditeur WYSIWYG ne sait pas représenter, et qu'il abîmerait à
   l'enregistrement : le frontmatter YAML en tête de note, et la syntaxe
   Obsidian ([[wikilinks]], callouts > [!type]). */

/** Frontmatter découpé en morceaux, pour le recoller à l'identique. */
export interface Frontmatter {
  /** ligne d'ouverture « --- », fin de ligne comprise */
  open: string
  /** contenu YAML, dernière fin de ligne comprise (vide si aucun champ) */
  yaml: string
  /** ligne de fermeture « --- », sans sa fin de ligne */
  close: string
  /** fin de ligne et lignes vides qui séparent le frontmatter du texte */
  tail: string
}

const FRONTMATTER =
  /^(﻿?---[ \t]*\r?\n)((?:[\s\S]*?\r?\n)?)(---[ \t]*)(\r?\n(?:[ \t]*\r?\n)*|$)/

/** Sépare le frontmatter (s'il y en a un) du reste de la note. */
export function splitFrontmatter(text: string): { front: Frontmatter | null; body: string } {
  const m = FRONTMATTER.exec(text)
  if (!m) return { front: null, body: text }
  const front = { open: m[1], yaml: m[2], close: m[3], tail: m[4] }
  return { front, body: text.slice(m[0].length) }
}

export function frontmatterText(front: Frontmatter | null): string {
  return front ? front.open + front.yaml + front.close + front.tail : ''
}

/** Remplace le YAML (tel qu'édité, sans fin de ligne finale) en gardant
 *  délimiteurs, fins de ligne et séparation d'origine. */
export function withYaml(front: Frontmatter, yaml: string): Frontmatter {
  const eol = front.open.endsWith('\r\n') ? '\r\n' : '\n'
  return { ...front, yaml: yaml ? yaml.replace(/\r?\n/g, eol) + eol : '' }
}

/** Noms des champs du frontmatter, pour le résumé replié. */
export function frontmatterKeys(front: Frontmatter): string[] {
  return front.yaml
    .split(/\r?\n/)
    .map((line) => /^([^\s#:][^:]*?)\s*:/.exec(line)?.[1])
    .filter((key): key is string => Boolean(key))
}

/** Annule les échappements que l'éditeur ajoute à la syntaxe Obsidian :
 *  `\[\[cible]]` redevient `[[cible]]`, `> \[!type]` redevient `> [!type]`.
 *  Sans risque : ni l'une ni l'autre n'est une syntaxe de lien CommonMark. */
export function keepObsidianSyntax(markdown: string): string {
  return markdown
    .replace(/\\\[\\\[([^\]\n]*?)\]\]/g, '[[$1]]')
    .replace(/^((?:[ \t]*>[ \t]*)+)\\\[!/gm, '$1[!')
}
