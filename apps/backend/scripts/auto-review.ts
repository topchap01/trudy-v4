#!/usr/bin/env tsx
import process from 'node:process'
import { writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import readline from 'node:readline/promises'
import { stdin as input, stdout as output } from 'node:process'
import { runEvaluate } from '../src/lib/orchestrator/evaluate.js'
import { collectExportSnapshot } from '../src/export/snapshot.js'
import { renderClientDeck } from '../src/export/render-html.js'
import { runJudge } from '../src/lib/orchestrator/judge.js'
import { proofreadHtml } from '../src/lib/proofreader.js'
import { buildCampaignContext } from '../src/lib/context.js'
import { prisma } from '../src/db/prisma.js'
import { chat } from '../src/lib/openai.js'
import { runBriefQAReview, persistBriefReview } from '../src/lib/brief-qa.js'
import type { ExportOptions } from '../src/export/types.js'
import { extractFramingMeta } from '../src/lib/orchestrator/framing.js'
import { readResearchOverridesFromBrief } from '../src/lib/war-room-research.js'

type Severity = 'CRITICAL' | 'MAJOR' | 'MINOR' | 'NOTE'
type IssueCategory = 'TEMPLATE_BUG' | 'DATA_GAP' | 'CATEGORY_MISMATCH' | 'STYLE_NIT'
type GPTIssue = { title: string; severity: Severity; details: string; category: IssueCategory; auto_fix?: boolean }
type GPTReview = {
  summary: string
  issues: GPTIssue[]
  overall_status: Severity
  raw: string
  createdAt: string
}

const SEVERITY_ORDER: Record<Severity, number> = {
  CRITICAL: 3,
  MAJOR: 2,
  MINOR: 1,
  NOTE: 0,
}

const MAX_ITERATIONS = Number(process.env.AUTO_REVIEW_MAX_ITER || 5)
const REVIEW_MODEL = process.env.GPT_REVIEW_MODEL || 'gpt-5.1'
const BLOCKING_CATEGORIES: IssueCategory[] = ['TEMPLATE_BUG']
const BEAUTY_MAX_ITERS = Number(process.env.AUTO_REVIEW_BEAUTY_MAX_ITERS || 2)

async function main() {
  const campaignId = process.argv[2]
  if (!campaignId) {
    console.error('Usage: pnpm --filter @trudy/backend exec tsx scripts/auto-review.ts <campaignId>')
    process.exit(1)
  }

  const campaign = await prisma.campaign.findUnique({
    where: { id: campaignId },
    include: { brief: true },
  })
  if (!campaign) {
    console.error(`Campaign ${campaignId} not found`)
    process.exit(1)
  }

  if (process.env.AUTO_REVIEW_SKIP_BRIEF_QA !== '1') {
    console.log('▶️ running brief QA gate…')
    const briefReview = await runBriefQAReview(campaignId)
    const savedPath = persistBriefReview({ campaignId, review: briefReview })
    if (savedPath) {
      console.log('✅ Brief QA saved to', savedPath)
    }
    if (briefReview.issues.length) {
      console.log('\nBrief QA issues:')
      for (const issue of briefReview.issues) {
        console.log(`- [${issue.severity}] ${issue.field}: ${issue.details}${issue.fix ? ` — Fix: ${issue.fix}` : ''}`)
      }
    } else {
      console.log('Brief QA: no issues flagged.')
    }
    if (briefReview.overall_status === 'BLOCKER') {
      console.error('⛔ Brief QA flagged blockers. Resolve the brief before running auto-review.')
      process.exit(1)
    }
  } else {
    console.log('⚠️ Skipping brief QA gate (AUTO_REVIEW_SKIP_BRIEF_QA=1).')
  }

  const context = buildCampaignContext(campaign)
  const framingRows = await prisma.output.findMany({
    where: { campaignId, type: { in: ['framingNarrative', 'framing'] } },
    orderBy: { createdAt: 'asc' },
  })
  const priorFraming = framingRows.at(-1)?.content || ''
  const priorFramingMeta = framingRows.at(-1) ? extractFramingMeta(framingRows.at(-1)) : null

  const rl = readline.createInterface({ input, output })
  let blockingPersisted = false

  for (let iteration = 1; iteration <= MAX_ITERATIONS; iteration++) {
    console.log(`\n=== Iteration ${iteration} ===`)
    console.log('▶️ running evaluation…')
    await runEvaluate(context, {
      ruleFlex: 'KEEP',
      priorFraming,
      priorFramingMeta,
      researchOverrides: readResearchOverridesFromBrief(campaign.brief),
    })

    console.log('▶️ generating export…')
    const exportOptions: ExportOptions = { format: 'HTML', sections: {}, theme: {} } as any
    const snapshot = await collectExportSnapshot(campaignId, exportOptions.sections)
    const judgeVerdict = await runJudge(snapshot.context, {
      useLLM: (process.env.JUDGE_LLM_DEFAULT === '1') || false,
      baselineResearch: snapshot.framingMeta?.research ?? null,
      inputs: {
        framing: snapshot.judgeInputs.framing,
        evaluation: snapshot.judgeInputs.evaluation,
        opinion: snapshot.judgeInputs.opinion,
        strategist: snapshot.judgeInputs.strategist,
        exportSummary: '',
      },
    })
    let { html } = renderClientDeck(snapshot, {
      sections: {},
      theme: {},
      judgeVerdict,
      timestamp: new Date().toISOString(),
    })
    const tmpDir = join(process.cwd(), 'storage', 'auto-reviews', campaignId)
    mkdirSync(tmpDir, { recursive: true })
    html = await runBeautyImprovements(html, campaignId, iteration, tmpDir)
    html = await proofreadHtml(html, { scope: 'export', campaignId })
    const exportPath = join(tmpDir, `export-iter${iteration}.html`)
    writeFileSync(exportPath, html, 'utf8')

    console.log('▶️ sending export to GPT reviewer…')
    const structuralReview = await runStructuredReview(html, campaignId)
    const proofReview = await runProofingReview(html, campaignId)

    const structuralPath = join(tmpDir, `review-iter${iteration}-structural.json`)
    writeFileSync(structuralPath, JSON.stringify(structuralReview, null, 2), 'utf8')
    console.log('✅ Structural review saved to', structuralPath)

    const proofPath = join(tmpDir, `review-iter${iteration}-proof.json`)
    writeFileSync(proofPath, JSON.stringify(proofReview, null, 2), 'utf8')
    console.log('✅ Proofing review saved to', proofPath)

    const blockingStructural = structuralReview.issues.filter(isBlockingIssue)
    const blockingProof = proofReview.issues.filter(isBlockingIssue)
    const hasBlocking = blockingStructural.length > 0 || blockingProof.length > 0

    if (!hasBlocking) {
      if (structuralReview.issues.length) {
        console.log('\nℹ️ Structural warnings (non-blocking):')
        for (const issue of structuralReview.issues) {
          console.log(`- [${issue.severity}] (${issue.category}) ${issue.title}: ${issue.details}`)
        }
      }
      if (proofReview.issues.length) {
        console.log('\nℹ️ Proofing warnings (non-blocking):')
        for (const issue of proofReview.issues) {
          console.log(`- [${issue.severity}] (${issue.category}) ${issue.title}: ${issue.details}`)
        }
      }
      console.log('🎉 Remaining issues are data gaps/category notes only. Stopping loop with warnings saved.')
      blockingPersisted = false
      break
    }

    blockingPersisted = true
    if (structuralReview.issues.length) {
      console.log('\n⚠️ Structural issues:')
      for (const issue of structuralReview.issues) {
        console.log(`- [${issue.severity}] (${issue.category}) ${issue.title}: ${issue.details}`)
      }
    }
    if (proofReview.issues.length) {
      console.log('\n⚠️ Proofing issues:')
      for (const issue of proofReview.issues) {
        console.log(`- [${issue.severity}] (${issue.category}) ${issue.title}: ${issue.details}`)
      }
    }

    if (iteration === MAX_ITERATIONS) {
      console.log('\nReached max iterations; exiting with outstanding issues.')
      process.exitCode = 1
      break
    }

    console.log('\nApply fixes and press Enter to rerun, or Ctrl+C to abort.')
    await rl.question('')
  }

  rl.close()
  if (blockingPersisted) {
    process.exitCode = 1
  }
}

main().catch((err) => {
  console.error('auto-review failed', err)
  process.exit(1)
})

function parseReviewResponse(response: string | null | undefined): GPTReview {
  const fallback: GPTReview = {
    summary: 'Parse failure',
    issues: [],
    overall_status: 'NOTE',
    raw: response || '',
    createdAt: new Date().toISOString(),
  }
  if (!response) return fallback
  try {
    const obj = JSON.parse(response || '{}')
    return {
      summary: obj.summary || '',
      issues: Array.isArray(obj.issues)
        ? obj.issues.map((issue: any) => ({
            title: String(issue?.title || 'Untitled'),
            severity: ['CRITICAL', 'MAJOR', 'MINOR', 'NOTE'].includes(issue?.severity)
              ? (issue.severity as Severity)
              : 'NOTE',
            details: String(issue?.details || '').trim(),
            category: ['TEMPLATE_BUG', 'DATA_GAP', 'CATEGORY_MISMATCH', 'STYLE_NIT'].includes(issue?.category)
              ? (issue.category as IssueCategory)
              : 'STYLE_NIT',
            auto_fix: Boolean(issue?.auto_fix),
          }))
        : [],
      overall_status: ['CRITICAL', 'MAJOR', 'MINOR', 'NOTE'].includes(obj.overall_status)
        ? (obj.overall_status as Severity)
        : 'NOTE',
      raw: response || '',
      createdAt: new Date().toISOString(),
    }
  } catch (err) {
    console.error('Failed to parse GPT response, saving raw text', err)
    return fallback
  }
}

async function runStructuredReview(html: string, campaignId: string): Promise<GPTReview> {
  const prompt = [
    'You are auditing a promotional marketing export for regressions seen in Guinness, ASUS, McGuigan, and Wicked Sister campaigns.',
    'Report only issues that would make a marketer lose trust. Focus on:',
    '1) State coherence — mechanic/ops/measurement must all reflect the same offer state (e.g., receipt upload removal shows everywhere, cadence claims match ladder).',
    '2) Ladder vs story — hero/runner counts must match OfferIQ numbers AND appear in hooks/pack/staff lines (include cadence/guaranteed reward language when promised).',
    '3) Runner-up theming — runner tiers should reflect the brand/occasion/IP (no orphan cash cards unless justified, e.g., Mother’s Day requires McGuigan/Ghan cues).',
    '4) Trade lane — trade sections may only suggest staff/store incentives, never consumer discounts or unlimited per-purchase giveaways.',
    '5) Hypothesis closure — if hypotheses such as needsGuaranteedReward are NOT_MET, the prose must explicitly explain why; flag when missing.',
    '6) Zombie copy — flag text that clearly belongs to another promo (double passes, personalization, cinema escape, “flow”) when it contradicts this brand.',
    'For every issue set "category": "TEMPLATE_BUG", "DATA_GAP", "CATEGORY_MISMATCH", or "STYLE_NIT" as defined:',
    '- TEMPLATE_BUG: export/prompt wiring bug we can fix in code/templates.',
    '- DATA_GAP: missing brief/spec info (needs humans).',
    '- CATEGORY_MISMATCH: wrong heuristics (e.g., FMCG KPI in telco).',
    '- STYLE_NIT: minor tone tweaks.',
    'Output ONLY JSON matching { "summary": "short", "issues": [{ "title": "...", "severity": "CRITICAL|MAJOR|MINOR|NOTE", "category": "…", "details": "..." }], "overall_status": "CRITICAL|MAJOR|MINOR|NOTE" }. Ignore spelling/polish.',
    '',
    html,
  ].join('\n')
  const response = await chat({
    model: REVIEW_MODEL,
    system: 'Promo systems auditor (Guinness/ASUS/McGuigan/Wicked Sister regressions) — output JSON only.',
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.15,
    top_p: 0.6,
    meta: { scope: 'auto-review.structural', campaignId },
    max_output_tokens: 1500,
    json: true,
  })
  return parseReviewResponse(response)
}

async function runProofingReview(html: string, campaignId: string): Promise<GPTReview> {
  const prompt = [
    'You are a fact-checker for promotional exports. Flag contradictions, impossible statements, math errors, or nonsense phrasing that would embarrass us in front of a client.',
    'Examples: total winners not matching hero+runner counts, cadence claims that don’t match the ladder, measuring receipt uploads when they were removed, pack/staff lines using internal words like “flow,” typo’d brand names, date/math inconsistencies.',
    'Ignore copy polish; only report factual/procedural coherence issues.',
    'For each issue set category as TEMPLATE_BUG (bad wiring), DATA_GAP (missing facts), CATEGORY_MISMATCH (wrong domain language), or STYLE_NIT (minor wording).',
    'Output ONLY JSON matching { "summary": "short", "issues": [{ "title": "...", "severity": "CRITICAL|MAJOR|MINOR|NOTE", "category": "...", "details": "..." }], "overall_status": "CRITICAL|MAJOR|MINOR|NOTE" }.',
    '',
    html,
  ].join('\n')
  const response = await chat({
    model: REVIEW_MODEL,
    system: 'Promo proofreader for contradictions/math — output JSON only.',
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.1,
    top_p: 0.6,
    meta: { scope: 'auto-review.proof', campaignId },
    max_output_tokens: 1200,
    json: true,
  })
  return parseReviewResponse(response)
}

async function runBeautyImprovements(html: string, campaignId: string, iteration: number, tmpDir: string): Promise<string> {
  if (BEAUTY_MAX_ITERS <= 0) return html
  let current = html
  for (let pass = 1; pass <= BEAUTY_MAX_ITERS; pass++) {
    console.log(`▶️ beauty review pass ${pass}…`)
    const review = await runBeautyReview(current, campaignId)
    const reviewPath = join(tmpDir, `review-iter${iteration}-beauty-pass${pass}.json`)
    writeFileSync(reviewPath, JSON.stringify(review, null, 2), 'utf8')
    console.log('✅ Beauty review saved to', reviewPath)

    const blockers = review.issues.filter(isBeautyBlocking)
    if (!blockers.length) {
      console.log('✨ Beauty reviewers happy — no auto fixes needed.')
      break
    }

    console.log(`🎯 Applying ${blockers.length} beauty fixes`)
    const rewritten = await runBeautyRewrite(current, blockers, campaignId)
    if (!rewritten) {
      console.warn('⚠️ Beauty rewrite failed; keeping previous copy.')
      break
    }
    current = rewritten
    const improvedPath = join(tmpDir, `export-iter${iteration}-beauty-pass${pass}.html`)
    writeFileSync(improvedPath, current, 'utf8')
    console.log('✅ Beauty pass HTML saved to', improvedPath)
  }
  return current
}

async function runBeautyReview(html: string, campaignId: string): Promise<GPTReview> {
  const prompt = [
    'You are the creative director reviewing a promotional deck generated by Trudy.',
    'Critique it on these axes: narrative arc, copy craft, deck flow, brand/category fit, client impact, tone.',
    'Return JSON ONLY:',
    '{ "summary": "...", "scores": { "narrative_arc": 0-10, "copy_craft": 0-10, "deck_flow": 0-10, "brand_fit": 0-10, "client_impact": 0-10, "tone": 0-10 }, "issues": [{ "title": "...", "severity": "CRITICAL|MAJOR|MINOR|NOTE", "category": "TEMPLATE_BUG|DATA_GAP|CATEGORY_MISMATCH|STYLE_NIT", "auto_fix": true|false, "details": "..." }], "overall_status": "IMPROVE|PASS|FAIL" }',
    'Guidelines:',
    '- Titles should be benefit-led headlines, not labels.',
    '- Exec summary should be 80-120 words with a killer lead line.',
    '- Hooks must explicitly sell cadence/value.',
    '- Remove zombie FMCG phrasing when category is different.',
    '- Flag only issues that materially reduce polish.',
    'Mark auto_fix true only when the issue can be fixed by rewriting copy/layout without new business inputs.',
    '',
    html,
  ].join('\n')
  const response = await chat({
    model: REVIEW_MODEL,
    system: 'Trudy creative director — output JSON only.',
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.2,
    top_p: 0.7,
    meta: { scope: 'auto-review.beauty', campaignId },
    max_output_tokens: 1500,
    json: true,
  })
  return parseReviewResponse(response)
}

async function runBeautyRewrite(html: string, issues: GPTIssue[], campaignId: string): Promise<string | null> {
  if (!issues.length) return html
  const issueSummary = issues.map((issue, idx) => ({
    id: idx + 1,
    title: issue.title,
    details: issue.details,
    severity: issue.severity,
  }))
  const prompt = [
    'You are Trudy’s deck beautifier. Improve the following export HTML so it addresses the numbered issues.',
    'Rules:',
    '- Preserve the existing HTML structure and data bindings.',
    '- Rewrite copy/headings where needed. Keep tone confident, senior-agency.',
    '- Do not remove required sections; tighten and clarify.',
    '- Return ONLY HTML; no commentary.',
    '',
    `Issues to fix:\n${JSON.stringify(issueSummary, null, 2)}`,
    '',
    html,
  ].join('\n')
  const response = await chat({
    model: REVIEW_MODEL,
    system: 'Deck beautifier — return HTML only.',
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.2,
    top_p: 0.7,
    meta: { scope: 'auto-review.beauty.rewrite', campaignId },
    max_output_tokens: 4000,
  })
  if (!response) return null
  const trimmed = response.trim()
  if (!trimmed) return null
  return trimmed
}
function isBlockingIssue(issue: GPTIssue): boolean {
  if (!issue) return false
  if (!BLOCKING_CATEGORIES.includes(issue.category || 'STYLE_NIT')) return false
  return SEVERITY_ORDER[issue.severity] >= SEVERITY_ORDER.MAJOR
}

function isBeautyBlocking(issue: GPTIssue): boolean {
  if (!issue?.auto_fix) return false
  return SEVERITY_ORDER[issue.severity] >= SEVERITY_ORDER.MAJOR
}
