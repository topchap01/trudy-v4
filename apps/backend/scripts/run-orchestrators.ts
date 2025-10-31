#!/usr/bin/env tsx
import process from 'node:process'
import { prisma } from '../src/db/prisma.js'
import { buildCampaignContext } from '../src/lib/context.js'
import { runEvaluate } from '../src/lib/orchestrator/evaluate.js'
import { runFraming, extractFramingMeta } from '../src/lib/orchestrator/framing.js'
import { runStrategist } from '../src/lib/orchestrator/strategist.js'
import { runSynthesis } from '../src/lib/orchestrator/synthesis.js'
import { runIdeation } from '../src/lib/orchestrator/ideation.js'
import { applyResearchOverrides, readResearchOverridesFromBrief } from '../src/lib/war-room-research.js'

type Stage = 'framing' | 'ideation' | 'evaluate' | 'strategist' | 'synthesis'
const STAGE_ORDER: Stage[] = ['framing', 'ideation', 'evaluate', 'strategist', 'synthesis']

function parseMaybeJson(value: any): any {
  if (!value) return null
  if (typeof value === 'string') {
    try { return JSON.parse(value) } catch { return null }
  }
  return typeof value === 'object' ? value : null
}

function extractPrimaryContent(row: any): string | null {
  if (!row) return null
  const direct = row.content
  if (typeof direct === 'string' && direct.trim()) return direct.trim()
  const params = parseMaybeJson(row.params) || row.params || null
  if (params && typeof params === 'object') {
    const candidates = [
      params?.result?.content,
      params?.content,
      params?.narrative,
      params?.output?.content,
      params?.data?.content,
      params?.value?.content,
      params?.text,
    ]
    for (const c of candidates) {
      if (typeof c === 'string' && c.trim()) return c.trim()
    }
  }
  return null
}

function extractMeta(row: any): any {
  if (!row) return null
  const params = parseMaybeJson(row.params) || row.params || null
  if (params && typeof params === 'object') {
    if (params.meta) return params.meta
    if (params.result?.meta) return params.result.meta
    if (params.result?.data?.meta) return params.result.data.meta
  }
  const meta = parseMaybeJson(row.meta)
  return meta || null
}

function safeJson(input: any): any {
  if (!input) return null
  if (typeof input === 'object') return input
  if (typeof input !== 'string') return null
  try { return JSON.parse(input) } catch { return null }
}

async function fetchOutputsAsc(campaignId: string, types: string[]) {
  return prisma.output.findMany({
    where: {
      OR: [
        { campaignId, type: { in: types } },
        { campaign: { id: campaignId }, type: { in: types } },
      ],
    },
    orderBy: { createdAt: 'asc' },
    select: { id: true, type: true, content: true, params: true, createdAt: true },
  })
}

async function runFramingStage(campaignId: string) {
  const campaign = await prisma.campaign.findUnique({
    where: { id: campaignId },
    include: { brief: true, outputs: true },
  })
  if (!campaign) throw new Error(`Campaign ${campaignId} not found`)

  const ctx = buildCampaignContext(campaign)
  const { content, meta } = await runFraming(ctx)

  const saved = await prisma.output.create({
    data: {
      campaignId,
      type: 'framingNarrative',
      prompt: 'framing',
      content,
      params: {
        meta: meta || null,
        codeVersion: 'framing.v2',
        kind: 'framing.v2',
      } as any,
    },
    select: { id: true },
  })

  console.log(`✅ framing -> output ${saved.id}`)
  return { content, meta }
}

