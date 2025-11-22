import { join } from 'node:path'
import { mkdirSync, writeFileSync, readdirSync, readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { prisma } from '../db/prisma.js'
import { chat } from './openai.js'

export type BriefIssue = {
  id: string
  field: string
  severity: 'BLOCKER' | 'WARN'
  details: string
  fix?: string
}

export type BriefReview = {
  summary: string
  issues: BriefIssue[]
  overall_status: 'BLOCKER' | 'WARN' | 'PASS'
  raw: string
  createdAt: string
}

type StoredReviewOptions = {
  campaignId: string
  review: BriefReview
  persist?: boolean
}

type IssueResponse = {
  issueId: string
  response: string
  resolvedAt: string
}

function makeIssueId(field: string, details: string) {
  return createHash('sha1').update(`${field || ''}||${details || ''}`).digest('hex').slice(0, 12)
}

function serialiseIssue(issue: any): BriefIssue {
  return {
    id:
      typeof issue?.id === 'string' && issue.id.trim()
        ? issue.id.trim()
        : makeIssueId(String(issue?.field || ''), String(issue?.details || '')),
    field: String(issue?.field || 'unspecified'),
    severity: issue?.severity === 'BLOCKER' ? 'BLOCKER' : 'WARN',
    details: String(issue?.details || '').trim(),
    fix: issue?.fix ? String(issue.fix).trim() : undefined,
  }
}

async function fetchBriefPayload(campaignId: string) {
  const campaign = await prisma.campaign.findUnique({
    where: { id: campaignId },
    include: { brief: true },
  })
  if (!campaign?.brief) {
    throw Object.assign(new Error(`Campaign ${campaignId} missing brief`), { status: 404 })
  }
  return {
    meta: {
      campaignId: campaign.id,
      title: campaign.title,
      brand: campaign.clientName,
      market: campaign.market,
      category: campaign.category,
    },
    spec: campaign.brief.parsedJson || {},
    rawText: campaign.brief.rawText || '',
  }
}

function buildBriefPrompt(payload: any) {
  return [
    'You are Trudy’s Brief QA director. Review the structured JSON brief to ensure it contains the required promotional details before the orchestrator runs.',
    'Check especially for:',
    '- reward_posture vs actual mechanic (cashback, GWP, TMF, prize).',
    '- guaranteed value details (amount, cap, timing). Flag OPEN liability if there is no cap/fund/eligibility filter.',
    '- hero overlay counts vs copy (e.g., heroPrizeCount vs text).',
    '- runner tiers only when the promo is prize-led.',
    '- KPI/measurement fields populated (no generic “sell more”).',
    '- retailer / channel context provided.',
    '- IP/occasion alignment (if hero references IP but spec lacks details).',
    '- Hook/mechanic copy mentioning elements missing from spec (e.g., cashback mentioned in copy but cashback block empty).',
    'Return JSON ONLY: { "summary": "...", "issues": [{ "field": "...", "severity": "BLOCKER|WARN", "details": "...", "fix": "..." }], "overall_status": "BLOCKER|WARN|PASS" }',
    'Only mark PASS when no blockers and the brief is ready for evaluate.',
    '',
    JSON.stringify(payload, null, 2),
  ].join('\n')
}

export async function runBriefQAReview(campaignId: string): Promise<BriefReview> {
  const payload = await fetchBriefPayload(campaignId)
  const response = await chat({
    model: process.env.GPT_BRIEF_REVIEW_MODEL || 'gpt-5.1',
    system: 'Trudy Brief QA — output JSON only.',
    messages: [{ role: 'user', content: buildBriefPrompt(payload) }],
    temperature: 0.2,
    top_p: 0.7,
    max_output_tokens: 2000,
    json: true,
    meta: { scope: 'brief.review', campaignId },
  })

  let parsed: BriefReview
  try {
    const obj = JSON.parse(response || '{}')
    parsed = {
      summary: obj.summary || '',
      issues: Array.isArray(obj.issues) ? obj.issues.map(serialiseIssue) : [],
      overall_status: ['BLOCKER', 'WARN', 'PASS'].includes(obj.overall_status) ? obj.overall_status : 'WARN',
      raw: response || '',
      createdAt: new Date().toISOString(),
    }
  } catch (err) {
    console.error('Failed to parse GPT brief review, saving raw text', err)
    parsed = {
      summary: 'Parse failure',
      issues: [],
      overall_status: 'BLOCKER',
      raw: response || '',
      createdAt: new Date().toISOString(),
    }
  }

  return parsed
}

export function persistBriefReview({ campaignId, review, persist = true }: StoredReviewOptions) {
  if (!persist) return null
  const dir = join(process.cwd(), 'storage', 'brief-reviews', campaignId)
  mkdirSync(dir, { recursive: true })
  const filePath = join(dir, `review-${review.createdAt.replace(/[:.]/g, '-')}.json`)
  writeFileSync(filePath, JSON.stringify(review, null, 2), 'utf8')
  return filePath
}

export function readLatestBriefReview(campaignId: string): BriefReview | null {
  const dir = join(process.cwd(), 'storage', 'brief-reviews', campaignId)
  try {
    const files = readdirSync(dir)
      .filter((file) => file.endsWith('.json'))
      .sort()
    const latest = files.at(-1)
    if (!latest) return null
    const payload = JSON.parse(readFileSync(join(dir, latest), 'utf8'))
    return payload as BriefReview
  } catch (err) {
    return null
  }
}

function responsesPath(campaignId: string) {
  return join(process.cwd(), 'storage', 'brief-reviews', campaignId, 'responses.json')
}

function loadResponsesMap(campaignId: string): Record<string, IssueResponse> {
  try {
    const file = readFileSync(responsesPath(campaignId), 'utf8')
    const data = JSON.parse(file)
    if (Array.isArray(data)) {
      return data.reduce<Record<string, IssueResponse>>((acc, entry) => {
        if (entry && typeof entry.issueId === 'string') {
          acc[entry.issueId] = {
            issueId: entry.issueId,
            response: String(entry.response || '').trim(),
            resolvedAt: entry.resolvedAt || new Date().toISOString(),
          }
        }
        return acc
      }, {})
    }
    if (data && typeof data === 'object') {
      return Object.entries(data).reduce<Record<string, IssueResponse>>((acc, [key, value]) => {
        const entry = value as any
        acc[key] = {
          issueId: key,
          response: String(entry?.response || '').trim(),
          resolvedAt: entry?.resolvedAt || new Date().toISOString(),
        }
        return acc
      }, {})
    }
  } catch {
    // ignore
  }
  return {}
}

function persistResponsesMap(campaignId: string, map: Record<string, IssueResponse>) {
  const dir = join(process.cwd(), 'storage', 'brief-reviews', campaignId)
  mkdirSync(dir, { recursive: true })
  writeFileSync(responsesPath(campaignId), JSON.stringify(map, null, 2), 'utf8')
}

export function readBriefQAResponses(campaignId: string): IssueResponse[] {
  const map = loadResponsesMap(campaignId)
  return Object.values(map).sort((a, b) => {
    const at = new Date(a.resolvedAt).getTime()
    const bt = new Date(b.resolvedAt).getTime()
    return at - bt
  })
}

export function writeBriefQAResponse(campaignId: string, issueId: string, response: string | null) {
  if (!issueId) return null
  const trimmed = (response || '').trim()
  const map = loadResponsesMap(campaignId)
  if (!trimmed) {
    if (map[issueId]) {
      delete map[issueId]
      persistResponsesMap(campaignId, map)
    }
    return null
  }

  map[issueId] = {
    issueId,
    response: trimmed,
    resolvedAt: new Date().toISOString(),
  }
  persistResponsesMap(campaignId, map)
  return map[issueId]
}
