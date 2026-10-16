import * as turf from '@turf/turf'
import { getJSON } from './gis'

// York County, SC public layers (ArcGIS Online org "yorkcountysc_gisonline").
const Y = '/gis/yorksc'
const LAYERS = {
  countyZoning: `${Y}/${encodeURIComponent('York County Zoning (regions)')}/FeatureServer/0`,
  rockHillZoning: `${Y}/${encodeURIComponent('Rock Hill Zoning')}/FeatureServer/0`,
  jurisdiction: `${Y}/Jurisdiction_Boundaries/FeatureServer/0`,
  service: `${Y}/${encodeURIComponent('County Water and Sewer Service Area Boundary')}/FeatureServer/0`,
  landUse: `${Y}/${encodeURIComponent('Land Use Plan (2035)')}/FeatureServer/0`,
}

const atPoint = (parcel, outFields) => {
  const [lng, lat] = turf.pointOnFeature(parcel).geometry.coordinates
  return { geometry: `${lng},${lat}`, geometryType: 'esriGeometryPoint', inSR: 4326, spatialRel: 'esriSpatialRelIntersects', outFields, returnGeometry: false, f: 'json' }
}

// Zoning names come from each layer's own map legend, so nothing is guessed.
const legendCache = {}
function legend(url) {
  if (!legendCache[url]) {
    legendCache[url] = getJSON(url, { f: 'json' })
      .then((m) => Object.fromEntries((m.drawingInfo?.renderer?.uniqueValueInfos || []).map((i) => [String(i.value), i.label])))
      .catch(() => ({}))
  }
  return legendCache[url]
}
const tidyLabel = (label, code) => (label || '').replace(new RegExp(`\\s*\\(${code.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')}\\)\\s*$`), '').trim()

/** { town, incorporated, code, name, source, caseNumber, conditional } or null */
export async function yorkZoning(parcel) {
  const [jur, county, rh] = await Promise.all([
    getJSON(`${LAYERS.jurisdiction}/query`, atPoint(parcel, 'NAME,CITY_NAME,INC_MUNI')).catch(() => null),
    getJSON(`${LAYERS.countyZoning}/query`, atPoint(parcel, 'zone,ConditionalZoning,RezoningCaseNumber')).catch(() => null),
    getJSON(`${LAYERS.rockHillZoning}/query`, atPoint(parcel, 'ZONE')).catch(() => null),
  ])
  const j = jur?.features?.[0]?.attributes
  const incorporated = j?.INC_MUNI && j.INC_MUNI !== 'UNINCORPORATED'
  const town = incorporated ? titleCase(j.CITY_NAME || j.NAME) : 'Unincorporated York County'

  const rhCode = rh?.features?.[0]?.attributes?.ZONE
  if (rhCode) {
    const names = await legend(LAYERS.rockHillZoning)
    return { town: 'Rock Hill', incorporated: true, code: rhCode, name: tidyLabel(names[rhCode], rhCode) || null, source: 'City of Rock Hill' }
  }
  const c = county?.features?.[0]?.attributes
  if (c?.zone && !incorporated) {
    const names = await legend(LAYERS.countyZoning)
    return {
      town, incorporated: false, code: c.zone, name: names[c.zone] || null, source: 'York County',
      conditional: !!c.ConditionalZoning && c.ConditionalZoning !== 'N', caseNumber: c.RezoningCaseNumber || null,
    }
  }
  return { town, incorporated, code: null, name: null, source: null }
}

/** Water and sewer provider whose service area contains the parcel. */
export async function yorkServiceProvider(parcel) {
  const d = await getJSON(`${LAYERS.service}/query`, atPoint(parcel, 'PROVIDER,SVCPROVIDER'))
  const a = d.features?.[0]?.attributes
  return a ? { provider: a.SVCPROVIDER || titleCase(a.PROVIDER || '') } : null
}

/** 2035 Land Use Plan designation code (the layer publishes codes only). */
export async function yorkFutureLandUse(parcel) {
  const d = await getJSON(`${LAYERS.landUse}/query`, atPoint(parcel, 'FLU'))
  return d.features?.[0]?.attributes?.FLU || null
}

function titleCase(s) {
  return (s || '').toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase()).replace(/\bSvc\b\.?/, 'Service')
}
