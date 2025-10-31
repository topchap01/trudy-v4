// apps/backend/src/routes/exports.ts
import { Router } from 'express'
import { prisma } from '../db/prisma.js'
import { mkdirSync, writeFileSync, existsSync } from 'fs'
import { join } from 'path'
import puppeteer from 'puppeteer'
import { buildCampaignContext, renderBriefSnapshot } from '../lib/context.js'
import { PROMOTRACK_COMPACT } from '../lib/promotrack.js' // PromoTrack lens (read-only)

const router = Router()

router.get('/campaigns/:id/exports', async (req, res, next) => {
  try {
    const list = await prisma.exportArtifact.findMany({
      where: { campaignId: req.params.id },
      orderBy: { createdAt: 'desc' },
    })
    res.json({ artifacts: list })
  } catch (e) { next(e) }
})

type ExportOptions = {
  format?: 'PDF' | 'HTML' | 'BOTH'
  sections?: {
    brief?: boolean
    framing?: boolean
    evaluation?: boolean
    ideas?: boolean
    synthesis?: boolean
    extras?: string[]
  }
  theme?: { accent?: string; logoUrl?: string; titleOverride?: string }
}

router.post('/campaigns/:id/exports', async (req, res, next) => {
  try {
    const body: ExportOptions = (req.body || {}) as any
    const format = (body.format || 'BOTH') as 'PDF' | 'HTML' | 'BOTH'
    const sections = body.sections || {}
    const theme = body.theme || {}

    const camp = await prisma.campaign.findUnique({
      where: { id: req.params.id },
      include: {
        brief: true,
        outputs: { orderBy: { createdAt: 'asc' } }, // oldest→newest so "last" is latest
      },
    })
    if (!camp) return res.status(404).json({ error: 'Campaign not found' })

    const ctx = buildCampaignContext(camp)

    const getLatestByType = (t: string) => {
      const xs = (camp.outputs || []).filter(o => o.type === t)
      return xs.length ? xs[xs.length - 1] : null
    }

    const framingOut = getLatestByType('framingNarrative')
    const evalOut    = getLatestByType('evaluationNarrative')
    const ideasOut   = getLatestByType('ideaRoutes')
    const synOut     = getLatestByType('synthesisNarrative')

    // Normalize + clean
    const framing    = sanitizeFraming(normalizeText(framingOut?.content || ''))
    const evaluation = normalizeText(evalOut?.content || '')
    const ideasRaw   = normalizeText(ideasOut?.content || '')
    const synthesis  = normalizeText(synOut?.content || '')

    // meta may be stored in { meta } or params.meta or entire params
    const evaluationMeta: any =
      safeJson((evalOut as any)?.meta) ||
      safeJson((evalOut as any)?.params?.meta) ||
      safeJson((evalOut as any)?.params)

    // extras
    const allExtras = (camp.outputs || []).filter((o) =>
      ['hooks','retailerDeck','prizeLadder','mechanics','compliance','riskProfile','custom'].includes(o.type)
    )

    // Parse idea routes for champion/route lookups
    const ideasParsed = parseIdeas(ideasRaw)

    // Try to derive a champion from Synthesis; then fetch its hook/mechanic from parsed ideas
    const champion = deriveChampionFromSynthesis(synthesis, ideasParsed)

    // Hooks for Recommended Build (stable, no quote-scrape fallbacks)
    const hooksTop = pickHooksStrict({
      brand: camp.clientName || '',
      champion,
      evaluationProse: evaluation,
      synthesisProse: synthesis,
      extras: allExtras,
    })

    // Scoreboard: prefer meta, else fallback (always renders)
    const scoreboard = evaluationMeta?.scoreboard || buildScoreboardFallback(ctx, hooksTop)

    // include flags
    const includeBrief      = sections.brief !== false
    const includeFraming    = sections.framing !== false
    const includeEvaluation = sections.evaluation !== false
    const includeIdeas      = sections.ideas !== false
    const includeSynthesis  = sections.synthesis !== false

    // extras filter
    const includeTypes = sections.extras && sections.extras.length
      ? new Set(sections.extras)
      : new Set(['hooks','retailerDeck','prizeLadder','mechanics','compliance','riskProfile','custom'])
    const extras = allExtras.filter((o) => includeTypes.has(o.type))

    // header/meta
    const briefSnapshot = includeBrief ? renderBriefSnapshot(ctx) : ''
    const title = theme.titleOverride || `${camp.clientName ?? ''} — ${camp.title}`
    const accent = theme.accent || '#0ea5e9'
    const metaLine = [
      `Market: ${camp.market ?? 'AU'}`,
      `Category: ${camp.category ?? 'n/a'}`,
      `Timing: ${ctx.timingWindow || 'n/a'}`,
      `Mode: ${camp.mode}`,
      `Status: ${camp.status}`,
    ].join(' • ')

    const logo = theme.logoUrl
      ? `<img src="${escapeHtml(theme.logoUrl)}" alt="logo" style="height:28px;object-fit:contain" />`
      : ''

    // ----- section builders -----
    const sectionsHTML: string[] = []

    if (includeBrief) {
      sectionsHTML.push(`
        <section class="card">
          <h2>Structured Brief Snapshot</h2>
          ${renderBriefHTML(briefSnapshot)}
        </section>
      `)
    }

    if (includeFraming) {
      sectionsHTML.push(`
        <section class="card">
          <h2>Framing</h2>
          <div class="content">${mdBasic(framing || '_No framing narrative._')}</div>
        </section>
      `)
    }

    if (includeEvaluation) {
      const scoreboardHTML = renderScoreboardHTML(scoreboard)
      const mechanicLine = champion?.mechanic
        ? champion.mechanic
        : (ctx.briefSpec && ctx.briefSpec.mechanicOneLiner ? String(ctx.briefSpec.mechanicOneLiner) : '')
      const recommendedHTML = renderRecommendedBuildHTML(hooksTop, mechanicLine)
      const lensHTML = renderPromoTrackLensHTML()

      sectionsHTML.push(`
        <section class="card">
          <h2>Evaluation</h2>
          <div class="content">${mdBasic(evaluation || '_No evaluation narrative._')}</div>
          ${scoreboardHTML}
          ${recommendedHTML}
          ${lensHTML}
        </section>
      `)
    }

    if (includeSynthesis) {
      sectionsHTML.push(`
        <section class="card">
          <h2>Synthesis</h2>
          <div class="content">${mdBasic(synthesis || '_No synthesis._')}</div>
        </section>
      `)
    }

    if (includeIdeas) {
      sectionsHTML.push(`
        <section class="card">
          <h2>Idea Routes (Compare)</h2>
          ${renderIdeaRoutesHTML(ideasRaw)}
        </section>
      `)
    }

    // Extras (Hooks get special pretty rendering; others use mdBasic)
    for (const o of extras) {
      if (o.type === 'hooks') {
        sectionsHTML.push(`
          <section class="card">
            <h2>${labelFor(o.type)}</h2>
            ${renderHooksHTML(String(o.content || ''))}
          </section>
        `)
      } else {
        sectionsHTML.push(`
          <section class="card">
            <h2>${labelFor(o.type)}</h2>
            <div class="content">${mdBasic(normalizeText(o.content || ''))}</div>
          </section>
        `)
      }
    }

    // Join with page breaks only BETWEEN sections (prevents leading blank pages)
    const bodySections = sectionsHTML.join('<div class="page-break"></div>')

    // —— TEMPLATE ——
    const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHtml(title)}</title>
<style>
  :root {
    --ink:#111827; --muted:#6b7280; --accent:${escapeCssColor(accent)};
    --border:#e5e7eb; --bg:#fff; --card:#fff;
  }
  *{box-sizing:border-box}
  body{
    margin:0;
    font-family:ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,"Helvetica Neue",Arial;
    color:var(--ink); background:var(--bg);
    line-height:1.55;
    font-size:clamp(13px, 1.45vw, 15px); /* smoother across screens/print */
    -webkit-font-smoothing:antialiased; -moz-osx-font-smoothing:grayscale;
  }
  .container{max-width:900px;margin:0 auto;padding:24px 18px 48px}
  header.head{display:grid;gap:6px;border-bottom:1px solid var(--border);padding-bottom:10px;margin-bottom:14px}
  header.head h1{font-size:22px;line-height:1.2;margin:0;letter-spacing:-.01em}
  header .meta{color:var(--muted);font-size:12px}
  .brand{display:flex;align-items:center;gap:10px}
  .pill{display:inline-block;padding:2px 8px;border-radius:999px;font-size:11px;border:1px solid var(--border);margin-right:6px}
  .card{background:var(--card);border:1px solid var(--border);border-radius:12px;padding:14px;margin:12px 0;break-inside:avoid;page-break-inside:avoid}
  h2{font-size:15px;margin:0 0 8px;border-left:3px solid var(--accent);padding-left:8px}
  .content{white-space:normal}
  .content p{margin:0 0 8px 0; orphans:3; widows:3}
  .content em{font-style:italic}
  .content strong{font-weight:600}
  .kv{display:grid;grid-template-columns:180px 1fr;gap:6px 10px;font-size:13px}
  .kv .k{color:#374151}
  .kv .v{color:#111827}

  /* Scoreboard / matrices */
  .matrix{margin-top:10px}
  .matrix table{
    width:100%;
    border:1px solid var(--border);
    border-radius:10px;
    border-collapse:separate;
    border-spacing:0;
    table-layout:fixed;
    font-size:12px; /* smaller, less shouty */
  }
  .matrix thead th{background:#f9fafb;text-align:left;padding:6px 8px;font-weight:600}
  .matrix tbody td{border-top:1px solid var(--border);padding:6px 8px;vertical-align:top;white-space:normal;word-break:break-word;overflow-wrap:anywhere}
  .matrix tbody tr:nth-child(even) td{background:#fbfbfc}

  .status{display:inline-block;padding:1px 6px;border-radius:999px;font-size:11px;border:1px solid var(--border)}
  .GREEN{background:#16a34a1a;color:#166534}
  .AMBER{background:#f59e0b1a;color:#92400e}
  .RED{background:#dc26261a;color:#7f1d1d}

  .subhead{font-size:13px;margin:10px 0 6px;color:#111827}
  ul.hooks{margin:6px 0 0 18px;padding:0}
  ul.hooks li{margin:2px 0}

  .hook-item{margin:6px 0}
  .hook-item strong{font-weight:600}
  .hook-item .why{color:#374151}

  .route{border:1px solid var(--border);border-radius:10px;padding:10px;margin:8px 0;break-inside:avoid}
  .route .title{font-weight:600;margin-bottom:6px}
  .route dl{display:grid;grid-template-columns:140px 1fr;gap:6px 10px;margin:0}
  .route dt{color:#374151}
  .route dd{margin:0;color:#111827}

  /* PromoTrack lens */
  .lens{border:1px dashed var(--border);border-radius:10px;padding:10px;margin-top:10px;background:#fcfcff}
  .lens h3{font-size:13px;margin:0 0 6px 0;color:#111827}
  .lens ul{margin:6px 0 0 18px;padding:0}
  .lens li{margin:2px 0}

  .page-break{page-break-before:always;break-before:page;margin:0;padding:0;height:0}
  tr{break-inside:avoid}
  footer.foot{margin-top:22px;padding-top:10px;font-size:11px;color:#6b7280;border-top:1px dashed var(--border)}
  @page { size: A4; margin: 16mm 14mm; }
</style>
</head>
<body>
  <div class="container">
    <header class="head">
      <div class="brand">${logo}<div class="meta">${escapeHtml(new Date().toLocaleString())}</div></div>
      <h1>${escapeHtml(title)}</h1>
      <div class="meta">${escapeHtml(metaLine)}</div>
      <div>${pill('Framing')}${pill('Evaluation')}${pill('Create')}${pill('Synthesis')}${pill('Export')}</div>
    </header>

    ${bodySections}

    <footer class="foot">Generated by Trudy v4 • ${escapeHtml(camp.id)}</footer>
  </div>
</body>
</html>`

    // persist HTML
    const dir = join(process.cwd(), 'storage', 'exports', camp.id)
    mkdirSync(dir, { recursive: true })
    const ts = Date.now()
    const htmlPath = join(dir, `export-${ts}.html`)
    writeFileSync(htmlPath, html, 'utf8')
    const htmlBytes = Buffer.byteLength(html, 'utf8')
    const htmlArtifact = await prisma.exportArtifact.create({
      data: { campaignId: camp.id, kind: 'HTML', path: htmlPath, bytes: htmlBytes },
    })

    let pdfArtifact: any = null
    if (format === 'PDF' || format === 'BOTH') {
      try {
        const exec = process.env.PUPPETEER_EXECUTABLE_PATH || detectChromeExecutable()
        const browser = await puppeteer.launch({
          headless: 'new',
          executablePath: exec || undefined,
          args: ['--no-sandbox','--disable-setuid-sandbox'],
        })
        const page = await browser.newPage()
        await page.setContent(html, { waitUntil: 'networkidle0' })
        const pdfBuffer = await page.pdf({
          format:'A4', printBackground:true, preferCSSPageSize:true,
          margin:{ top:'16mm', bottom:'16mm', left:'14mm', right:'14mm' },
        })
        await browser.close()
        const pdfPath = join(dir, `export-${ts}.pdf`)
        writeFileSync(pdfPath, pdfBuffer)
        pdfArtifact = await prisma.exportArtifact.create({
          data: { campaignId: camp.id, kind: 'PDF', path: pdfPath, bytes: pdfBuffer.byteLength },
        })
      } catch (err) {
        console.warn('[exports] PDF render failed; HTML only. Set PUPPETEER_EXECUTABLE_PATH or install Chrome.', err)
      }
    }

    await prisma.campaign.update({ where: { id: camp.id }, data: { status: 'COMPLETE' } })
    res.json({ artifact: pdfArtifact || htmlArtifact, also: pdfArtifact ? { html: htmlArtifact } : undefined })
  } catch (e) { next(e) }
})

export default router

// ===== helpers =====
function labelFor(type: string) {
  const map: Record<string,string> = {
    hooks:'Hooks', retailerDeck:'Retailer Deck', prizeLadder:'Prize Ladder Options',
    mechanics:'Mechanic Variants', compliance:'Compliance Notes', riskProfile:'Risk Register', custom:'Custom Output',
  }
  return map[type] || type
}

function normalizeText(value: any): string {
  const s = String(value ?? '')
  return s.normalize('NFC')
    .replace(/\u2018|\u2019/g, "'")
    .replace(/\u201C|\u201D/g, '"')
    .replace(/\u2013/g, '-')
    .replace(/\u2014/g, '--')
}

// Strip leading markdown heading hashes per-line (### → “Title”)
function sanitizeFraming(s: string): string {
  return s.split(/\r?\n/).map(line => line.replace(/^\s*#{1,6}\s+/, '')).join('\n')
}

function escapeHtml(value: any) {
  const s = String(value ?? '')
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
}

// Minimal markdown: **bold** and *italic* + paragraphs
function mdBasic(src: any) {
  const safe = escapeHtml(String(src || ''))
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*]+)\*/g, '<em>$1</em>')
  const lines = safe.split(/\r?\n/)
  const out: string[] = []
  let buf: string[] = []
  const flush = () => {
    const t = buf.join(' ').trim()
    if (t) out.push(`<p>${t}</p>`)
    buf = []
  }
  for (const line of lines) {
    if (!line.trim()) { flush(); continue }
    buf.push(line)
  }
  flush()
  return out.join('')
}

function mdSafe(s: any) { return escapeHtml(normalizeText(s)).replace(/\n/g,'<br/>') }
function pill(t: string){ return `<span class="pill">${t}</span> ` }
function escapeCssColor(s: string){ return String(s).replace(/[^#(),.%a-zA-Z0-9\s-]/g,'').slice(0,32) }
function detectChromeExecutable(): string | null {
  const mac = ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome','/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary','/Applications/Chromium.app/Contents/MacOS/Chromium']
  const win = ['C:\\\\Program Files\\\\Google\\\\Chrome\\\\Application\\\\chrome.exe','C:\\\\Program Files (x86)\\\\Google\\\\Chrome\\\\Application\\\\chrome.exe','C:\\\\Program Files\\\\Microsoft\\\\Edge\\\\Application\\\\msedge.exe']
  const lin = ['/usr/bin/google-chrome','/usr/bin/chromium','/usr/bin/chromium-browser']
  const c = process.platform==='darwin'?mac:process.platform==='win32'?win:lin
  for (const p of c) if (existsSync(p)) return p
  return null
}
function heuristicHeadline(_: any){ return 'Heuristic score: n/a' }

function safeJson(value: any): any {
  if (!value) return null
  if (typeof value === 'object') return value
  try { return JSON.parse(String(value)) } catch { return null }
}

// ——— BRIEF pretty renderer ———
function renderBriefHTML(snapshot: string) {
  const lines = String(snapshot || '').split(/\r?\n/).filter(Boolean)
  const rows: Array<{k:string,v:string}> = []
  let notesIdx = lines.findIndex(l => /^notes:$/i.test(l.trim()))
  if (notesIdx === -1) notesIdx = lines.findIndex(l => /^notes[:：]/i.test(l.trim()))
  const main = notesIdx >= 0 ? lines.slice(0, notesIdx) : lines
  const notes = notesIdx >= 0 ? lines.slice(notesIdx + 1).join('\n').trim() : ''

  for (const line of main) {
    const m = /^([^:]+):\s*(.*)$/.exec(line)
    if (!m) continue
    rows.push({ k: m[1].trim(), v: m[2].trim() })
  }
  const kv = rows.map(r => `<div class="k">${escapeHtml(r.k)}</div><div class="v">${escapeHtml(r.v)}</div>`).join('')
  const notesHTML = notes ? `<div class="content" style="margin-top:8px">${mdBasic(notes)}</div>` : ''
  return `<div class="kv">${kv}</div>${notesHTML}`
}

// ——— HOOKS pretty renderer ———
function renderHooksHTML(text: string) {
  const lines = text.split(/\r?\n/).map(s => s.trim()).filter(Boolean)
  const items: string[] = []
  for (let raw of lines) {
    // strip bullets and markdown leftovers
    raw = raw.replace(/^[\*\-\d\.\)\s]+/, '')
             .replace(/\*\*/g, '')
             .replace(/\s+—\s*$/,'')
    if (!raw) continue
    // split "Hook — Why" if present
    const parts = raw.split(/\s+—\s+/, 2)
    const hook = parts[0].trim()
    const why = (parts[1] || '').trim()
    const h = escapeHtml(hook.replace(/[.?!,:;]+$/,''))
    const w = why ? ` <span class="why">— ${escapeHtml(why)}</span>` : ''
    items.push(`<div class="hook-item"><strong>${h}</strong>${w}</div>`)
  }
  return items.length ? items.join('') : `<div class="content"><em>No hooks provided.</em></div>`
}

// ——— Idea Routes renderer ———
function renderIdeaRoutesHTML(text: string) {
  const routes = parseIdeas(text)
  if (!routes.length) return `<div class="content"><em>No idea routes.</em></div>`
  const blocks = routes.map(r => {
    const rows: string[] = []
    if (r.hook) rows.push(`<dt>Hook</dt><dd>${escapeHtml(r.hook)}</dd>`)
    if (r.altHook) rows.push(`<dt>Alt hook</dt><dd>${escapeHtml(r.altHook)}</dd>`)
    if (r.mechanic) rows.push(`<dt>Mechanic</dt><dd>${escapeHtml(r.mechanic)}</dd>`)
    return `<div class="route">
      <div class="title">${escapeHtml(r.name)}</div>
      <dl>${rows.join('')}</dl>
    </div>`
  })
  return blocks.join('')
}

// ——— PromoTrack lens (explicit, light-touch) ———
function renderPromoTrackLensHTML(): string {
  const items = (PROMOTRACK_COMPACT || []).slice(0, 5)
  if (!items.length) return ''
  const lis = items.map(s => `<li>${escapeHtml(String(s))}</li>`).join('')
  return `<div class="lens">
    <h3>PromoTrack lens (what we leaned on)</h3>
    <ul>${lis}</ul>
  </div>`
}

// ===== Hook selection & champion helpers (strict) =====
function pickHooksStrict(opts: {
  brand: string
  champion: { name: string; hooks: string[]; mechanic?: string } | null
  evaluationProse: string
  synthesisProse: string
  extras: Array<{ type: string; content: string }>
}): string[] {
  const { brand, champion, extras } = opts

  // 1) champion explicit hooks
  const fromChampion = cleanHooks(champion?.hooks || [], brand)
  if (fromChampion.length) return fromChampion.slice(0, 3)

  // 2) latest hooks extra
  const hooksExtra = [...extras].filter(x => x.type === 'hooks').slice(-1)[0]
  const fromExtra = hooksExtra?.content ? cleanHooks(hooksExtra.content.split(/\r?\n/), brand) : []
  if (fromExtra.length) return fromExtra.slice(0, 3)

  // 3) otherwise none (no scraping of prose; keeps stability)
  return []
}

function cleanHooks(lines: any[], brand: string): string[] {
  const seen = new Set<string>(), out: string[] = []
  for (const raw of lines || []) {
    let s = String(raw || '')
      .replace(/^[\-\*\d\.\)\s]+/g, '')
      .replace(/^["“”'’]+|["“”'’]+$/g, '')
      .replace(/[.?!,:;]+$/g, '')
      .trim()
    if (!s) continue
    const words = s.split(/\s+/)
    if (words.length < 2 || words.length > 8) continue
    if (brand && !s.toLowerCase().includes(brand.toLowerCase())) {
      if (words.length <= 8) s = `${s} — ${brand}`
    }
    const key = s.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(s)
    if (out.length >= 5) break
  }
  return out
}

// Parse Idea Routes (### Title — promise) with common subheads
function parseIdeas(text: string): Array<{
  name: string
  hook?: string
  altHook?: string
  mechanic?: string
}> {
  if (!text) return []
  const blocks = text.split(/^###\s+/m).filter(Boolean)
  const routes: Array<{ name: string; hook?: string; altHook?: string; mechanic?: string }> = []
  for (const b of blocks) {
    const [headLine, ...rest] = b.split('\n')
    const name = (headLine || '').split('—')[0].trim()
    const body = rest.join('\n')
    const hook = matchLine(body, /^Hook\s*(?:\(.*\))?:\s*(.+)$/im)
    const altHook = matchLine(body, /^Alt hook\s*:\s*(.+)$/im)
    const mechanic = matchLine(body, /^(?:Mechanic|Core mechanic(?:\s*\(.*\))?):\s*(.+)$/im)
    routes.push({ name, hook, altHook, mechanic })
  }
  return routes
}

function matchLine(text: string, rx: RegExp): string | undefined {
  const m = rx.exec(text); return m ? m[1].trim() : undefined
}

function deriveChampionFromSynthesis(synthesis: string, ideas: ReturnType<typeof parseIdeas>) {
  if (!synthesis || !ideas.length) return null

  // Try explicit hook lines first
  const hooks: string[] = []
  scrapeHookLines(synthesis, hooks)
  if (!hooks.length) scrapeQuotedHooks(synthesis, hooks)

  if (hooks.length) {
    const target = normalizeText(hooks[0]).toLowerCase()
    const found = ideas.find(r =>
      (r.hook && normalizeText(r.hook).toLowerCase().includes(target)) ||
      (r.altHook && normalizeText(r.altHook).toLowerCase().includes(target))
    )
    if (found) return { name: found.name, hooks: [found.hook, found.altHook].filter(Boolean) as string[], mechanic: found.mechanic || '' }
  }

  // Fallback: match by route name mentioned in synthesis
  for (const r of ideas) {
    const nm = normalizeText(r.name).toLowerCase()
    if (nm.length > 3 && synthesis.toLowerCase().includes(nm)) {
      return { name: r.name, hooks: [r.hook, r.altHook].filter(Boolean) as string[], mechanic: r.mechanic || '' }
    }
  }
  return null
}

function scrapeQuotedHooks(text: string, out: string[]) {
  if (!text) return
  const rx = /["“”]([^"“”]{2,100})["“”]/g
  let m: RegExpExecArray | null
  while ((m = rx.exec(text)) !== null) out.push(m[1])
}

function scrapeHookLines(text: string, out: string[]) {
  if (!text) return
  const rx = /^(?:Hook(?:\s*\(.*\))?:)\s*(.+)$/gim
  let m: RegExpExecArray | null
  while ((m = rx.exec(text)) !== null) out.push(m[1].trim())
}

// === scoreboard render (HTML) ===
function renderScoreboardHTML(board: any): string {
  if (!board || typeof board !== 'object') return ''
  const row = (key: string, label: string) => {
    const c: any = (board as any)[key] || {}
    const status = String(c.status || 'NA').toUpperCase()
    const why = escapeHtml(c.why || '')

    // Guarantee a Fix where status is AMBER/RED (fallback to default guidance)
    let fixCell: string
    if (status === 'AMBER' || status === 'RED') {
      const provided = (c.fix ? String(c.fix) : '').trim()
      const fallback = defaultFixForKey(key, status)
      fixCell = escapeHtml(provided || fallback)
    } else {
      fixCell = '—'
    }

    return `<tr>
      <td>${label}</td>
      <td><span class="status ${status}">${status}</span></td>
      <td>${why}</td>
      <td>${fixCell}</td>
    </tr>`
  }
  const decisionLine = (board as any).decision
    ? `<div style="margin-top:6px;font-size:12px;color:#374151">
         Decision: <strong>${escapeHtml((board as any).decision)}</strong>${(board as any).conditions ? ' — ' + escapeHtml((board as any).conditions) : ''}
       </div>`
    : ''

  const colgroup = `
    <colgroup>
      <col style="width:22%"/>
      <col style="width:12%"/>
      <col style="width:34%"/>
      <col style="width:32%"/>
    </colgroup>`

  return `
    <div class="matrix">
      <div class="subhead"><strong>Scoreboard Summary</strong></div>
      <table>
        ${colgroup}
        <thead>
          <tr>
            <th>Dimension</th>
            <th>Status</th>
            <th>Why</th>
            <th>Fix</th>
          </tr>
        </thead>
        <tbody>
          ${row('objectiveFit','Objective fit')}
          ${row('hookStrength','Hook strength')}
          ${row('mechanicFit','Mechanic fit')}
          ${row('frequencyPotential','Frequency potential')}
          ${row('friction','Entry friction')}
          ${row('rewardShape','Reward shape & odds')}
          ${row('retailerReadiness','Retailer readiness')}
          ${row('complianceRisk','Compliance risk')}
          ${row('fulfilment','Prize fulfilment')}
          ${row('kpiRealism','KPI realism')}
        </tbody>
      </table>
      ${decisionLine}
    </div>
  `
}

// Opinionated default fixes per dimension (used when meta lacks a fix)
function defaultFixForKey(key: string, status: string): string {
  const FIX: Record<string, string> = {
    objectiveFit:
      'Name one primary KPI (e.g., +8–12% ROS). Align mechanic and prize value to it; drop side objectives.',
    hookStrength:
      'Write one 2–6 word, brand-locked line. Use it everywhere; art-direct minimal, premium, with scarcity cues.',
    mechanicFit:
      'Specify “Buy X, scan QR, auto-entry”. Add a 2+ unit bonus entry. Keep adjudication and winner comms central.',
    frequencyPotential:
      'Add light laddering: bonus entries at 2 and 4 units plus weekly micro-draws to reward repeaters.',
    friction:
      status === 'RED'
        ? 'Replace receipt upload with QR-on-pack → one-screen mobile form; pre-fill fields; show progress (“30s left”).'
        : 'Remove optional fields; compress to one screen; keep the flow mobile-first and fast.',
    rewardShape:
      'Publish total winners. Add 100–300 instant wins and weekly draws. Keep the hero prize; fix perceived odds.',
    retailerReadiness:
      'Pre-pack POS kits; zero staff adjudication; central draw & winner contact. Confirm ranging with priority banners.',
    complianceRisk:
      'Add RSA/ABAC lines and age gate. Avoid consumption cues; publish moderation plan; exclude on-premise if edge cases.',
    fulfilment:
      'Use travel credit/concierge with blackout dates and clear booking windows; publish fulfilment timelines in T&Cs.',
    kpiRealism:
      'Set an entry band (not a point estimate) and back-solve ladder and media to that range; adjust cadence if needed.',
  }
  return FIX[key] || 'Tighten copy and ops; reduce friction; add visible odds and weekly cadence.'
}

function renderRecommendedBuildHTML(hooks: string[], mechanic: string): string {
  if ((!hooks || !hooks.length) && !mechanic) return ''
  const hooksHTML = hooks && hooks.length
    ? `<div class="subhead"><strong>Recommended Build</strong></div>
       <div class="content" style="white-space:normal">
         ${mechanic ? `<div style="margin-bottom:6px"><em>Mechanic:</em> ${escapeHtml(mechanic)}</div>` : ''}
         <div><em>Top Hooks:</em></div>
         <ul class="hooks">
           ${hooks.slice(0,3).map(h => `<li><strong>${escapeHtml(h)}</strong></li>`).join('')}
         </ul>
       </div>`
    : `<div class="subhead"><strong>Recommended Build</strong></div>
       <div class="content" style="white-space:normal">
         ${mechanic ? `<div><em>Mechanic:</em> ${escapeHtml(mechanic)}</div>` : '<div>No hook recommendations available.</div>'}
       </div>`
  return `<div class="matrix">${hooksHTML}</div>`
}

// === Local scoreboard fallback (no model call) with explicit fixes ===
function buildScoreboardFallback(ctx: any, hooksTop: string[]) {
  const brand = ctx.clientName || ''
  const b = ctx.briefSpec || {}
  const hook = b.hook || ''
  const mech = b.mechanicOneLiner || ''
  const typeOfPromo = b.typeOfPromotion || ''
  const retailers: string[] = Array.isArray(b.retailers) ? b.retailers : []
  const frictionBudget = String(b.frictionBudget || '').toLowerCase()
  const heroPrize = b.heroPrize || ''
  const heroCount = Number(b.heroPrizeCount || 0) || 0
  const runnerUps: string[] = Array.isArray(b.runnerUps) ? b.runnerUps : []
  const market = (ctx.market || 'AU').toUpperCase()
  const category = String(ctx.category || '').toLowerCase()

  const includesAny = (hay: string, xs: string[]) => {
    const h = (hay || '').toLowerCase()
    return xs.some(x => h.includes(x.toLowerCase()))
  }

  type Traffic = 'GREEN'|'AMBER'|'RED'
  const status: Record<string, Traffic> = {
    objectiveFit: 'AMBER',
    hookStrength: hook ? (hooksTop && hooksTop.length ? 'AMBER' : 'GREEN') : 'RED',
    mechanicFit: mech ? 'GREEN' : 'AMBER',
    frequencyPotential: includesAny(typeOfPromo, ['stamp','collect','tier','loyalty']) ? 'GREEN'
                       : includesAny(typeOfPromo, ['instant win','scan','qr']) ? 'AMBER' : 'AMBER',
    friction: includesAny(frictionBudget, ['none','low','1-step']) ? 'GREEN'
            : includesAny(frictionBudget, ['high','receipt','proof','multi']) ? 'RED'
            : includesAny(typeOfPromo, ['receipt','upload']) ? 'RED' : 'AMBER',
    rewardShape: !heroPrize ? 'RED'
               : (heroCount <= 1 && (!runnerUps || !runnerUps.length)) ? 'AMBER'
               : (runnerUps && runnerUps.length >= 3) ? 'GREEN' : 'AMBER',
    retailerReadiness: retailers.length ? 'GREEN' : 'AMBER',
    complianceRisk: (includesAny(category, ['alcohol','beer','wine','spirits','liquor']) ||
                    retailers.some(r => includesAny(String(r), ['bws','dan murphy','on-premise','pub','hotel']))) && market==='AU'
                    ? 'AMBER' : 'GREEN',
    fulfilment: includesAny(heroPrize, ['trip','travel','flight','holiday']) ? 'AMBER' : 'GREEN',
    kpiRealism: 'AMBER',
  }

  const why = {
    objectiveFit: 'Partially aligned; needs specifics',
    hookStrength: !hook ? 'No clear consumer-facing line' : (hooksTop.length ? 'Current hook soft; stronger variants exist' : 'Clear, consumer-facing hook'),
    mechanicFit: mech ? 'Simple, staff-explainable mechanic' : 'Mechanic underspecified',
    frequencyPotential: status.frequencyPotential==='GREEN' ? 'Built-in repeat behaviour' : 'Repeat incentive not explicit',
    friction: status.friction==='GREEN' ? 'Low barrier; quick entry' : (status.friction==='RED' ? 'High effort to enter' : 'Friction not specified'),
    rewardShape: status.rewardShape==='GREEN' ? 'Hero + ladder improves perceived odds' : (!heroPrize ? 'No prize articulated' : 'Single big prize; low perceived odds'),
    retailerReadiness: status.retailerReadiness==='GREEN' ? 'Banners identified; low staff burden' : 'Retailers not specified',
    complianceRisk: status.complianceRisk==='AMBER' ? 'RSA/ABAC sensitivities in AU' : 'Standard trade promo risk',
    fulfilment: status.fulfilment==='AMBER' ? 'Travel prize logistics require buffers' : 'Manageable fulfilment',
    kpiRealism: 'Targets achievable with changes',
  }

  const retailerList = retailers.length ? retailers.join(', ') : 'priority banners'
  const top1 = hooksTop[0] ? hooksTop[0] : (hook || '')
  const top2 = hooksTop[1] ? hooksTop[1] : ''
  const fixes = {
    objectiveFit: `Name a single success metric (e.g., +8–12% ROS) and align the mechanic to it. Drop side objectives.`,
    hookStrength: !hook
      ? `Write and commit to one premium line across all touchpoints. For example: “${lockBrand(top1, brand)}${top2 ? `” or “${lockBrand(top2, brand)}` : ''}”.`
      : `Shorten to 2–6 words, lock the brand into the line, and art-direct a minimal, premium layout with scarcity cues.`,
    mechanicFit: mech
      ? `Keep “Buy, scan, auto-entry”. Add a bonus entry at 2+ units; keep adjudication and winner contact centralised.`
      : `Specify “Buy X, scan QR, auto-entry”. Ensure staff explanation is under five seconds; no receipt handling in-store.`,
    frequencyPotential: includesAny(typeOfPromo, ['stamp','collect','tier','loyalty'])
      ? `Maintain tiers and add a weekly draw to keep momentum; message “more entries on 2+ units”.`
      : `Add a light ladder: bonus entries at 2 and 4 units plus weekly micro-draws to pull repeaters.`,
    friction: status.friction==='RED'
      ? `Replace receipt upload with QR-on-pack → mobile form. Pre-fill common fields and show a single-screen flow.`
      : `Remove optional fields, compress steps to one screen, and show progress (“30s left”).`,
    rewardShape: !heroPrize
      ? `Define a clear hero prize and add a visible ladder (instant-wins and weekly draws) to fix perceived odds.`
      : `Add 100–300 instant-win cellar packs and a weekly draw cadence. Signpost “Total winners” prominently on POS.`,
    retailerReadiness: retailers.length
      ? `Pre-pack neck tags/wobblers and use a central draw. ${retailerList}: no staff adjudication or prize fulfilment.`
      : `Confirm ranging and POS with target banners. Ship pre-packed kits and keep store workload at zero.`,
    complianceRisk: status.complianceRisk==='AMBER'
      ? `Add RSA/ABAC lines, age gate, and moderation plan. Avoid consumption cues; exclude on-premise if needed.`
      : `Maintain RSA compliance copy and avoid risky imagery; log a moderation plan.`,
    fulfilment: status.fulfilment==='AMBER'
      ? `Use a travel credit/concierge with blackout dates and flexible booking windows; publish T&Cs clearly.`
      : `Keep centralised fulfilment with clear SLAs; publish timelines in T&Cs.`,
    kpiRealism: `Set an entry band rather than a point estimate and back-solve prize ladder and media to that range.`,
  }

  const obj: any = {}
  const order: Array<[string,string]> = [
    ['objectiveFit','Objective fit'],['hookStrength','Hook strength'],['mechanicFit','Mechanic fit'],
    ['frequencyPotential','Frequency potential'],['friction','Entry friction'],['rewardShape','Reward shape & odds'],
    ['retailerReadiness','Retailer readiness'],['complianceRisk','Compliance risk'],['fulfilment','Prize fulfilment'],
    ['kpiRealism','KPI realism'],
  ]
  for (const [k] of order) {
    obj[k] = { status: status[k], why: (why as any)[k], fix: (status[k]==='AMBER'||status[k]==='RED') ? (fixes as any)[k] : undefined }
  }
  obj.decision = 'GO WITH CONDITIONS'
  obj.conditions = 'Apply hook and ladder changes; confirm POS and compliance line.'
  return obj
}

function lockBrand(line: string, brand: string) {
  if (!line) return line
  const lower = line.toLowerCase()
  if (brand && !lower.includes(brand.toLowerCase())) return `${line} — ${brand}`
  return line
}
