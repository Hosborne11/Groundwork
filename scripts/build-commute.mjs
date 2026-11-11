#!/usr/bin/env node
/**
 * Builds public/data/commute.json: drive time and distance from every opportunity hexagon to
 * Uptown Charlotte (Trade & Tryon), using the free OSRM routing service.
 *   npm run data:commute      (run after the opportunity data scripts)
 * These are typical free-flowing drive times, not rush-hour times.
 */
import fs from 'node:fs/promises'

const UPTOWN = [-80.8431, 35.2271] // Trade St & Tryon St
const OSRM = 'https://router.project-osrm.org/table/v1/driving'
const FILES = ['opportunity-meck', 'opportunity-cabarrus', 'opportunity-york', 'opportunity-union']
const BATCH = 80 // origins per request
const HEADERS = { 'User-Agent': 'Groundwork land data (monthly commute refresh)' }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const origins = []
for (const name of FILES) {
  try {
    const d = JSON.parse(await fs.readFile(`public/data/${name}.json`, 'utf8'))
    for (const h of d.hexes) {
      const ring = h.g, n = ring.length - 1
      const c = ring.slice(0, n).reduce((a, p) => [a[0] + p[0] / n, a[1] + p[1] / n], [0, 0])
      origins.push({ id: h.id, c: c.map((v) => +v.toFixed(5)) })
    }
  } catch { console.log(`  (no ${name}.json; skipped)`) }
}
console.log(`Drive times to Uptown for ${origins.length} hexagons…`)

const out = {}
let failed = 0
for (let i = 0; i < origins.length; i += BATCH) {
  const batch = origins.slice(i, i + BATCH)
  const coords = [UPTOWN, ...batch.map((o) => o.c)].map((p) => p.join(',')).join(';')
  const url = `${OSRM}/${coords}?sources=${batch.map((_, k) => k + 1).join(';')}&destinations=0&annotations=duration,distance`
  let ok = false
  for (let t = 0; t < 4 && !ok; t++) {
    try {
      const r = await fetch(url, { headers: HEADERS })
      const j = await r.json()
      if (j.code !== 'Ok') throw new Error(j.message || j.code)
      batch.forEach((o, k) => {
        const s = j.durations[k]?.[0], m = j.distances[k]?.[0]
        if (s != null) out[o.id] = [Math.round(s / 60), Math.round((m / 1609.34) * 10) / 10] // [minutes, miles]
      })
      ok = true
    } catch (e) {
      await sleep(2000 * (t + 1))
      if (t === 3) { failed += batch.length; console.log(`\n  batch at ${i} failed: ${e.message}`) }
    }
  }
  process.stdout.write(`\r  ${Math.min(i + BATCH, origins.length)}/${origins.length}`)
  await sleep(1100) // the public OSRM server asks for about one request per second
}
process.stdout.write('\n')
await fs.writeFile('public/data/commute.json', JSON.stringify({ generated: new Date().toISOString(), to: 'Uptown Charlotte (Trade & Tryon)', note: 'Typical free-flowing drive times, not rush hour.', times: out }))
console.log(`Wrote public/data/commute.json: ${Object.keys(out).length} hexagons${failed ? `, ${failed} without a time` : ''}`)
if (failed > origins.length / 2) process.exit(1)
