// apps/backend/src/lib/heuristics.ts
// Lightweight, rule-based scoring for promo routes
// Scores normalised 0..1 then combined to a 0..10 total with gates + tips.

export type Scorecard = {
  subs: {
    opv: number           // On-Pack Visibility (on-pack/neck-tag/label)
    pr: number            // Purchase Requirement (ONE good; >1 bad)
    iw: number            // Instant Win present
    freq: number          // Frequency layer present
    friction: number      // 1 best (low friction) .. 0 worst
    prize: number         // Prize architecture quality
    ras: number           // Retailer Acceptance Score (0..1 of 0..5 checks)
    hci: number           // Hook Clarity Index normalised (HCI>=3 => 1)
    diff: number          // Differentiation vs clichés (rough heuristic)
  }
  total: number           // 0..10
  gates: {
    opv: boolean
    pr: boolean
    iwOrFreq: boolean
    friction: boolean     // target ≤3 steps equiv.
    ras: boolean          // >=4/5 checks
    comprehension: boolean// HCI >=3
  }
  tips: string[]
}

const WORD = (xs: string[]) => new RegExp(`\\b(?:${xs.join('|')})\\b`, 'i')

// Lexicons
const ONPACK = WORD(['on[- ]?pack','neck[- ]?tag','label','peel','cap','sleeve','necker','bottle tag'])
const POS     = WORD(['wobbler','shelf','endcap','case stack','fin','aisle'])
const PURCHASE_MULTI = WORD(['buy\\s*(2|two|3|three|four|4|pair|bundle|multi|both|two-pack)'])
const PURCHASE_ONE   = WORD(['buy\\s*1','any\\s*1','any\\s*single','purchase\\s*any\\s*one'])
const INSTANT  = WORD(['instant','instantly','win\\s*instantly','instant[- ]?win'])
const FREQ     = WORD(['every\\s*week','weekly','daily','bonus\\s*entry','collect','repeat','loyalty','frequency'])
const APP      = WORD(['download\\s*app','app\\s*download'])
const RECEIPT  = WORD(['receipt\\s*upload','upload\\s*receipt'])
const FORM     = WORD(['register','sign[- ]?up','form','account','profile'])
const SHARE    = WORD(['share','post','tag','hashtag'])
const DISCOUNT = WORD(['discount','coupon','rebate','cashback'])
const BIGSINGLE= WORD(['one\\s*(grand|major)\\s*prize','1\\s*grand'])
const MULTIGRAND = WORD(['3','4','5']) // crude, improved below
const SMALLS   = WORD(['hundreds','thousands','many','instant\\s*wins','gift\\s*cards'])
const BASKET   = WORD(['bundle','pair','cheese','deli','chocolate','meal','two[- ]?pack','mix\\s*&\\s*match'])
const LOWOPS   = WORD(['neck','qr','on[- ]?pack','in[- ]?store'])
const CALENDAR = WORD(['mother.?s\\s*day','easter','xmas','christmas','summer','winter','q\\d','season'])
const MEASURE  = WORD(['entries','scan[- ]?rate','uplift','ros','ctr','cvr','kpi'])
const CLICHE   = WORD(['ar\\b','metaverse','blockchain','nft','filter','ugc\\b','gamify','experience\\b']) // tuned as you like

