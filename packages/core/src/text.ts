// Text helpers without any game-system knowledge.

/** Lower case, umlauts/accents folded, punctuation removed: "Waffenloser Kampfstil: Mercenario" ≈ "(Mercenario)". */
export function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '')
}
