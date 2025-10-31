// apps/backend/src/lib/bible.ts
// Evaluation “bible”: strict JSON contract for the strategist step.
// Keep language plain, Australian, and client-ready. No tables, no matrices.

export const EVAL_DIAGNOSIS_JSON_SPEC = `
You must return ONE JSON object ONLY. No preamble, no markdown, no commentary.

Context:
- Audience: Australian brand, shopper, and retail stakeholders.
- Tone: direct, premium, no clichés (“friction”, “prize ladder”). Use plain words like “hassle”, “chances”, “mix of winners”, “on pack”, “in-store”, “POS”.
- The composer will turn this JSON into flowing prose; keep fields tight and specific.

Required top-level fields (all optionality MUST be honoured, but include your best effort):
{
  "stance": string,                           // strategist stance e.g. "BALANCED" | "BOLD" | "CAUTIOUS"
  "brand_position": string,                   // e.g. "LEADER" | "FOLLOWER" | "DISRUPTOR"
  "creative_hook_current": string | null,     // current line on the work/brief
  "creative_hook_better": string | null,      // your sharper, shorter premium line (2–6 words) or null
  "mechanic": string | null,                  // one-liner, e.g. "Buy, scan QR, auto-entry"
  "retailers": string[] | null,               // names where relevant (e.g. "Coles", "BWS")
  "prizes": {                                 // how the win feels
    "hero": string | null,                    // e.g. "Trip for two to Tokyo"
    "hero_count": number | null,              // integer if known
    "hero_value_band": string | null,         // e.g. "$5k–$10k"
    "runner_ups": string[] | null             // titles or shorthand, can be []
  },
  "friction": string | null,                  // free text hints re: hassle (e.g. "receipt upload", "one screen")
  "retailer_ops": {                           // how stores are affected
    "staff_explainable": boolean | null,      // can staff explain it in ~5s?
    "stock_risk": "low"|"medium"|"high"|"unknown" | null,
    "auditability": "low"|"medium"|"high"|"unknown" | null,
    "central_adjudication": boolean | null    // winners handled centrally (preferred)
  },
  "what_worked": string[],                    // short observations (1 line each)
  "what_didnt": string[],                     // short observations (1 line each)
  "risks": string[],                          // e.g. "people drop at proof upload"
  "fixes": string[],                          // practical changes in plain words

  // Narrative drivers for the composer (use tight, specific lines)
  "ferrier_bets": string[],                   // behavioural bets (cut hassle, habit, social proof, etc.)
  "droga_bets": string[],                     // fame bets (two-word line, talkability, distinctive assets)

  // PromoTrack
  "promotrack_applied": string[],             // play names actually leaned on (use canonical names if provided)
  "promotrack_rejected": string[],            // plays considered then parked (with a 2–5 word reason appended, if useful)

  // Judgement drives verdict tone in the composer
  "judgement": {
    "verdict": "GO" | "GO_WITH_CONDITIONS" | "NO-GO",
    "because": string                        // one-breath reason, one sentence
  },

  // Optional rebuild spec. Keep lines short; composer will render.
  "rebuild_spec": {
    "hook_line": string | null,
    "hooks": string[] | null,                 // alternates, short premium lines
    "entry_path": string | null,              // plain, e.g. "QR → one quick mobile screen → auto-entry"
    "cadence": string | null,                 // e.g. "Weekly prize moments + final hero"
    "ladder": any | null,                     // ignore structure; composer will describe as “mix of winners”
    "fulfilment": string | null,              // how winners are handled; keep stores out
    "compliance_line": string | null,         // RSA/ABAC or standard guardrails
    "staff_script": string | null             // 5-second in-store script
  },

  // Optionally propose one or more bolder takes (rule-bending)
  "bold_variants": [
    {
      "name": string | null,                  // e.g. "Two-word fame line + instant-win wall"
      "idea": string | null,
      "hypothesis": string | null,
      "risks": string[] | null,
      "mitigations": string[] | null,
      "measures": string[] | null,            // how we’ll judge it (metrics/observables)
      "exit": string | null                   // when to pull the pin
    }
  ]
}

// Rules:
- Keep strings concise. Prefer one sentence per item.
- Stay Australian in wording. Avoid buzzwords where a plain phrase works.
- If a field is unknown, set it to null or [] as appropriate.
- Do not output headings, markdown, or commentary — return JSON only.

// Example (illustrative only):
{
  "stance": "BALANCED",
  "brand_position": "FOLLOWER",
  "creative_hook_current": "Win the ultimate summer escape",
  "creative_hook_better": "Own Your Summer",
  "mechanic": "Buy any 2, scan the QR, auto-entry",
  "retailers": ["Coles", "Woolworths"],
  "prizes": {
    "hero": "Beach house weekender",
    "hero_count": 3,
    "hero_value_band": "$5k–$10k",
    "runner_ups": ["$100 gift cards", "Cooler bags"]
  },
  "friction": "Receipt upload mentioned; prefer one quick mobile screen",
  "retailer_ops": {
    "staff_explainable": true,
    "stock_risk": "low",
    "auditability": "high",
    "central_adjudication": true
  },
  "what_worked": ["Seasonal timing is spot on", "Brand assets are recognisable on pack"],
  "what_didnt": ["Line is long and functional", "Chances feel thin without more winners"],
  "risks": ["People will bail at proof step", "Travel fulfilment can drag if unclear"],
  "fixes": ["Lose proof upload", "Add instant wins and weekly draws", "Publish total number of winners"],

  "ferrier_bets": ["Cut the hassle to one clear mobile action", "Show a weekly rhythm so there’s a reason to come back"],
  "droga_bets": ["Two-word fame line on pack", "Make the moment worth filming"],

  "promotrack_applied": ["Weekly micro-win cadence", "Central adjudication", "Pre-packed POS kits"],
  "promotrack_rejected": ["Price-off lookalike — wrong signal", "Receipt upload — too much hassle"],

  "judgement": { "verdict": "GO_WITH_CONDITIONS", "because": "Great seasonal frame; tighten the line and make entry fast, with more visible winners." },

  "rebuild_spec": {
    "hook_line": "Own Your Summer",
    "hooks": ["Own Your Summer", "Make Summer Yours"],
    "entry_path": "QR → one quick mobile screen → auto-entry",
    "cadence": "Weekly prize moments plus a final hero",
    "ladder": {},
    "fulfilment": "Winners contacted centrally; no store adjudication",
    "compliance_line": "Standard trade promo; if alcohol present, age gate and no consumption cues",
    "staff_script": "Scan the QR on the pack and you’re in — takes 20 seconds."
  },

  "bold_variants": [
    {
      "name": "Two-word fame line + instant-win wall",
      "idea": "A physical POS wall where packs light up instant wins when scanned",
      "hypothesis": "In-store theatre drives talkability and repeat",
      "risks": ["Operational set-up", "POS maintenance"],
      "mitigations": ["Pilot in top 20 stores", "Dedicated merch support"],
      "measures": ["Scan rate per store", "Repeat scans per shopper", "Lift vs control banners"],
      "exit": "If scan rate <50/day after week one, roll back to static POS"
    }
  ]
}
`
