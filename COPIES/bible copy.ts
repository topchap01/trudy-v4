// apps/backend/src/lib/bible.ts
// Central place for voice + prompt specs used across Evaluate/Create.

export const VOICE = {
  ferrierSuit: {
    name: 'Ferrier+Suit',
    tone:
      'Crisp, commercially astute, behaviour-led. Dry wit allowed. No clichés, no marketing bingo, no hedging.',
    pattern:
      'Short paragraphs. Specific observations. Retailer-real. Name the trade-offs plainly.',
  },
  consultant: {
    name: 'Consultant',
    tone: 'Clear, senior, concise.',
    pattern: 'Short paragraphs, no filler, decision-oriented.',
  },
} as const

// ——— JSON spec returned by the strategist (model) before we compose prose.
// Keep it compact enough for the model; we’ll compose the long narrative in copydesk.ts.
export const EVAL_DIAGNOSIS_JSON_SPEC = `
Return a single JSON object with:
{
  "stance": "DEFENSIVE|NEUTRAL|AGGRESSIVE",
  "brand_position": "string",
  "creative_hook_current": "string|null",
  "creative_hook_better": "string|null",
  "mechanic": "string|null",
  "retailers": ["Coles","Woolworths", "..."],
  "prizes": {
    "hero": "string|null",
    "hero_count": number|null,
    "runner_ups": ["string", "..."]
  },
  "friction": "LOW|MEDIUM|HIGH|null",
  "banned_mechanics": ["string", "..."],

  "what_worked": ["short bullet", "..."],
  "what_didnt": ["short bullet", "..."],
  "retailer_ops": { "staff_explainable": true, "auditability":"LOW|MEDIUM|HIGH", "stock_risk":"LOW|MEDIUM|HIGH" },

  "odds_shape": "LADDER|HERO_ONLY|HYBRID|null",
  "frequency_design": "NONE|WEEKLY|INSTANT|WEEKLY+INSTANT|null",
  "data_value_exchange": "NONE|LIGHT|RICH|null",

  "risks": ["short bullet", "..."],
  "fixes": ["short, specific fix", "..."],

  "judgement": {
    "verdict": "GO|GO_WITH_CONDITIONS|NO_GO",
    "because": "one crisp sentence"
  }
}
`.trim()

// ——— Prose composer prompts ———

// Standard Evaluation (tight, premium) — no tables, no matrices.
// The export route renders the only scoreboard.
export const EVAL_COMPOSE_PROMPT_FERRIER = `
Write an evaluation memo in Ferrier+Suit voice. No tables. No matrices. No "Scoreboard" section.
Use only paragraphs and short bullet lists. Be specific and retailer-real.

Structure exactly:

1) Verdict (one breath)
- One commercial headline decision the client can act on.

2) What’s strong (3–5 bullets)
- Behavioural levers (attainability, immediacy, belonging, mastery, ritual).
- Retailer reality wins (staff explain in 5s, zero burden, pre-packed POS).
- Odds/perception (ladder vs hero-only) and why shoppers believe it.

3) What’s weak (3–6 bullets)
- Name the frictions, compliance flags, ops risks, prize shape gaps.
- Avoid generic wording; be concrete and short.

4) Where it breaks in the real world
- Store execution, compliance, fulfilment. Name the failure modes and the likely emails we’d get.

5) Rebuild: why it works now
- One paragraph that aligns: hook, value/ladder, cadence (weekly/instant), friction (one screen), POS story, and CRM value.
- Don’t restate the entire plan; make the case for the change.

Rules:
- Avoid headings like "Scoreboard", "Matrix", or any table syntax.
- Do not invent demographics.
- Numbers as ranges where useful (e.g., 6–9%).
- Never ask questions to the client; make the call and propose fixes.
`.trim()

// Super Evaluation — same structure but deeper, longer, still no tables.
export const SUPER_EVAL_COMPOSE_PROMPT_FERRIER = `
Write a deeper evaluation memo in Ferrier+Suit voice. No tables. No matrices.
Lean on framing insights and odds/perception science, but keep it readable.

Structure exactly:

1) Verdict (one breath)

2) What we learned from the category and framing (3–6 bullets)
- Pull directly on the category dynamics & competitor norms (from framing).
- Anchor any claims in store reality (space, compliance, traffic intent).

3) What’s strong (4–6 bullets)
- Behavioural levers and why they’ll move the needle here.
- Retailer reality (5s staff script, zero adjudication).
- Odds perception and the prize/value architecture.

4) What’s weak / where it breaks (4–8 bullets)
- Friction, edge cases, compliance and ABAC/RSA sensitivities (AU default).
- Staff behaviour, POS clarity, fulfilment failure modes.

5) Rebuild: line-by-line case (short paragraphs)
- Hook (tighten; premium; brand-locked if right).
- Prize/value architecture (hero + ladder, weekly cadence/instant wins, quantities at order-of-magnitude).
- Mechanic in a five-second staff script.
- Frequency loop and CRM value (data we actually keep and why it’s worth it).
- Retailer story (what the buyer gets and what they don’t have to do).

Rules:
- No tables. No matrices. No "Scoreboard" headings.
- Short paragraphs. Specific. No hedging.
- Numbers as bands/ranges; don’t claim precision we don’t have.
`.trim()
