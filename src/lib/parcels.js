import * as turf from '@turf/turf'
import { getJSON } from './gis'

// Mecklenburg (City of Charlotte GIS) and Cabarrus parcel sources.
const MECK = '/gis/clt/PLN/AllParcelData/MapServer/0'
const MECK_LINES = '/gis/clt/CountyData/Parcels/MapServer/0'
const CAB = '/gis/cabarrus/OpenData/Tax_Parcels/MapServer/1'

const MECK_FIELDS = [
  'parcelid', 'yearid', 'owner1firstname', 'owner1lastname', 'owner2firstname', 'owner2lastname',
  'billingaddress', 'billingaddress2', 'city', 'state', 'zipcode', 'location_address',
  'saleprice', 'saledate', 'deed_book', 'deed_page', 'totallandvalue', 'totalbuildingvalue',
  'totalmarketvalue', 'txt_vacantorimproved', 'landuse_description', 'neighborhood_description', 'legaldescription',
].join(',')

const SQ_FT_PER_ACRE = 43560
const clean = (s) => (s ?? '').toString().trim()
const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : null }
const acresOf = (f) => turf.area(f) / 4046.8564224

/* ---------- normalization: every parcel gets the same properties ---------- */

function normalizeMeck(f) {
  const a = f.properties
  const person = (first, last) => [clean(first), clean(last)].filter(Boolean).join(' ')
  const owners = [person(a.owner1firstname, a.owner1lastname), person(a.owner2firstname, a.owner2lastname)].filter(Boolean)
  const sale = a.saledate ? new Date(a.saledate) : null
  return {
    type: 'Feature',
    geometry: f.geometry,
    properties: {
      id: clean(a.parcelid),
      county: 'Mecklenburg',
      owner: owners.join(' & '),
      mail: [clean(a.billingaddress), clean(a.billingaddress2), [clean(a.city), clean(a.state), clean(a.zipcode)].filter(Boolean).join(' ')].filter(Boolean).join(', '),
      address: clean(a.location_address),
      acres: acresOf(f),
      assessed: num(a.totalmarketvalue),
      land: num(a.totallandvalue),
      building: num(a.totalbuildingvalue),
      salePrice: num(a.saleprice),
      saleYear: sale ? sale.getFullYear() : null,
      saleMonth: sale ? sale.getMonth() + 1 : null,
      deed: a.deed_book ? `Book ${clean(a.deed_book)}, page ${clean(a.deed_page)}` : null,
      deedBook: clean(a.deed_book), deedPage: clean(a.deed_page),
      legal: clean(a.legaldescription),
      neighborhood: clean(a.neighborhood_description),
      landUse: clean(a.landuse_description),
      vacant: clean(a.txt_vacantorimproved).toUpperCase().startsWith('VAC'),
    },
  }
}

function normalizeCab(f) {
  const a = f.properties
  return {
    type: 'Feature',
    geometry: f.geometry,
    properties: {
      id: clean(a.PIN14),
      county: 'Cabarrus',
      owner: [clean(a.AcctName1), clean(a.AcctName2)].filter(Boolean).join(' '),
      mail: [clean(a.MailAddr1), clean(a.MailAddr2), [clean(a.MailCity), clean(a.MailState), clean(a.MailZipCode)].filter(Boolean).join(' ')].filter(Boolean).join(', '),
      address: '',
      acres: num(a.CALCULATED_ACREAGE) || acresOf(f),
      assessed: num(a.AssessedValue),
      land: num(a.LandValue),
      building: num(a.BuildingValue),
      salePrice: num(a.SalePrice),
      saleYear: a.SaleYear || null,
      saleMonth: a.SaleMonth || null,
      deed: a.DeedBook ? `Book ${clean(a.DeedBook)}, page ${clean(a.DeedPage)}` : null,
      deedBook: clean(a.DeedBook), deedPage: clean(a.DeedPage),
      legal: clean(a.LegalDesc),
      neighborhood: clean(a.NBH_NAME),
      landUse: '',
      vacant: a.VacantOrImproved === 'V',
    },
  }
}

// AllParcelData can hold one row per tax year; keep the newest.
const newestMeck = (features) => [...features].sort((x, y) => (y.properties.yearid || 0) - (x.properties.yearid || 0))[0]

/* ---------- lookups ---------- */

const pointQuery = (lng, lat, outFields) => ({
  geometry: `${lng},${lat}`,
  geometryType: 'esriGeometryPoint',
  inSR: 4326,
  spatialRel: 'esriSpatialRelIntersects',
  outFields,
  returnGeometry: true,
  outSR: 4326,
  f: 'geojson',
})

export async function parcelAtPoint([lng, lat]) {
  const [meck, cab] = await Promise.allSettled([
    getJSON(`${MECK}/query`, pointQuery(lng, lat, MECK_FIELDS)),
    getJSON(`${CAB}/query`, pointQuery(lng, lat, '*')),
  ])
  if (meck.status === 'fulfilled' && meck.value.features?.length) return normalizeMeck(newestMeck(meck.value.features))
  if (cab.status === 'fulfilled' && cab.value.features?.length) return normalizeCab(cab.value.features[0])
  if (meck.status === 'rejected' && cab.status === 'rejected') throw new Error('Parcel services are not responding')
  return null
}

