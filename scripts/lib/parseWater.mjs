// Extracts Charlotte Water's water/sewer availability statements from the text of a
// Charlotte rezoning staff analysis. PDF text often splits words ("S outh", "loca ted"),
// so matching is deliberately tolerant.

const DEPT_BREAK = /•\s*(?!Charlotte\s*Water)(?:[A-Z][a-z]+|CMS|CATS|CDOT)[^•]{0,60}?:|OUTSTANDING\s+ISSUES|CITY\s+DEPARTMENT\s+COMMENTS|MECKLENBURG\s+COUNTY\s+COMMENTS|Charlotte-Mecklenburg\s+Schools/

/** Returns the Charlotte Water paragraph, or null. */
export function waterSection(rawText) {
  const text = rawText.replace(/\s+/g, ' ')
  const re = /Charlotte\s*Water\s*:?/gi
  let m
  while ((m = re.exec(text))) {
    const after = text.slice(m.index, m.index + 2000)
    if (!/(infrastructure|main|accessible|sewer|water system)/i.test(after.slice(0, 400))) continue
    const body = after.slice(m[0].length)
    const stop = body.search(DEPT_BREAK)
    return (stop > 0 ? body.slice(0, stop) : body).trim()
  }
  return null
}

const SEWER_WORDS = /sewer|gravity|force|wastewater|interceptor|outfall|lift/i
const WATER_WORDS = /water|distribution|transmission/i

function cleanPlace(s) {
  return s
    .replace(/\s*\(.*?\)\s*/g, ' ')
    .replace(/\b(on|in|at) the (north|south|east|west)\w*.*$/i, '')
    .replace(/\b(adjacent|abutting|near|which|that|approximately)\b.*$/i, '')
    .replace(/[,;:]+$/, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Parse a Charlotte Water paragraph into pipe statements.
 * Each: { kind: 'water'|'sewer', sizeIn, street?, parcelId?, raw }
 * Also returns { noWater, noSewer } when the memo says service is not available.
 */
export function parseWaterStatements(section) {
  if (!section) return { pipes: [], noWater: false, noSewer: false }
  const s = section
    .replace(/(\d)\s*-\s*inch/gi, '$1-inch')
    .replace(/(\d)\s+inch/gi, '$1-inch')
    .replace(/\s+/g, ' ')

  const squashed = s.replace(/\s+/g, '').toLowerCase()
  const noSewer = /doesnot(currently)?have(accessible)?(sanitary)?sewer|nosewer(system)?(infrastructure)?(is)?(currently)?available|sewerisnotavailable/.test(squashed)
  const noWater = /doesnot(currently)?have(accessible)?water|nowater(system)?(infrastructure)?(is)?(currently)?available|waterisnotavailable/.test(squashed)

  const pipes = []
  // "<size>-inch <description> main/line ... (located) (along|inside|in|on) <place>" up to the next pipe, period, or semicolon
  // The place is "tempered": it stops before the next pipe size or the next system sentence,
  // so run-on text without a period doesn't swallow the following statement.
  const re = /(\d{1,2}(?:\.\d)?)-inch\s+([a-z\s-]{0,60}?)\b(sewer\s+m\s?a\s?i\s?n|m\s?a\s?i\s?n|l\s?i\s?n\s?e|outfall|interceptor|sewer)s?\b\s*(?:l\s?o\s?c\s?a\s?t\s?e\s?d\s*)?(a\s?l\s?o\s?n\s?g|i\s?n\s?s\s?i\s?d\s?e|w\s?i\s?t\s?h\s?i\s?n|in|on|at|across)?\s*((?:(?!\d{1,2}-inch|sanitary\s+sewer|sewer\s+system|water\s+system|Charlotte\s+Water)[^.;])*?)(?=\s+and\s+(?:an?\s+)?(?:existing|\d)|\.(?:\s|$)|;|$|\s+(?:A\s?ccessible|sanitary|sewer\s+system|water\s+system|Charlotte\s+Water)|\s*\d{1,2}-inch)/gi
  let m
  while ((m = re.exec(s))) {
    const [raw, size, desc, , , placeRaw] = m
    // Decide water vs sewer: description first, then the nearest system keyword before the match.
    const before = s.slice(Math.max(0, m.index - 220), m.index)
    const lastSewer = before.search(/sewer[^.]*$/i)
    const lastWater = before.search(/water\s*system[^.]*$/i)
    let kind = SEWER_WORDS.test(desc) ? 'sewer' : WATER_WORDS.test(desc) ? 'water' : null
    if (!kind) kind = lastSewer > lastWater ? 'sewer' : lastWater >= 0 ? 'water' : null
    if (!kind) continue

    const place = cleanPlace(placeRaw || '')
    const parcel = place.match(/(?:parcel|premise|p\s?a\s?r\s?c\s?e\s?l)\s*#?\s*(\d{8})/i) || raw.match(/(?:parcel|premise)\s*#?\s*(\d{8})/i)
    const entry = { kind, sizeIn: Number(size), raw: raw.trim().slice(0, 240) }
    if (parcel) entry.parcelId = parcel[1]
    else if (place && /[a-z]{2}/i.test(place)) entry.street = place.replace(/^(?:the\s+)?(?:existing\s+)?/i, '').slice(0, 80)
    else continue
    pipes.push(entry)
  }
  return { pipes, noWater, noSewer }
}

// Street words that never identify a street on their own.
const GENERIC = new Set([
  'STREET', 'ROAD', 'DRIVE', 'AVENUE', 'BOULEVARD', 'BLVD', 'LANE', 'PARKWAY', 'PKWY', 'HIGHWAY', 'HWY', 'COURT',
  'CIRCLE', 'PLACE', 'TRAIL', 'TERRACE', 'NORTH', 'SOUTH', 'EAST', 'WEST', 'ALONG', 'INSIDE', 'PARCEL', 'FROM',
  'EXISTING', 'RIGHT', 'PORTION', 'BOUNDARY', 'REZONING', 'THE', 'AND', 'SITE', 'FRONTAGE', 'WITH',
])

/**
 * Best fragment to search Charlotte's STREETNAME field with. PDF splits mean we
 * may only have part of a word, so we take the longest meaningful token.
 */
export function streetSearchToken(street) {
  if (!street) return null
  const all = street.toUpperCase().replace(/[^A-Z0-9 ]/g, ' ').split(/\s+/).filter((t) => !GENERIC.has(t) && !/^(ST|RD|DR|AVE|LN|CT|CIR|PL|WAY|N|S|E|W)$/.test(t))
  const tokens = all.filter((t) => t.length >= 3 && /[A-Z]/.test(t))
  if (!tokens.length) {
    const numbered = street.match(/\b(\d+)(ST|ND|RD|TH)\b/i)
    return numbered ? numbered[0].toUpperCase() : null
  }
  return tokens.sort((a, b) => b.length - a.length)[0]
}
