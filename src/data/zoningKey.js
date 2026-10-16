// Plain-language key to Charlotte zoning codes. District names follow the labels in the
// City of Charlotte zoning layer; suffix meanings are confirmed from city staff reports.
// Unknown codes are left unexplained rather than guessed.

export const CURRENT = [
  { group: 'Neighborhood 1 (houses)', items: [
    { code: 'N1-A', name: 'Neighborhood 1-A', desc: 'Single-family, duplex, and triplex lots. Largest lots: 10,000 sq ft minimum.' },
    { code: 'N1-B', name: 'Neighborhood 1-B', desc: 'Same housing types as N1-A on 8,000 sq ft lots.' },
    { code: 'N1-C', name: 'Neighborhood 1-C', desc: 'Same housing types on 6,000 sq ft lots.' },
    { code: 'N1-D', name: 'Neighborhood 1-D', desc: 'Same housing types on 3,500 sq ft lots.' },
    { code: 'N1-E', name: 'Neighborhood 1-E', desc: 'Same housing types on 3,000 sq ft lots.' },
    { code: 'N1-F', name: 'Neighborhood 1-F', desc: 'Small lots that also allow small apartment buildings. Usually along major roads.' },
  ] },
  { group: 'Neighborhood 2 (townhomes and apartments)', items: [
    { code: 'N2-A', name: 'Neighborhood 2-A', desc: 'Townhomes and apartments at the lowest Neighborhood 2 scale.' },
    { code: 'N2-B', name: 'Neighborhood 2-B', desc: 'Townhomes and apartments at a middle scale.' },
    { code: 'N2-C', name: 'Neighborhood 2-C', desc: 'Townhomes and apartments at the largest Neighborhood 2 scale.' },
  ] },
  { group: 'Centers and mixed use', items: [
    { code: 'NC', name: 'Neighborhood Center', desc: 'Small mixed-use centers with shops and services for nearby neighborhoods.' },
    { code: 'CAC-1', name: 'Community Activity Center 1', desc: 'Mid-size mixed-use centers: retail, offices, and housing.' },
    { code: 'CAC-2', name: 'Community Activity Center 2', desc: 'Larger, taller version of CAC-1.' },
    { code: 'RAC', name: 'Regional Activity Center', desc: 'Major mixed-use centers that draw from across the region, with tall buildings.' },
    { code: 'UC', name: 'Uptown Core', desc: 'Center-city Uptown district, the most intense in Charlotte.' },
    { code: 'IMU', name: 'Innovation Mixed-Use', desc: 'Older industrial areas reused for a mix of light industry, offices, and housing.' },
  ] },
  { group: 'Transit-oriented (near light rail)', items: [
    { code: 'TOD-UC', name: 'TOD Urban Center', desc: 'Most intense transit-oriented district, closest to major stations.' },
    { code: 'TOD-CC', name: 'TOD Community Center', desc: 'Mid-intensity transit-oriented development.' },
    { code: 'TOD-NC', name: 'TOD Neighborhood Center', desc: 'Lower-intensity transit-oriented development.' },
    { code: 'TOD-TR', name: 'TOD Transition', desc: 'Steps down from station areas to surrounding neighborhoods.' },
  ] },
  { group: 'Employment', items: [
    { code: 'CG', name: 'General Commercial', desc: 'Retail, restaurants, services, and car-oriented commercial uses.' },
    { code: 'CR', name: 'Regional Commercial', desc: 'Large shopping centers and big-box retail.' },
    { code: 'OFC', name: 'Office Flex Campus', desc: 'Office parks and flexible office or light-industrial campuses.' },
    { code: 'IC-1', name: 'Institutional Campus 1', desc: 'Colleges, hospitals, and similar campuses. 50 ft height (80 ft with bonus).' },
    { code: 'IC-2', name: 'Institutional Campus 2', desc: 'Larger, taller campuses. 120 ft height (250 ft with bonus).' },
    { code: 'ML-1', name: 'Manufacturing & Logistics 1', desc: 'Lighter industrial: warehouses, distribution, light manufacturing.' },
    { code: 'ML-2', name: 'Manufacturing & Logistics 2', desc: 'Heavier industrial and manufacturing uses.' },
  ] },
]

