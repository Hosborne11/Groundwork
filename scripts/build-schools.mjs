#!/usr/bin/env node
/**
 * Builds public/data/schools.json: public and charter schools (plus York's private schools)
 * for Mecklenburg, Cabarrus, Union, and York counties.
 *   npm run data:schools
 * North Carolina schools come from NC OneMap (NC Department of Public Instruction), which flags
 * elementary, middle, and high. York's come from York County GIS, where the level is read from
 * the school's name.
 */
import fs from 'node:fs/promises'

const NC = 'https://services.nconemap.gov/secure/rest/services/NC1Map_Education/FeatureServer/3'
const YORK = 'https://services1.arcgis.com/2AGLxyiJoNiVHKwq/arcgis/rest/services/Schools/FeatureServer/0'
const HEADERS = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36' }
const qs = (o) => new URLSearchParams(o).toString()
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const yes = (v) => /^y/i.test((v || '').trim())

async function get(url, params, tries = 4) {
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(`${url}/query?${qs(params)}`, { headers: HEADERS })
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      const txt = await r.text()
      if (!txt) throw new Error('empty response from the server')
      const j = JSON.parse(txt)
      if (j.error) throw new Error(j.error.message || JSON.stringify(j.error.details))
      return j
    } catch (e) {
      if (i === tries - 1) throw new Error(`${url}: ${e.message}`)
      await sleep(1500 * (i + 1))
    }
  }
}

/** Level from flags (NC) or from the name (York). */
function levelFrom(flags, name) {
  if (flags) {
    const lv = [flags.elem && 'Elementary', flags.middle && 'Middle', flags.high && 'High'].filter(Boolean)
    if (lv.length) return lv.join(' & ')
  }
  if (/elementary|primary|\belem\b/i.test(name)) return 'Elementary'
  if (/middle/i.test(name)) return 'Middle'
  if (/high\b/i.test(name)) return 'High'
  return 'Other'
}

const schools = []
console.log('North Carolina public schools (NC OneMap)…')
const nc = await get(NC, { where: "county IN ('Mecklenburg','Cabarrus','Union')", outFields: 'school_nam,county,phys_addr,phys_city,sch_ctype,bgn_grade,end_grade,elem,middle,high,url_addres', returnGeometry: true, outSR: 4326, f: 'json' })
for (const f of nc.features || []) {
  const a = f.attributes
  if (!f.geometry) continue
  schools.push({
    name: (a.school_nam || '').trim(), county: a.county,
    level: levelFrom({ elem: yes(a.elem), middle: yes(a.middle), high: yes(a.high) }, a.school_nam || ''),
    type: /charter/i.test(a.sch_ctype || '') ? 'Charter' : 'Public',
    grades: [a.bgn_grade, a.end_grade].map((g) => (g || '').trim()).filter(Boolean).join('–') || null,
    address: [a.phys_addr, a.phys_city].filter(Boolean).join(', ') || null,
    lng: +f.geometry.x.toFixed(5), lat: +f.geometry.y.toFixed(5),
  })
}
console.log(`  ${schools.length} schools`)

console.log('York County schools (York County GIS)…')
const yk = await get(YORK, { where: '1=1', outFields: 'SCHOOL,STATUS,SCHDIST,Address_Street,Address_CityStateZIp,PopulationStudent', returnGeometry: true, outSR: 4326, f: 'json' })
let york = 0
for (const f of yk.features || []) {
  const a = f.attributes
  if (!f.geometry) continue
  const name = (a.SCHOOL || '').trim()
  schools.push({
    name, county: 'York',
    level: levelFrom(null, name),
    type: /private/i.test(a.STATUS || a.SCHDIST || '') ? 'Private' : /charter/i.test(name) ? 'Charter' : 'Public',
    grades: null,
    address: [a.Address_Street, a.Address_CityStateZIp].filter((x) => x && x.trim()).join(', ') || null,
    lng: +f.geometry.x.toFixed(5), lat: +f.geometry.y.toFixed(5),
  })
  york++
}
console.log(`  ${york} schools`)

await fs.mkdir('public/data', { recursive: true })
await fs.writeFile('public/data/schools.json', JSON.stringify({ generated: new Date().toISOString(), schools }))
const byLevel = schools.reduce((o, s) => ((o[s.level] = (o[s.level] || 0) + 1), o), {})
console.log(`Wrote public/data/schools.json: ${schools.length} schools`, byLevel)