async function runEvaluationStage(campaignId: string) {
  const campaign = await prisma.campaign.findUnique({
    where: { id: campaignId },
    include: { brief: true },
  })
  if (!campaign) throw new Error(`Campaign ${campaignId} not found`)

  const framingRows = await fetchOutputsAsc(campaignId, ['framingNarrative', 'framing'])
  const latestFraming = framingRows.at(-1)
  if (!latestFraming) {
    throw new Error('FRAMING_REQUIRED')
  }

  const priorFraming = extractPrimaryContent(latestFraming) || ''
  const priorFramingMeta = extractFramingMeta(latestFraming)
  const ctx = buildCampaignContext(campaign)
  const researchOverrides = readResearchOverridesFromBrief(campaign.brief)

  const harnessOut = await prisma.output.findFirst({
    where: { campaignId, type: 'ideationHarness' },
    orderBy: { createdAt: 'desc' },
  })
  const ideationHarness = harnessOut ? safeJson(harnessOut.content) : null

  const { content, meta } = await runEvaluate(ctx, {
    ruleFlex: 'KEEP',
    priorFraming,
    priorFramingMeta,
    researchOverrides,
  })

  if (meta) {
    meta.ideation = ideationHarness || null
  }

  const saved = await prisma.output.create({
    data: {
      campaign: { connect: { id: campaignId } },
      type: 'evaluationNarrative',
      prompt: '',
      content,
      params: {
        ...(meta || {}),
        codeVersion: 'v4-eval-prose-au-locked',
        kind: 'eval-prose-au',
      },
    },
    select: { id: true },
  })

  console.log(`✅ evaluate -> output ${saved.id}`)
  return { content, meta }
}

async function runIdeationStage(campaignId: string) {
  const campaign = await prisma.campaign.findUnique({
    where: { id: campaignId },
    include: { brief: true, outputs: true },
  })
  if (!campaign) throw new Error(`Campaign ${campaignId} not found`)

  const ctx = buildCampaignContext(campaign)
  const ideation = await runIdeation(ctx)

  const unboxedPayload = JSON.stringify(ideation.unboxed, null, 2)
  const harnessPayload = JSON.stringify(ideation.harness, null, 2)

  const unboxedSaved = await prisma.output.create({
    data: {
      campaignId,
      type: 'ideationUnboxed',
      content: unboxedPayload,
      params: { agents: ideation.unboxed.map((u) => u.agent) },
    },
    select: { id: true },
  })

  let harnessSavedId: string | null = null
  if (ideation.harness) {
    const harnessSaved = await prisma.output.create({
      data: {
        campaignId,
        type: 'ideationHarness',
        content: harnessPayload,
        params: { source: ideation.harness.sourceIdea || null },
      },
      select: { id: true },
    })
    harnessSavedId = harnessSaved.id
  }

  console.log(`✅ ideation -> outputs ${unboxedSaved.id}${harnessSavedId ? ` & ${harnessSavedId}` : ''}`)
  return ideation
}

async function runStrategistStage(campaignId: string) {
  const campaign = await prisma.campaign.findUnique({
    where: { id: campaignId },
    include: { brief: true, outputs: true },
  })
  if (!campaign) throw new Error(`Campaign ${campaignId} not found`)

  const ctx = buildCampaignContext(campaign)
  const researchOverrides = readResearchOverridesFromBrief(campaign.brief)

  const latestOf = (types: string[]) =>
    campaign.outputs
      .filter((o) => types.includes(o.type))
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
      .at(-1) || null

  const framingOut = latestOf(['framingNarrative', 'framing'])
  const evaluationOut = latestOf(['evaluationNarrative', 'evaluation'])
  if (!evaluationOut) throw new Error('EVALUATION_REQUIRED')
  const synthesisOut = latestOf(['synthesisNarrative', 'synthesis'])
  const opinionOut = latestOf(['opinionNarrative', 'opinion'])

  const framing = extractPrimaryContent(framingOut) || ''
  const evaluation = extractPrimaryContent(evaluationOut) || ''
  const synthesis = extractPrimaryContent(synthesisOut) || ''
  const opinion = extractPrimaryContent(opinionOut) || ''
  const evaluationMeta = extractMeta(evaluationOut) || {}
  const effectiveResearch = applyResearchOverrides(
    evaluationMeta?.ui?.research || evaluationMeta?.research || null,
    researchOverrides
  )
  if (effectiveResearch) {
    if (!evaluationMeta.ui) evaluationMeta.ui = {}
    evaluationMeta.ui.research = effectiveResearch
    evaluationMeta.research = effectiveResearch
  }
  const offerIQ = evaluationMeta?.ui?.offerIQ || evaluationMeta?.offerIQ || null

  const content = await runStrategist(ctx, {
    framing,
    evaluation,
    synthesis,
    opinion,
    evaluationMeta,
    offerIQ,
  })

  const saved = await prisma.output.create({
    data: {
      campaignId,
      type: 'strategistNarrative',
      prompt: 'strategist',
      content,
    },
    select: { id: true },
  })
  console.log(`✅ strategist -> output ${saved.id}`)
  return { content }
}

