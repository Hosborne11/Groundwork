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
      ${s.approval.cases.length ? `<table class="cases"><thead><tr><th>Petition</th><th>Requested</th><th>Outcome</th><th>Distance</th><th>Size</th><th>From</th></tr></thead><tbody>
        ${s.approval.cases.map((c) => `<tr><td>${esc(c.petition)}</td><td>${esc(c.requested)}</td><td>${esc(c.status)}${c.decided ? ` ${esc(c.decided)}` : ''}</td><td>${c.miles != null ? `${num(c.miles, 1)} mi` : ''}</td><td>${c.lots ? `${num(c.lots)} lots` : c.acres ? `${num(c.acres, 1)} ac` : ''}</td><td>${esc(c.from || '')}</td></tr>`).join('')}
      </tbody></table>` : ''}` : ''
    draft = `
      <section class="draft">
        <h2>Neighborhood draft <span class="muted">${s.planName ? `“${esc(s.planName)}” · ` : ''}${title}</span></h2>
        ${s.scenario ? `<p class="banner">Rezoning scenario: ${esc(s.zoned)} → ${esc(s.scenario)}. Building this way needs a rezoning approved by City Council.</p>` : ''}
        <div class="total"><span class="big">${approx}${num(s.count)}</span> ${esc(s.unitWord)} <span class="pass ${s.pass ? 'yes' : 'no'}">${s.pass ? 'PASS' : 'CHECK'}</span></div>
        ${compare}
        <p class="lines">${lines.join(' · ')}</p>
        ${f.totalAc ? `<h3>Calculations</h3><table class="calc"><tbody>${[
          ['Total area', f.totalAc], ['Road area', f.roadAc], ['Pond', f.pondAc], ['Green space', f.greenAc],
        ].filter(([, ac]) => ac != null).map(([k, ac]) => `<tr><th>${k}</th><td class="pct">${num((ac / f.totalAc) * 100, 1)}%</td><td class="v">${num(ac, 2)} ac</td></tr>`).join('')}
          <tr><th>Open space</th><td class="pct"></td><td class="v">${num(f.openPct, 1)}%</td></tr>
          ${f.roadLenFt ? `<tr><th>Road length</th><td class="pct"></td><td class="v">${num(f.roadLenFt)} ft</td></tr>` : ''}
        </tbody></table>` : ''}
        <h3>UDO checks for ${esc(s.district)}</h3>
        <ul class="checks">${checks}</ul>
        ${approval}
      </section>`
  }

  const html = `<!doctype html><html><head><meta charset="utf-8"><title>Site report: ${esc(d.address || d.id)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link href="https://fonts.googleapis.com/css2?family=Barlow:wght@400;500;600;700&family=Barlow+Semi+Condensed:wght@500;600;700&display=swap" rel="stylesheet">
<style>
  @page { size: letter; margin: 0.45in; }
  * { box-sizing: border-box; }
  body { margin: 0; font: 12px/1.45 'Barlow', 'Helvetica Neue', Arial, sans-serif; color: #1b232a; background: #fff; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .page { max-width: 7.6in; margin: 0 auto; padding: 24px 0 40px; }
  .bar { display: flex; justify-content: space-between; align-items: baseline; border-bottom: 1px solid #1b232a; padding-bottom: 6px; margin-bottom: 14px; }
  .bar .brand { font-weight: 700; letter-spacing: .08em; text-transform: uppercase; font-size: 10.5px; }
  .bar .brand::before { content: ''; display: inline-block; width: 7px; height: 7px; margin-right: 7px; border-radius: 50%; background: #e8b04a; vertical-align: 1px; }
  .bar .date { color: #6b7782; font-size: 11px; }
  h1 { font-size: 22px; font-weight: 600; margin: 0; letter-spacing: -0.005em; }
  .sub { color: #56626c; margin: 2px 0 10px; }
  .acres { float: right; text-align: right; color: #56626c; font-size: 11px; text-transform: uppercase; letter-spacing: .06em; }
  .acres .n { font-family: 'Barlow Semi Condensed', 'Barlow', sans-serif; font-size: 34px; font-weight: 700; line-height: 1; color: #1b232a; letter-spacing: 0; text-transform: none; }
  .map { width: 100%; height: 3.1in; object-fit: cover; border: 1px solid #c9d0d6; display: block; margin: 8px 0 14px; }
  .nomap { height: 0.6in; display: grid; place-items: center; color: #8a949c; border: 1px dashed #c9d0d6; margin: 8px 0 14px; }
  .cols { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
  h2 { font-size: 14px; font-weight: 600; margin: 16px 0 6px; padding-bottom: 4px; border-bottom: 1px solid #1b232a; }
  h3 { font-size: 10.5px; font-weight: 600; margin: 12px 0 4px; color: #56626c; text-transform: uppercase; letter-spacing: .07em; }
  .muted { color: #7a858e; font-weight: 400; font-size: 11px; text-transform: none; letter-spacing: 0; }
  table { width: 100%; border-collapse: collapse; }
  th, td { text-align: left; vertical-align: top; padding: 4px 6px 4px 0; border-bottom: 1px solid #e3e7ea; }
  th { width: 38%; color: #56626c; font-weight: 500; }
  table.calc td.pct { width: 18%; text-align: right; color: #8a949c; font-variant-numeric: tabular-nums; }
  table.calc td.v { text-align: right; font-weight: 600; font-variant-numeric: tabular-nums; }
  .draft { break-inside: avoid-page; }
  .banner { border-left: 2px solid #e8b04a; padding: 4px 9px; margin: 4px 0 8px; color: #3a454e; background: #fbf6ec; }
  .total { font-size: 13px; color: #56626c; } .total .big { font-family: 'Barlow Semi Condensed', 'Barlow', sans-serif; font-size: 30px; font-weight: 700; color: #1b232a; }
  .pass { margin-left: 8px; font-size: 10px; font-weight: 700; letter-spacing: .06em; padding: 2px 8px; border-radius: 10px; vertical-align: 4px; }
  .pass.yes { background: #e4f3ea; color: #1f7a4a; } .pass.no { background: #fbe9e7; color: #b23a2e; }
  .compare { margin: 2px 0; } .delta { color: #1f7a4a; font-weight: 700; }
  .lines { color: #3a454e; margin: 4px 0; }
  ul.checks, ul.factors { list-style: none; padding: 0; margin: 0; }
  ul.checks li, ul.factors li { display: flex; gap: 8px; padding: 4px 0; border-bottom: 1px solid #e3e7ea; }
  ul.checks b, ul.factors b { flex: none; width: 15px; height: 15px; border-radius: 50%; display: grid; place-items: center; font-size: 9px; color: #fff; background: #8a949c; }
  .ck.ok b, .factors .good b { background: #2f8a5c; } .ck.lim b, .factors .warn b { background: #c98f1c; } .ck.bad b { background: #b23a2e; }
  table.cases { margin-top: 6px; font-size: 11px; } table.cases th { width: auto; font-weight: 600; color: #3a454e; }
  .foot { margin-top: 18px; padding-top: 6px; border-top: 1px solid #c9d0d6; color: #7a858e; font-size: 9.5px; }
  .print { position: fixed; bottom: 18px; right: 18px; box-shadow: 0 2px 10px rgba(0,0,0,.2); padding: 9px 16px; border: 0; border-radius: 6px; background: #3fa37e; color: #0f1a15; font: 600 13px 'Barlow', sans-serif; cursor: pointer; }
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
  <p class="foot">Generated by Groundwork from public GIS records (county parcels, city and town zoning and rezoning records, Census TIGER roads, FEMA floodplain, NRCS soils, utility maps). Drafts estimate yield and layout; they are not surveys or engineered plans, and grading, tree save, stream buffers, and stormwater design aren’t modeled.</p>
</div></body></html>`
  w.document.open()
  w.document.write(html)
  w.document.close()
}