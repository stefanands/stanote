/* Préparation des pages HTML de l'utilisateur servies à l'aperçu : relais des
   clics sur les liens, et encodage annoncé quand la page ne le précise pas. */

/* Relais de clics : l'aperçu tourne dans une iframe isolée, qui ne peut rien
   ouvrir dans l'application. Un clic sur un lien est donc transmis à Stanote,
   qui ouvre le fichier dans un onglet (ou la page web dans le navigateur). Un
   script de la page qui traite déjà le clic (preventDefault) garde la main. */
const LINK_RELAY =
  '<script>(function(){document.addEventListener("click",function(e){' +
  'if(e.defaultPrevented||e.button!==0)return;' +
  'var a=e.target&&e.target.closest&&e.target.closest("a[href]");if(!a)return;' +
  'var h=a.getAttribute("href");if(!h||h.charAt(0)==="#"||/^javascript:/i.test(h))return;' +
  'e.preventDefault();' +
  'parent.postMessage({stanote:"open-link",href:h,other:e.metaKey||e.ctrlKey},"*")' +
  '})})()</script>'

/** Ajoute le relais avant </head> (à défaut avant </body>, ou en fin de page).
 *  Surtout pas en tête : la déclaration d'encodage d'une page n'est cherchée
 *  que dans ses 1024 premiers octets, et ne doit pas en être repoussée.
 *  Travaille sur les octets : une page non UTF-8 reste intacte. */
export function withLinkRelay(data: Buffer): Buffer {
  const text = data.toString('latin1') // un caractère par octet : les index valent des positions
  const close = /<\/head\s*>/i.exec(text) ?? /<\/body\s*>/i.exec(text)
  const at = close ? close.index : data.length
  return Buffer.concat([data.subarray(0, at), Buffer.from(LINK_RELAY), data.subarray(at)])
}

/** Encodage à annoncer pour une page : « utf-8 » si elle ne déclare rien
 *  (ni BOM, ni balise meta) et que ses octets sont de l'UTF-8 valide. Sans
 *  annonce, le moteur supposerait l'ancien encodage Windows et afficherait
 *  « Ã© » à la place de « é ». Une page qui déclare son encodage, ou qui n'est
 *  pas en UTF-8, est laissée à la règle habituelle. */
export function htmlCharset(data: Buffer): 'utf-8' | null {
  if (data[0] === 0xef && data[1] === 0xbb && data[2] === 0xbf) return null // BOM UTF-8
  if (data[0] === 0xfe || data[0] === 0xff) return null // BOM UTF-16
  if (/<meta[^>]+charset/i.test(data.subarray(0, 1024).toString('latin1'))) return null
  try {
    new TextDecoder('utf-8', { fatal: true }).decode(data)
    return 'utf-8'
  } catch {
    return null
  }
}