export async function searchParcels(term) {
  const t = term.trim().toUpperCase().replace(/'/g, "''")
  if (t.length < 3) return []
  const digits = t.replace(/[^0-9]/g, '')
  const looksLikePin = digits.length >= 6 && digits.length === t.replace(/[\s-]/g, '').length
  const looksLikeAddress = /^\d+\s+[A-Z]/.test(t)

  const meckWhere = looksLikePin
    ? `parcelid LIKE '${digits}%'`
    : looksLikeAddress
      ? `location_address LIKE '${t}%'`
      : `owner1lastname LIKE '%${t}%' OR owner2lastname LIKE '%${t}%'`
  const cabWhere = looksLikePin
    ? `PIN14 LIKE '${digits}%'`
    : `UPPER(AcctName1) LIKE '%${t}%' OR UPPER(AcctName2) LIKE '%${t}%'`

  const common = { returnGeometry: true, outSR: 4326, resultRecordCount: 15, f: 'geojson' }
  const [meck, cab] = await Promise.allSettled([
    getJSON(`${MECK}/query`, { ...common, resultRecordCount: 40, where: meckWhere, outFields: MECK_FIELDS }),
    looksLikeAddress ? Promise.resolve({ features: [] }) : getJSON(`${CAB}/query`, { ...common, where: cabWhere, outFields: '*' }),
  ])
  const out = []
  if (meck.status === 'fulfilled') {
    const byId = new Map()
    for (const f of meck.value.features || []) {
      const id = f.properties.parcelid
      if (!byId.has(id) || (f.properties.yearid || 0) > (byId.get(id).properties.yearid || 0)) byId.set(id, f)
    }
    for (const f of byId.values()) out.push(normalizeMeck(f))
  }
  if (cab.status === 'fulfilled') for (const f of cab.value.features || []) out.push(normalizeCab(f))
  if (meck.status === 'rejected' && cab.status === 'rejected') throw new Error('Parcel search unavailable')
  return out.sort((a, b) => b.properties.acres - a.properties.acres).slice(0, 25)
}

export async function parcelLinesInView([w, s, e, n]) {
  const q = {
    geometry: `${w},${s},${e},${n}`,
    geometryType: 'esriGeometryEnvelope',
    inSR: 4326,
    spatialRel: 'esriSpatialRelIntersects',
    returnGeometry: true,
    outSR: 4326,
    geometryPrecision: 6,
    f: 'geojson',
  }
  const [meck, cab] = await Promise.allSettled([
    getJSON(`${MECK_LINES}/query`, { ...q, outFields: 'PID', resultRecordCount: 3000 }),
    getJSON(`${CAB}/query`, { ...q, outFields: 'PIN14', resultRecordCount: 2000 }),
  ])
  const features = [
    ...(meck.status === 'fulfilled' ? meck.value.features || [] : []),
    ...(cab.status === 'fulfilled' ? cab.value.features || [] : []),
  ]
  return { type: 'FeatureCollection', features }
}

/**
 * Other parcels recorded on the same deed. When a deed covers several parcels, the county
 * repeats the full sale price on each, so the price is for the group, not one parcel.
 * Returns null when there's nothing to check or only this parcel is on the deed.
 */
export async function deedGroup(parcel) {
  const p = parcel.properties
  if (!p.deedBook || !p.deedPage || !(p.salePrice > 0)) return null
  const esc = (v) => v.replace(/'/g, "''")
  const isMeck = p.county === 'Mecklenburg'
  const d = await getJSON(`${isMeck ? MECK : CAB}/query`, {
    where: isMeck
      ? `deed_book = '${esc(p.deedBook)}' AND deed_page = '${esc(p.deedPage)}'`
      : `DeedBook = '${esc(p.deedBook)}' AND DeedPage = '${esc(p.deedPage)}'`,
    outFields: isMeck ? MECK_FIELDS : '*',
    returnGeometry: true,
    outSR: 4326,
    geometryPrecision: 6,
    resultRecordCount: 200,
    f: 'geojson',
  })
  const byId = new Map()
  for (const f of d.features || []) {
    const n = isMeck ? normalizeMeck(f) : normalizeCab(f)
    // Mecklenburg keeps one row per tax year; any row will do for grouping.
    if (!byId.has(n.properties.id)) byId.set(n.properties.id, n.properties)
  }
  const group = [...byId.values()]
  if (group.length < 2) return null
  return {
    count: group.length,
    capped: (d.features || []).length >= 200,
    totalAcres: group.reduce((t, x) => t + (x.acres || 0), 0),
    totalValue: group.reduce((t, x) => t + (x.assessed || 0), 0),
    others: group.filter((x) => x.id !== p.id).map((x) => ({ id: x.id, address: x.address, acres: x.acres })),
  }
}

export { SQ_FT_PER_ACRE }
