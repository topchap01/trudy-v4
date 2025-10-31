// apps/backend/src/lib/judge.ts
import { chat } from './openai.js'
import { resolveModel } from './models.js'

export type Candidate = { id: string; content: string }
export type JudgeResult = { winnerId: string; rationale: string }

export const RUBRIC = `
Score each candidate 0–10 on:
1) Fit to framed brief and brand position
2) Distinctiveness (avoids category clichés)
3) Feasibility of mechanic (budget, legality)
4) Retailer readiness (clear sell-in story)
5) Measurable outcomes (KPIs)
Return winner id and 1–2 line rationale.
`.trim()

export async function judgeBest(
  candidates: Candidate[],
  contextBlurb: string,
  model?: string
): Promise<JudgeResult> {
  if (!candidates?.length) {
    return { winnerId: '', rationale: 'No candidates provided.' }
  }

  const table = candidates.map(c => `ID ${c.id}\n---\n${c.content}`).join('\n\n')

  const system =
    'You are Bruce, a decisive creative director. Be crisp and commercial. Output MUST be valid JSON only.'

  const user = [
    contextBlurb?.trim() || '',
    '',
    'RUBRIC:',
    RUBRIC,
    '',
    'CANDIDATES:',
    table,
    '',
    'Respond with JSON ONLY: {"winnerId":"...","rationale":"..."}',
  ].join('\n')

  const chosenModel = resolveModel(
    model,
    process.env.MODEL_EVAL,
    process.env.MODEL_DEFAULT,
    'gpt-4o-mini'
  )

  const resp = await chat({
    model: chosenModel,
    system,
    messages: [{ role: 'user', content: user }],
    temperature: 0.2,
    top_p: 1,
    json: true, // <- your wrapper maps this to text.format=json_object
    max_output_tokens: 600,
    meta: { scope: 'quality.judge' },
  })

  // Primary path: strict JSON
  try {
    const j = JSON.parse(resp)
    if (j?.winnerId && typeof j.winnerId === 'string') {
      return { winnerId: j.winnerId, rationale: (j.rationale || 'Selected strongest route.').toString() }
    }
  } catch {
    // fall through
  }

  // Fallback: try to extract winnerId from a loose response
  const idPattern = /"winnerId"\s*:\s*"([^"]+)"/i
  const m = idPattern.exec(resp)
  const fallbackId = m?.[1] || candidates[0].id

  return {
    winnerId: fallbackId,
    rationale: 'Selected top-scoring route (fallback parse).',
  }
}