export const SUFFIXES = [
  { code: 'CD', name: 'Conditional', desc: 'Approved with a site plan and conditions. Development must follow that plan, not just the district rules.' },
  { code: 'EX', name: 'Exception', desc: 'A conditional rezoning that changes certain numeric standards, often height, in exchange for public benefits.' },
  { code: 'O', name: 'Optional', desc: 'Pre-2023 version of conditional flexibility (as in MUDD-O or UMUD-O): approved with optional provisions on a site plan.' },
  { code: 'SPA', name: 'Site Plan Amendment', desc: 'Changes the site plan of an existing conditional district without changing the district.' },
  { code: 'INNOV', name: 'Innovative', desc: 'Pre-2023 option allowing approved deviations from standard development rules.' },
  { code: 'HDO', name: 'Historic District Overlay', desc: 'Inside a local historic district. Exterior changes need Historic District Commission review.' },
  { code: 'ANDO', name: 'Airport Noise Disclosure Overlay', desc: 'Notice that the property is subject to airport overflights and noise. Also shown as AIR on older maps.' },
  { code: 'AIR', name: 'Airport Noise Overlay', desc: 'Older label for the airport noise overlay.' },
  { code: 'PED', name: 'Pedestrian Overlay', desc: 'Pre-2023 overlay with pedestrian-oriented design standards. Also written PED-O.' },
  { code: 'CCO', name: 'Cottage Court Overlay', desc: 'Allows small clustered homes around shared open space on top of the base district.' },
]

export const LEGACY = [
  { re: /^R-(\d+)$/, name: (m) => `Single-family (up to ${m[1]} homes per acre)`, desc: 'Pre-2023 single-family district. The number is the maximum homes per acre.' },
  { re: /^R-(\d+)MFH?$/, name: (m) => `Multi-family (up to ${m[1]} units per acre)`, desc: 'Pre-2023 apartment and townhome district. The number is the maximum units per acre.' },
  { re: /^R-\d*PUD$|^R-RPUD$|^R-PUD$/, name: () => 'Planned Unit Development', desc: 'Pre-2023 planned residential development with its own approved layout.' },
  { re: /^UR-([123C])$/, name: (m) => `Urban Residential${m[1] === 'C' ? ' Commercial' : ` ${m[1]}`}`, desc: 'Pre-2023 urban housing district, generally denser and closer to the street.' },
  { re: /^MUDD$/, name: () => 'Mixed Use Development District', desc: 'Pre-2023 mixed-use district for combined residential, retail, and office.' },
  { re: /^UMUD$/, name: () => 'Uptown Mixed Use District', desc: 'Pre-2023 Uptown mixed-use district.' },
  { re: /^MX-([123])$/, name: (m) => `Mixed Use Residential ${m[1]}`, desc: 'Pre-2023 mixed residential district (a mix of housing types).' },
  { re: /^B-1SCD$/, name: () => 'Business Shopping Center', desc: 'Pre-2023 shopping center district.' },
  { re: /^B-1$/, name: () => 'Neighborhood Business', desc: 'Pre-2023 business district for smaller-scale retail and services.' },
  { re: /^B-2$/, name: () => 'General Business', desc: 'Pre-2023 business district for larger and more auto-oriented commercial uses.' },
  { re: /^B-?D$/, name: () => 'Business Distribution', desc: 'Pre-2023 district for wholesale, distribution, and related business.' },
  { re: /^NS$/, name: () => 'Neighborhood Services', desc: 'Pre-2023 district for small neighborhood-serving shops and offices.' },
  { re: /^CC$/, name: () => 'Commercial Center', desc: 'Pre-2023 planned commercial center district.' },
  { re: /^O-(\d+)$/, name: (m) => `Office ${m[1]}`, desc: 'Pre-2023 office district.' },
  { re: /^OG$/, name: () => 'Office General', desc: 'Pre-2023 office district.' },
  { re: /^BP$/, name: () => 'Business Park', desc: 'Pre-2023 business park district for offices and light industry.' },
  { re: /^RE-([123])$/, name: (m) => `Research ${m[1]}`, desc: 'Pre-2023 research park district, such as around University Research Park.' },
  { re: /^INST$/, name: () => 'Institutional', desc: 'Pre-2023 district for schools, churches, hospitals, and similar uses.' },
  { re: /^I-1$/, name: () => 'Light Industrial', desc: 'Pre-2023 light industrial district.' },
  { re: /^I-2$/, name: () => 'General Industrial', desc: 'Pre-2023 heavy industrial district.' },
  { re: /^TOD-(M|MO|R|RO|E|EO)$/, name: (m) => `Transit-Oriented (pre-2023 ${({ M: 'mixed', MO: 'mixed, optional', R: 'residential', RO: 'residential, optional', E: 'employment', EO: 'employment, optional' })[m[1]]})`, desc: 'Older transit-oriented district near light rail, replaced by the current TOD districts.' },
  { re: /^MHP$|^R-MH$/, name: () => 'Manufactured Home', desc: 'Pre-2023 district for manufactured home parks.' },
]

