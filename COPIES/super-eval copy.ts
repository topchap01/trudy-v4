// apps/backend/src/lib/composers/super-eval.ts
// Deterministic, client-ready rendering of the Superb Evaluation JSON.
// No extra model calls; we just format what the strategist JSON returns.

import type { CampaignContext } from '../context.js'

type ScoreCell = { status: 'GREEN'|'AMBER'|'RED'|'NA'; why?: string; fix?: string }
type Scoreboard = Record<string, ScoreCell>

// — tiny local util so there’s no external dependency —
function escapeHtmlLocal(value: any) {
  const s = String(value ?? '')
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
}

function h2(t: string){ return `## ${t}\n` }
function h3(t: string){ return `### ${t}\n` }
function para(s?: string){ return s ? s.trim() + '\n\n' : '' }
function list(xs?: string[]){ return (xs||[]).map(x => `- ${x}`).join('\n') + ((xs&&xs.length)?'\n\n':'') }
function mdCode(s: string){ return s ? `\`${s}\`` : '' }

export function composeSuperbEvaluation(ctx: CampaignContext, dx: any): string {
  const titleLine = `**${escapeHtmlLocal(ctx.clientName || '')} — ${escapeHtmlLocal(ctx.title || '')}**`
  const meta = [
    `Market: ${escapeHtmlLocal(ctx.market || 'AU')}`,
    `Category: ${escapeHtmlLocal(ctx.category || 'n/a')}`,
    `Timing: ${escapeHtmlLocal(ctx.timingWindow || 'n/a')}`
  ].join(' • ')

  const verdictBadge =
    dx?.verdict === 'STRONG'     ? '🟢 **STRONG**'
    : dx?.verdict === 'WORKABLE' ? '🟠 **WORKABLE**'
    : dx?.verdict === 'WEAK'     ? '🔴 **WEAK**'
    : '**WORKABLE**'

  // ——— Cover ———
  let out = ''
  out += h2('Evaluation (Superb)')
  out += `${titleLine}\n\n${meta}\n\n`
  out += `**Verdict:** ${verdictBadge}\n\n`
  out += dx?.one_breath ? `**Why (one breath):** ${dx.one_breath}\n\n` : ''

  const keep = Array.isArray(dx?.keep) ? dx.keep : []
  const fix  = Array.isArray(dx?.fix)  ? dx.fix  : []
  const drop = Array.isArray(dx?.drop) ? dx.drop : []
  if (keep.length || fix.length || drop.length) {
    out += h3('Keep / Fix / Drop')
    if (keep.length) out += `**Keep**\n${list(keep)}`
    if (fix.length)  out += `**Fix**\n${list(fix)}`
    if (drop.length) out += `**Drop**\n${list(drop)}`
  }

  // ——— Narrative Verdict (optional) ———
  if (dx?.narrative) {
    out += h2('Narrative Verdict')
    out += para(dx.narrative)
  }

  // ——— Deep Diagnosis ———
  const diag = dx?.diagnosis || {}
  const diagOrder: Array<[string,string]> = [
    ['audience','Audience Psychology'],
    ['category_codes','Category & Codes'],
    ['retailer','Retailer Reality'],
    ['triangle','Mechanic–Value–Ops'],
    ['friction','Friction Map'],
    ['prize_math','Prize Architecture Math'],
    ['compliance','Compliance Materiality'],
  ]
  out += h2('Deep Diagnosis')
  for (const [k,label] of diagOrder) {
    const sec = diag?.[k] || {}
    const finding = sec.finding || ''
    const means   = sec.means || ''
    const doThis  = sec.do_this || ''
    out += h3(label)
    out += para(finding ? `**Finding.** ${finding}` : '')
    out += para(means   ? `**What this means.** ${means}` : '')
    out += para(doThis  ? `**Do this.** ${doThis}` : '')
  }

  // ——— Rebuild Spec ———
  const spec = dx?.rebuild_spec || {}
  out += h2('Rebuild Spec (drop-in)')
  if (spec.staff_script) out += `- **Staff script (≤5s):** ${spec.staff_script}\n`
  const hooks = Array.isArray(spec.hooks) ? spec.hooks : []
  if (hooks.length) {
    out += `- **Creative hooks:**\n`
    for (const h of hooks) out += `  - **${h}** — premium, 2–6 words\n`
  }
  const ladder = spec.ladder || {}
  if (ladder.hero || ladder.runner_ups || ladder.instants) {
    out += `- **Prize ladder:**\n`
    if (ladder.hero) {
      out += `  - Hero: **${ladder.hero.title}** — qty ${ladder.hero.qty}, value ${mdCode(ladder.hero.value_band)}\n`
    }
    const rus = Array.isArray(ladder.runner_ups) ? ladder.runner_ups : []
    for (const r of rus) out += `  - Runner-up: **${r.title}** — qty ${r.qty}, ${mdCode(r.value_each)} each\n`
    const inst = Array.isArray(ladder.instants) ? ladder.instants : []
    for (const r of inst) out += `  - Instant: **${r.title}** — qty ${r.qty}, ${mdCode(r.value_each)} each\n`
    if (ladder.odds_note) out += `  - _Perceived odds:_ ${ladder.odds_note}\n`
  }
  if (spec.entry_path)      out += `- **Entry path:** ${spec.entry_path}\n`
  if (spec.cadence)         out += `- **Cadence:** ${spec.cadence}\n`
  if (spec.fulfilment)      out += `- **Fulfilment:** ${spec.fulfilment}\n`
  if (spec.compliance_line) out += `- **Compliance line:** ${spec.compliance_line}\n`
  out += '\n'

  // ——— Bold Variants ———
  const bvs = Array.isArray(dx?.bold_variants) ? dx.bold_variants : []
  if (bvs.length) {
    out += h2('Bold Variants (rule-bending, justified)')
    for (const v of bvs) {
      out += h3(v.name || 'Variant')
      if (v.idea)        out += para(`**Idea.** ${v.idea}`)
      if (v.hypothesis)  out += para(`**Hypothesis.** ${v.hypothesis}`)
      if (v.risks?.length)       out += `- **Risks:**\n${list(v.risks)}`
      if (v.mitigations?.length) out += `- **Mitigations:**\n${list(v.mitigations)}`
      if (v.measures?.length)    out += `- **Measures:**\n${list(v.measures)}`
      if (v.exit)        out += para(`**Exit criteria.** ${v.exit}`)
    }
  }

  // ——— PromoTrack Lens ———
  const lens = Array.isArray(dx?.promotrack_applied) ? dx.promotrack_applied : []
  if (lens.length) {
    out += h2('PromoTrack Lens (what we leaned on)')
    out += list(lens)
  }

  // ——— Scoreboard ———
  const sb: Scoreboard = dx?.scoreboard || {}
  const order: Array<[keyof Scoreboard,string]> = [
    ['objectiveFit','Objective fit'],
    ['hookStrength','Hook strength'],
    ['mechanicFit','Mechanic fit'],
    ['frequencyPotential','Frequency potential'],
    ['friction','Entry friction'],
    ['rewardShape','Reward shape & odds'],
    ['retailerReadiness','Retailer readiness'],
    ['complianceRisk','Compliance risk'],
    ['fulfilment','Prize fulfilment'],
    ['kpiRealism','KPI realism'],
  ]
  out += h2('Scoreboard Summary')
  out += `| Dimension | Status | Why | Fix |\n|---|---|---|---|\n`
  for (const [k,label] of order) {
    const c = sb?.[k] || ({ status: 'NA', why: '', fix: '' } as ScoreCell)
    out += `| ${label} | ${c.status || 'NA'} | ${(c.why||'').replace(/\n/g,' ')} | ${(c.fix||'—').replace(/\n/g,' ')} |\n`
  }
  out += '\n'

  // ——— Salvage / Bin (derived if not provided) ———
  if (!keep.length && !drop.length && !fix.length) {
    const inferredKeep = (hooks.slice(0,2).map(h => `Keep premium hook direction: “${h}”`))
    const inferredFix  = ['Compress entry to one screen', 'Add visible ladder & total winners copy']
    const inferredDrop = ['Drop receipt upload in favour of QR scan auto-entry']
    out += h2('Salvage / Bin (inferred)')
    out += `**Keep**\n${list(inferredKeep)}**Fix**\n${list(inferredFix)}**Drop**\n${list(inferredDrop)}`
  }

  return out.trim() + '\n'
}
