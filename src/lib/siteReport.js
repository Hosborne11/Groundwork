/*
 * One-page site report: a print-ready page in a new tab, saved as a PDF with the browser's
 * Print > Save as PDF. Prints on white (dark backgrounds print poorly).
 */

const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
const num = (n, d = 0) => Number(n).toLocaleString('en-US', { maximumFractionDigits: d, minimumFractionDigits: d })
const MARK = { true: '✓', limited: '!', false: '✗', good: '+', warn: '!', neutral: '·' }

/** Open the report tab right away (inside the click, so pop-up blockers allow it). */
export function openReportWindow() {
  const w = window.open('', '_blank')
  if (w) w.document.write('<!doctype html><title>Site report</title><body style="font:15px system-ui;padding:40px;color:#334">Preparing the site report…</body>')
  return w
}

/** Fill the report tab. `d` is gathered by the parcel panel. */
export function writeSiteReport(w, d) {
  if (!w || w.closed) return
  const s = d.summary
  const rows = (list) => list.filter(Boolean).map(([k, v]) => `<tr><th>${esc(k)}</th><td>${v}</td></tr>`).join('')

  const facts = rows([
    ['Owner', esc(d.owner || 'Not listed')],
    d.mail && ['Mailing address', esc(d.mail)],
    ['Parcel', `${esc(d.county)} ${esc(d.id)}${d.vacant ? ' · vacant' : ''}${d.landUse ? ` · ${esc(d.landUse.toLowerCase())}` : ''}`],
    ['Acres', num(d.acres, 2)],
    d.assessed && ['Assessed value', esc(d.assessed)],
    ['Last sale', esc(d.sale)],
  ])
  const site = rows([
    d.zoning && ['Zoning', `<strong>${esc(d.zoning)}</strong>`],
    d.place && ['2040 place type', esc(d.place)],
    ...d.checks.map((c) => [c.label, `${esc(c.value)}${c.detail ? ` <span class="muted">(${esc(c.detail)})</span>` : ''}`]),
  ])

  let draft = ''
  if (s) {
    const title = s.scenario ? `If rezoned to ${esc(s.scenario)}` : `As zoned (${esc(s.zoned)})`
    const approx = s.product === 'apartments' ? '≈' : ''
    const compare = s.scenario && s.baseline != null
      ? `<p class="compare">By right as ${esc(s.zoned)}: <strong>${num(s.baseline)} lots</strong> &nbsp;→&nbsp; as ${esc(s.scenario)}: <strong>${approx}${num(s.count)} ${esc(s.unitWord)}</strong> <span class="delta">(${s.count - s.baseline >= 0 ? '+' : ''}${num(s.count - s.baseline)})</span></p>`
      : ''
    const f = s.facts
    const lines = [
      s.housing && s.homes !== s.count ? `${num(s.homes)} homes (${esc(s.housing.toLowerCase())})` : null,
      f.buildings ? `${num(f.buildings)} buildings${f.stories ? `, ${f.stories} stories` : ''}${f.bldgMaxFt ? `, longest ${num(f.bldgMaxFt)} ft` : ''}` : null,
      f.spaces ? `${num(f.spaces)} surface parking spaces` : null,
      `${num(s.density, 1)} per acre`,
      f.roadLenFt ? `${num(f.roadLenFt)} ft of new street` : null,
      `${num(f.openPct, 1)}% open space${f.pondAc ? ` (pond ${num(f.pondAc, 2)} ac)` : ''}`,
      f.mix?.length ? `Lot sizes: ${f.mix.map(esc).join('; ')}` : null,
    ].filter(Boolean)
    const checks = s.checks.map((c) => `<li class="ck ${c.ok === true ? 'ok' : c.ok === 'limited' ? 'lim' : 'bad'}"><b>${MARK[String(c.ok)] || '·'}</b><div><strong>${esc(c.label)}</strong> ${esc(c.detail)}</div></li>`).join('')
    const approval = s.approval ? `
      <h3>Approval context <span class="muted">factors staff and Council weigh, not a prediction</span></h3>
      <ul class="factors">${s.approval.factors.map((x) => `<li class="${x.tone}"><b>${MARK[x.tone]}</b><div><strong>${esc(x.title)}.</strong> ${esc(x.text)}</div></li>`).join('')}</ul>
      ${s.approval.cases.length ? `<table class="cases"><thead><tr><th>Petition</th><th>Requested</th><th>Outcome</th><th>Distance</th><th>Acres</th><th>From</th></tr></thead><tbody>
        ${s.approval.cases.map((c) => `<tr><td>${esc(c.petition)}</td><td>${esc(c.requested)}</td><td>${esc(c.status)}${c.decided ? ` ${esc(c.decided)}` : ''}</td><td>${c.miles != null ? `${num(c.miles, 1)} mi` : ''}</td><td>${c.acres ? num(c.acres, 1) : ''}</td><td>${esc(c.from || '')}</td></tr>`).join('')}
      </tbody></table>` : ''}` : ''
    draft = `
      <section class="draft">
        <h2>Neighborhood draft <span class="muted">${s.planName ? `“${esc(s.planName)}” · ` : ''}${title}</span></h2>
        ${s.scenario ? `<p class="banner">Rezoning scenario: ${esc(s.zoned)} → ${esc(s.scenario)}. Building this way needs a rezoning approved by City Council.</p>` : ''}
        <div class="total"><span class="big">${approx}${num(s.count)}</span> ${esc(s.unitWord)} <span class="pass ${s.pass ? 'yes' : 'no'}">${s.pass ? 'PASS' : 'CHECK'}</span></div>
        ${compare}
        <p class="lines">${lines.join(' · ')}</p>
        <h3>UDO checks for ${esc(s.district)}</h3>
        <ul class="checks">${checks}</ul>
        ${approval}
      </section>`
  }

  const html = `<!doctype html><html><head><meta charset="utf-8"><title>Site report: ${esc(d.address || d.id)}</title>
<style>
  @page { size: letter; margin: 0.45in; }
  * { box-sizing: border-box; }
  body { margin: 0; font: 12px/1.45 system-ui, -apple-system, "Segoe UI", sans-serif; color: #1C2A33; background: #fff; }
  .page { max-width: 7.6in; margin: 0 auto; padding: 24px 0 40px; }
  .bar { display: flex; justify-content: space-between; align-items: baseline; border-bottom: 3px solid #D6157A; padding-bottom: 6px; margin-bottom: 12px; }
  .bar .brand { font-weight: 800; letter-spacing: .02em; }
  .bar .date { color: #667; font-size: 11px; }
  h1 { font-size: 22px; margin: 0; }
  .sub { color: #556; margin: 2px 0 10px; }
  .acres { float: right; text-align: right; }
  .acres .n { font-size: 30px; font-weight: 800; line-height: 1; }
  .map { width: 100%; height: 3.1in; object-fit: cover; border: 1px solid #ccd; border-radius: 4px; display: block; margin: 8px 0 12px; }
  .nomap { height: 0.6in; display: grid; place-items: center; color: #889; border: 1px dashed #ccd; border-radius: 4px; margin: 8px 0 12px; }
  .cols { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
  h2 { font-size: 15px; margin: 14px 0 6px; }
  h3 { font-size: 13px; margin: 12px 0 4px; }
  .muted { color: #778; font-weight: 400; font-size: 11px; }
  table { width: 100%; border-collapse: collapse; }
  th, td { text-align: left; vertical-align: top; padding: 3px 6px 3px 0; border-bottom: 1px solid #eef; }
  th { width: 38%; color: #556; font-weight: 600; }
  .draft { break-inside: avoid-page; }
  .banner { background: #F3EEFF; border-left: 4px solid #7C3AED; padding: 5px 8px; margin: 4px 0 8px; color: #4C1D95; }
  .total { font-size: 14px; } .total .big { font-size: 26px; font-weight: 800; }
  .pass { margin-left: 8px; font-size: 11px; font-weight: 800; padding: 2px 8px; border-radius: 10px; }
  .pass.yes { background: #E3F4E8; color: #1E7B3C; } .pass.no { background: #FDE8E8; color: #B42318; }
  .compare { margin: 2px 0; } .delta { color: #1E7B3C; font-weight: 700; }
  .lines { color: #445; margin: 4px 0; }
  ul.checks, ul.factors { list-style: none; padding: 0; margin: 0; }
  ul.checks li, ul.factors li { display: flex; gap: 8px; padding: 3px 0; border-bottom: 1px solid #eef; }
  ul.checks b, ul.factors b { flex: none; width: 16px; height: 16px; border-radius: 50%; display: grid; place-items: center; font-size: 10px; color: #fff; background: #889; }
  .ck.ok b, .factors .good b { background: #2F855A; } .ck.lim b, .factors .warn b { background: #D99A00; } .ck.bad b { background: #B42318; }
  table.cases { margin-top: 6px; font-size: 11px; } table.cases th { width: auto; }
  .foot { margin-top: 16px; padding-top: 6px; border-top: 1px solid #dde; color: #778; font-size: 10px; }
  .print { position: fixed; bottom: 18px; right: 18px; box-shadow: 0 2px 8px rgba(0,0,0,.25); padding: 8px 14px; border: 0; border-radius: 6px; background: #D6157A; color: #fff; font-weight: 700; cursor: pointer; }
  @media print { .print { display: none; } .page { padding: 0; } }
</style></head><body>
<button class="print" onclick="window.print()">Print / Save as PDF</button>
<div class="page">
  <div class="bar"><span class="brand">Groundwork · Site report</span><span class="date">${esc(new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' }))}</span></div>
  <div class="acres"><div class="n">${num(d.acres, d.acres < 10 ? 2 : 1)}</div>acres</div>
  <h1>${esc(d.address || `${d.county} parcel ${d.id}`)}</h1>
  <p class="sub">${esc(d.owner || '')}</p>
  ${d.snapshot ? `<img class="map" src="${d.snapshot}" alt="Map of the parcel${s ? ' with the draft' : ''}">` : '<div class="nomap">Map image unavailable</div>'}
  <div class="cols">
    <div><h2>Property</h2><table>${facts}</table></div>
    <div><h2>Site</h2><table>${site}</table></div>
  </div>
  ${draft}
  <p class="foot">Generated by Groundwork from public GIS records (county parcels, City of Charlotte zoning and rezoning history, FEMA floodplain, NRCS soils, utility maps). Drafts estimate yield and layout; they are not surveys or engineered plans, and grading, tree save, stream buffers, and stormwater design aren’t modeled.</p>
</div></body></html>`
  w.document.open()
  w.document.write(html)
  w.document.close()
}