const CURRENT_BY_CODE = Object.fromEntries(CURRENT.flatMap((g) => g.items).map((i) => [i.code, i]))
const SUFFIX_BY_CODE = Object.fromEntries(SUFFIXES.map((s) => [s.code, s]))

function lookupBase(base) {
  if (CURRENT_BY_CODE[base]) return { ...CURRENT_BY_CODE[base], era: 'current' }
  for (const l of LEGACY) {
    const m = base.match(l.re)
    if (m) return { code: base, name: l.name(m), desc: l.desc, era: 'legacy' }
  }
  return null
}

/**
 * Break a code like "N2-A(CD) ANDO", "MUDD-O SPA", "TOD-UC-EX" or "UR-2(CD)"
 * into explained parts. Unknown pieces come back with meaning null.
 */
export function explainZoning(code) {
  const raw = (code || '').toUpperCase().replace(/\b5[- ]?YEAR VESTED( RIGHTS)?\b/g, ' VESTED ')
  const tokens = raw.replace(/[()]/g, ' ').split(/\s+/).filter((t) => t && !['WITH', 'AND', 'RIGHTS'].includes(t))
  if (!tokens.length) return []
  const parts = []

  // The first token is the district, possibly with a glued suffix: MUDD-O, TOD-UC-EX, PED-O
  let base = tokens[0]
  const glued = []
  while (!lookupBase(base) && /-(O|EX|CD)$/.test(base)) {
    glued.unshift(base.match(/-(O|EX|CD)$/)[1])
    base = base.replace(/-(O|EX|CD)$/, '')
  }
  const b = lookupBase(base)
  parts.push(b ? { token: base, kind: 'district', ...b } : { token: base, kind: 'district', name: null })

  for (const t of [...glued, ...tokens.slice(1)]) {
    const key = t.replace(/-O$/, '') // PED-O, TS-O
    if (t === 'VESTED') { parts.push({ token: '5-year vested', kind: 'suffix', name: 'Vested rights', desc: 'The approved plan is protected from later rule changes for up to five years.' }); continue }
    const s = SUFFIX_BY_CODE[t] || SUFFIX_BY_CODE[key]
    parts.push(s ? { token: t, kind: 'suffix', ...s } : { token: t, kind: 'suffix', name: null })
  }
  return parts
}

/** One-line plain reading, e.g. "Neighborhood 2-A, Conditional, Airport Noise Disclosure Overlay". */
export function readZoning(code) {
  return explainZoning(code).map((p) => p.name || p.token).join(', ')
}