async function runSynthesisStage(campaignId: string) {
  const campaign = await prisma.campaign.findUnique({
    where: { id: campaignId },
    include: { brief: true, outputs: true },
  })
  if (!campaign) throw new Error(`Campaign ${campaignId} not found`)

  const ctx = buildCampaignContext(campaign)
  const researchOverrides = readResearchOverridesFromBrief(campaign.brief)

  const latestOf = (types: string[]) =>
    campaign.outputs
      .filter((o) => types.includes(o.type))
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
      .at(-1) || null

  const framingOut = latestOf(['framingNarrative', 'framing'])
  const evaluationOut = latestOf(['evaluationNarrative', 'evaluation'])
  if (!evaluationOut) throw new Error('EVALUATION_REQUIRED')
  const ideasOut = latestOf(['ideaRoutes', 'ideas'])
  const opinionOut = latestOf(['opinionNarrative', 'opinion'])
  const strategistOut = latestOf(['strategistNarrative', 'strategist'])

  const framing = extractPrimaryContent(framingOut) || ''
  const evaluation = extractPrimaryContent(evaluationOut) || ''
  const ideas = extractPrimaryContent(ideasOut) || ''
  const opinion = extractPrimaryContent(opinionOut) || ''
  const strategist = extractPrimaryContent(strategistOut) || ''
  const evaluationMeta = extractMeta(evaluationOut) || {}
  const effectiveResearch = applyResearchOverrides(
    evaluationMeta?.ui?.research || evaluationMeta?.research || null,
    researchOverrides
  )
  if (effectiveResearch) {
    if (!evaluationMeta.ui) evaluationMeta.ui = {}
    evaluationMeta.ui.research = effectiveResearch
    evaluationMeta.research = effectiveResearch
  }
  const offerIQ = evaluationMeta?.ui?.offerIQ || evaluationMeta?.offerIQ || null

  const content = await runSynthesis(ctx, {
    framing,
    evaluation,
    ideas: ideas || undefined,
    opinion,
    strategist: strategist || undefined,
    evaluationMeta,
    offerIQ,
  })

  const saved = await prisma.output.create({
    data: {
      campaignId,
      type: 'synthesisNarrative',
      prompt: 'synthesis',
      content,
    },
    select: { id: true },
  })
  console.log(`✅ synthesis -> output ${saved.id}`)
  return { content }
}

async function main() {
  const campaignId = process.argv[2]
  if (!campaignId) {
    console.error('Usage: pnpm --filter @trudy/backend exec tsx scripts/run-orchestrators.ts <campaignId> [evaluate strategist synthesis]')
    process.exit(1)
  }

  const requested = process.argv.slice(3).map((s) => s.toLowerCase()) as Stage[]
  const validRequested = requested.filter((stage): stage is Stage => STAGE_ORDER.includes(stage))
  const stages = validRequested.length ? STAGE_ORDER.filter((stage) => validRequested.includes(stage)) : STAGE_ORDER

  for (const stage of stages) {
    if (stage === 'framing') {
      await runFramingStage(campaignId)
    } else if (stage === 'ideation') {
      await runIdeationStage(campaignId)
    } else if (stage === 'evaluate') {
      await runEvaluationStage(campaignId)
    } else if (stage === 'strategist') {
      await runStrategistStage(campaignId)
    } else if (stage === 'synthesis') {
      await runSynthesisStage(campaignId)
    }
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch((err) => {
    console.error('❌ orchestrator run failed:', err instanceof Error ? err.message : err)
    prisma.$disconnect().finally(() => process.exit(1))
  })