export function analyzeRoute(route: string): Scorecard {
  const text = route.toLowerCase()

  // OPV: on-pack best; POS-only medium; none bad
  const hasOnpack = ONPACK.test(text)
  const hasPos = POS.test(text)
  const opv = hasOnpack ? 1 : hasPos ? 0.5 : 0

  // Purchase requirement: ONE good, >1 bad (gate)
  const pr = PURCHASE_MULTI.test(text) ? 0 : (PURCHASE_ONE.test(text) || hasOnpack ? 1 : 0.7)

  // Instant & frequency
  const iw = INSTANT.test(text) ? 1 : 0
  const freq = FREQ.test(text) ? 1 : 0

  // Friction: steps + fields*0.5 + waitPenalty
  const steps = countMatches(text, [/scan/g, /upload/g, /register/g, /answer/g, /share/g]) || 1
  const fields = countMatches(text, [/name/g, /email/g, /\bdob\b/g, /address/g, /receipt/g, /proof/g])
  const waitPenalty = INSTANT.test(text) ? 0 : 1
  const fsRaw = steps + fields * 0.5 + waitPenalty + (APP.test(text) ? 2 : 0) + (RECEIPT.test(text) ? 1 : 0)
  // Map to 1..0 where 3 or fewer ≈ good
  const friction = clamp01(1 - (Math.max(0, fsRaw - 3) / 6)) // 3->1.0, 9+ -> ~0

  // Prize architecture
  const multiGrand = /(?:\b[3-5]\b.*(grand|major))|((grand|major).{0,12}[3-5])/i.test(route)
  const manySmalls = SMALLS.test(text)
  const conditional = DISCOUNT.test(text)
  const singleHuge = BIGSINGLE.test(text)
  let prize = 0.5
  if (multiGrand && manySmalls) prize = 1
  if (singleHuge) prize -= 0.3
  if (conditional) prize -= 0.4
  prize = clamp01(prize)

  // Retailer Acceptance Score (5 checks)
  const rasChecks =
    (BASKET.test(text) ? 1 : 0) +
    (LOWOPS.test(text) ? 1 : 0) +
    (POS.test(text) ? 1 : 0) +
    (CALENDAR.test(text) ? 1 : 0) +
    (MEASURE.test(text) ? 1 : 0)
  const ras = rasChecks / 5

  // Hook clarity (HCI): facts – jargon/qualifiers
  const facts = countMatches(text, [/win/g, /buy/g, /scan/g, /code/g, /every/g, /instant/g])
  const jargon = countMatches(text, [/immersive/g, /unlock/g, /synergy/g, /leverage/g])
  const qualifiers = countMatches(text, [/might/g, /could/g, /possible/g, /try/g])
  const hciRaw = Math.max(0, facts - (jargon + qualifiers))
  const hci = clamp01(hciRaw / 3) // HCI>=3 => 1.0

  // Differentiation (rough): penalise visible clichés
  const diff = clamp01(1 - (CLICHE.test(text) ? 0.4 : 0))

  // Weighted total → 0..10
  const w = { opv:3, pr:2, iw:2, freq:2, friction:3, prize:2, ras:3, hci:2, diff:1 }
  const sumW = Object.values(w).reduce((a,b)=>a+b,0)
  const total01 =
    (opv*w.opv + pr*w.pr + iw*w.iw + freq*w.freq + friction*w.friction + prize*w.prize + ras*w.ras + hci*w.hci + diff*w.diff) / sumW
  const total = +(total01 * 10).toFixed(2)

  const gates = {
    opv: opv > 0,
    pr: pr >= 1,
    iwOrFreq: (iw + freq) >= 1,
    friction: friction >= 0.6,           // ≈ ≤3 steps
    ras: ras * 5 >= 4,
    comprehension: hci >= 1,             // HCI >= 3
  }

  const tips: string[] = []
  if (!gates.opv) tips.push('Add on-pack/neck-tag for shelf discovery.')
  if (!gates.pr) tips.push('Reduce purchase requirement to ONE.')
  if (!gates.iwOrFreq) tips.push('Add Instant Win and/or a frequency layer.')
  if (!gates.friction) tips.push('Quantify friction (steps/fields) and note the trade-off instead of prescribing “simplify entry”.')
  if (conditional) tips.push('Avoid conditional discounts as “prizes”.')
  if (ras * 5 < 4) tips.push('Strengthen retailer story (basket tie-in, POS plan, calendar, KPIs).')
  if (!gates.comprehension) tips.push('Tighten the hook—must pass 4-second test.')

  return {
    subs: { opv, pr, iw, freq, friction, prize, ras, hci, diff },
    total,
    gates,
    tips,
  }
}

export function parseRoutesFromMarkdown(md: string): Array<{ title: string; content: string }> {
  const parts = md.split(/\n(?=###\s)/g).filter(Boolean)
  const out: Array<{ title: string; content: string }> = []
  for (const p of parts) {
    const m = /^###\s*(.+?)\s*$/m.exec(p)
    const title = m?.[1]?.trim() || 'Route'
    out.push({ title, content: p.trim() })
  }
  if (!out.length) out.push({ title: 'Campaign Routes', content: md.trim() })
  return out
}

// utils
function countMatches(src: string, regs: RegExp[]) {
  return regs.reduce((acc, re) => acc + ((src.match(re) || []).length), 0)
}
function clamp01(x: number) { return x < 0 ? 0 : x > 1 ? 1 : x }
