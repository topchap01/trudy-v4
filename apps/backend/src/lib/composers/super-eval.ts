// apps/backend/src/lib/composers/super-eval.ts
// Pure-prose evaluation composer (no headings/lists/tables in narrative).
// Framing-aware tone, Australian idiom. Scoreboard is summarized in meta, not in the prose.

import type { CampaignContext } from '../context.js'
import { polishText } from '../polish.js'

type ScoreCell = { status: 'GREEN'|'AMBER'|'RED'|'NA'; why?: string; fix?: string }
type Scoreboard = Record<string, ScoreCell>

type SuperbInput = {
  verdict?: 'STRONG'|'WORKABLE'|'WEAK'
  one_breath?: string
  narrative?: string
  diagnosis?: any
  rebuild_spec?: {
    staff_script?: string
    hooks?: string[]
    ladder?: any
    entry_path?: string
    cadence?: string
    fulfilment?: string
    compliance_line?: string
    hook_line?: string
  }
  bold_variants?: Array<{
    name?: string
    idea?: string
    hypothesis?: string
    risks?: string[]
    mitigations?: string[]
    measures?: string[]
    exit?: string
  }>
  promotrack_applied?: string[]
  scoreboard?: Scoreboard
  ruleFlex?: 'KEEP'|'BEND'|'BREAK'
  priorFraming?: string
}

function esc(value: any) {
  const s = String(value ?? '')
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
}

function normaliseWhitespace(s: string) {
  return s.replace(/[ \t]+/g,' ').replace(/\n{3,}/g,'\n\n').trim()
}

// Very light AU polish / de-jargon pass for narrative text
function auPolish(s: string) {
  let out = s

  // ban house jargon
  out = out.replace(/\bfriction\b/gi, 'hassle')
  out = out.replace(/\bprize\s*ladder(s)?\b/gi, 'prize mix')
  out = out.replace(/\blearnings?\b/gi, 'what we learned')
  out = out.replace(/\bomnichannel\b/gi, 'multi-channel')
  out = out.replace(/\bgamification\b/gi, 'game-y stuff')

  // tidy punctuation & spacing
  out = out.replace(/ ?— ?/g, ' — ')
  out = out.replace(/(\S)\s*→\s*(\S)/g, '$1 → $2')

  return polishText(normaliseWhitespace(out), { locale: 'en-AU' })
}

// Shopper-facing brand call. Prefer brand inside title; compress known patterns.
// "V Energy" → "V"; "POWERADE" stays; fallback to client brand if nothing else.
function deriveBrandShort(ctx: CampaignContext): string {
  const title = String(ctx.title || '').trim()
  // bits like "Client — Brand — Campaign"
  const parts = title.split('—').map(x => x.trim())
  const rightMost = parts[parts.length - 2] || parts[0] || ''
  let candidate = rightMost || title

  // common compressions
  if (/^v energy$/i.test(candidate)) return 'V'
  if (/^coca[-\s]?cola$/i.test(candidate)) return 'Coke'
  if (/^mountain\s*dew$/i.test(candidate)) return 'Mountain Dew'

  // if single-letter + word, keep the letter (e.g., "V Energy" already caught)
  return candidate
}

