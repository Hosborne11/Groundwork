import * as turf from '@turf/turf'
import { getJSON } from './gis'

const ZONING = '/gis/clt/PLN/Zoning/MapServer/0'
const ACTIVE = '/gis/clt/PLN/Rezonings/MapServer/0'
const HISTORY = '/gis/clt/PLN/RezoningHistory/MapServer/0'
const POLICY = '/gis/agolclt/Charlotte_Future_2040_Policy_Map/FeatureServer/0'

export const STATUS = { App: 'Approved', Wd: 'Withdrawn', Den: 'Denied', Pen: 'Pending', Def: 'Deferred' }
const HALF_MILE_FT = 2640

const atPoint = ([lng, lat], outFields) => ({
  geometry: `${lng},${lat}`,
  geometryType: 'esriGeometryPoint',
  inSR: 4326,
  spatialRel: 'esriSpatialRelIntersects',
  outFields,
  returnGeometry: false,
  f: 'json',
})

const polygonGeom = (parcel) => {
  const simple = turf.simplify(parcel, { tolerance: 0.00002 })
  const rings = simple.geometry.type === 'Polygon' ? simple.geometry.coordinates : simple.geometry.coordinates.flat()
  return JSON.stringify({ rings, spatialReference: { wkid: 4326 } })
}

export const centerOf = (parcel) => turf.pointOnFeature(parcel).geometry.coordinates

/** City of Charlotte zoning at the parcel (null outside Charlotte's zoning jurisdiction). */
export async function charlotteZoning(parcel) {
  const d = await getJSON(`${ZONING}/query`, atPoint(centerOf(parcel), 'ZoneDes,ZoneClass,ZonePetition,Overlay,Hyperlink,RezoneDate'))
  const a = d.features?.[0]?.attributes
  if (!a) return null
  return {
    code: (a.ZoneDes || '').trim(),
    className: (a.ZoneClass || '').trim(),
    petition: (a.ZonePetition || '').trim() || null,
    overlay: a.Overlay && a.Overlay !== 'none' ? a.Overlay : null,
    link: a.Hyperlink || null,
    rezonedOn: a.RezoneDate ? new Date(a.RezoneDate) : null,
  }
}

/** Charlotte Future 2040 Policy Map place type at the parcel. */
export async function placeType(parcel) {
  const d = await getJSON(`${POLICY}/query`, atPoint(centerOf(parcel), 'PlaceTypeFullTxt,PlaceTypeCde,CommunityPlanningArea'))
  const a = d.features?.[0]?.attributes
  return a ? { name: a.PlaceTypeFullTxt, code: a.PlaceTypeCde, area: a.CommunityPlanningArea } : null
}

/** Rezoning petitions currently in process that touch this parcel. */
export async function activePetitions(parcel) {
  const d = await getJSON(`${ACTIVE}/query`, {
    geometry: polygonGeom(parcel),
    geometryType: 'esriGeometryPolygon',
    inSR: 4326,
    spatialRel: 'esriSpatialRelIntersects',
    outFields: 'Petition,Petitioner,ExistZone,ReqZone,Status,Received,PetAcres',
    returnGeometry: false,
    f: 'json',
  })
  return (d.features || []).map(({ attributes: a }) => ({
    petition: a.Petition, petitioner: a.Petitioner, from: a.ExistZone, to: a.ReqZone,
    status: STATUS[a.Status] || 'In review', received: a.Received ? new Date(a.Received) : null, acres: a.PetAcres,
  }))
}

/** Decided petitions within half a mile since 2020. */
export async function nearbyHistory(parcel) {
  const d = await getJSON(`${HISTORY}/query`, {
    geometry: polygonGeom(parcel),
    geometryType: 'esriGeometryPolygon',
    inSR: 4326,
    spatialRel: 'esriSpatialRelIntersects',
    distance: HALF_MILE_FT,
    units: 'esriSRUnit_Foot',
    where: "Received >= DATE '2020-01-01'",
    outFields: 'Petition,ExistingZoning,RequestedZoning,Status,Received,Approved,PetAcres,Type',
    orderByFields: 'Received DESC',
    returnGeometry: false,
    resultRecordCount: 200,
    f: 'json',
  })
  // One petition can span several rows (one per original zoning area); keep one per petition.
  const seen = new Set()
  return (d.features || []).filter(({ attributes: a }) => (seen.has(a.Petition) ? false : seen.add(a.Petition))).map(({ attributes: a }) => ({
    petition: a.Petition, from: (a.ExistingZoning || '').trim(), to: (a.RequestedZoning || '').trim(),
    status: STATUS[a.Status] || 'Pending', received: a.Received ? new Date(a.Received) : null, acres: a.PetAcres,
    conditional: a.Type === 'CD' || a.Type === 'Conditional',
  }))
}

let baseRatesCache = null
/** Citywide outcomes since 2020 and approval timing since the UDO took effect. */
export function cityBaseRates() {
  if (baseRatesCache) return baseRatesCache
  baseRatesCache = (async () => {
    const [counts, timing] = await Promise.all([
      getJSON(`${HISTORY}/query`, {
        where: "Received >= DATE '2020-01-01'",
        groupByFieldsForStatistics: 'Status',
        outStatistics: JSON.stringify([{ statisticType: 'count', onStatisticField: 'Petition', outStatisticFieldName: 'n' }]),
        f: 'json',
      }),
      getJSON(`${HISTORY}/query`, {
        where: "Status = 'App' AND Received >= DATE '2023-06-01' AND Approved IS NOT NULL",
        outFields: 'Received,Approved',
        returnGeometry: false,
        f: 'json',
      }),
    ])
    const by = Object.fromEntries((counts.features || []).map((f) => [f.attributes.Status, f.attributes.n]))
    const decided = (by.App || 0) + (by.Wd || 0) + (by.Den || 0)
    const days = (timing.features || [])
      .map((f) => (f.attributes.Approved - f.attributes.Received) / 864e5)
      .filter((x) => x > 0)
      .sort((a, b) => a - b)
    const q = (p) => (days.length ? Math.round(days[Math.floor(days.length * p)]) : null)
    return {
      decided,
      approved: by.App || 0, withdrawn: by.Wd || 0, denied: by.Den || 0,
      pct: (k) => (decided ? Math.round(((by[k] || 0) / decided) * 100) : 0),
      days: { p25: q(0.25), median: q(0.5), p75: q(0.75), n: days.length },
    }
  })().catch((e) => { baseRatesCache = null; throw e })
  return baseRatesCache
}

/** Active petitions citywide, for the map layer. */
export async function activePetitionShapes() {
  return getJSON(`${ACTIVE}/query`, {
    where: '1=1',
    outFields: 'Petition,ReqZone',
    returnGeometry: true,
    outSR: 4326,
    geometryPrecision: 6,
    f: 'geojson',
  })
}