// Build one coherent prose piece from strategist hints and scoreboard,
// but DO NOT include scoreboard bullets or headings in the narrative.
export function composeSuperbEvaluation(ctx: CampaignContext, dx: SuperbInput): string {
  const brandShort = deriveBrandShort(ctx)

  // Pull candidate lines
  const hookLine = (dx?.rebuild_spec?.hook_line || (dx?.rebuild_spec?.hooks || [])[0] || '').trim()
  const mechLine = (dx?.rebuild_spec?.entry_path || '').trim()
  const cadence = (dx?.rebuild_spec?.cadence || '').trim()
  const fulfil = (dx?.rebuild_spec?.fulfilment || '').trim()
  const compliance = (dx?.rebuild_spec?.compliance_line || '').trim()

  // Start from one-breath verdict if present; keep it human
  const opener = dx?.one_breath
    ? dx.one_breath.replace(/^[\*\s]+|[\*\s]+$/g,'')
    : 'Close. A few smart moves and it lands.'

  // Body paragraphs, short and decisive
  const paras: string[] = []

  // Para 1: snap judgement grounded in framing, not restating it
  const season = (ctx.briefSpec?.calendarTheme || '').toString().toUpperCase()
  const market = (ctx.market || 'AU').toUpperCase()
  const head = `**${esc(ctx.clientName || '') ? esc(ctx.clientName || '') + ' — ' : ''}${esc(ctx.title || '')}**`
  const meta = `Market: ${market}${ctx.category ? ` • Category: ${esc(ctx.category)}` : ''}${ctx.timingWindow ? ` • Timing: ${esc(ctx.timingWindow)}` : ''}`
  paras.push(`${head}\n\n${meta}\n\n${opener} — ${season ? `seasonal angle: ${season.toLowerCase()}. ` : ''}Let’s keep it store-safe, fast on phone, and something shoppers repeat.`)

  // Para 2: make the promise wearable
  if (hookLine) {
    const tightHook = hookLine.replace(/[.!\s]+$/,'')
    paras.push(`Put **${tightHook}** on the can and every touchpoint. Two to six words. No sentence. If a staffer needs longer than five seconds to explain it, we’ve over-cooked it.`)
  }

  // Para 3: the phone moment
  if (mechLine) {
    const cleanMech = mechLine
      .replace(/receipt/gi,'')
      .replace(/\b(upload|photo|proof)\b/gi,'')
      .trim()
    paras.push(`The phone moment should be a blip: ${cleanMech}. If you miss, the screen should still help: “Next chance: 10am tomorrow.” That timestamp builds habit.`)
  }

  // Para 4: winners feel close; present the mix
  if (dx?.scoreboard) {
    paras.push(`Make the chances feel real. Lead with a believable number of winners and show it working — names on a rolling feed and a simple weekly moment. Keep the big prize; change the shape so people try again tomorrow.`)
  }

  // Para 5: staff script (brand-forward, never parent company)
  const staff = dx?.rebuild_spec?.staff_script
    ? dx.rebuild_spec.staff_script
    : `Buy a ${brandShort}, scan the QR, see if you’ve won — takes ten seconds.`
  paras.push(staff)

  // Para 6: ops + retailer sanity
  const ops = [
    'Ship pre-packed POS kits; no store adjudication or prize handling.',
    fulfil ? fulfil : '',
    compliance ? compliance : 'Standard AU promotion guardrails; avoid consumption cues if needed.'
  ].filter(Boolean).join(' ')
  paras.push(ops)

  // Para 7: one bold test with a kill switch, if provided
  const bold = (dx?.bold_variants && dx.bold_variants[0]) || null
  if (bold) {
    const idea = [bold.idea, bold.hypothesis].filter(Boolean).join(' — ')
    const risk = (bold.risks && bold.risks.length) ? ` Risk: ${bold.risks.join('; ')}.` : ''
    const mit  = (bold.mitigations && bold.mitigations.length) ? ` Mitigation: ${bold.mitigations.join('; ')}.` : ''
    const exit = bold.exit ? ` Exit: ${bold.exit}.` : ''
    const measures = (bold.measures && bold.measures.length) ? ` We’ll judge it on: ${bold.measures.join(', ')}.` : ''
    paras.push(`${idea}.${risk}${mit}${measures}${exit}`)
  }

  // Build prose
  let out = paras.map(p => p.trim()).filter(Boolean).join('\n\n')

  // Sanitise: never show owner names; keep AU polish; no bullet leftovers
  out = out.replace(/\bFrucor\b/gi, brandShort)
  out = out.replace(/^[-*]\s+/gm, '')        // strip bullet leaders if any slipped in
  out = out.replace(/^\s*#{1,6}\s+/gm, '')   // strip headings if any slipped in
  out = auPolish(out)

  return out + '\n'
}
