# The Bamboo Worldview

> How Mark Alexander and Bamboo Marketing think about promotional campaigns. This document is the human-readable companion to `mark.json`. Both encode the same philosophy — `mark.json` for Trudy's agents, this document for Claude Code sessions, Cowork task prompts, and anyone who needs to understand what "good" looks like.

---

## Core Principles

**Retailer reality beats theory.** Coles, Woolworths, and IGA each have their own operational constraints, media ecosystems, and shopper behaviours. A promotion that's brilliant in theory but can't get through a Category Manager is worthless. Every evaluation must pass a retailer-fit check.

**Output first.** Every artefact — whether a route, a blog post, a client deck, or an email report — must be board-ready without hand-finishing. If it needs cleanup before it's useful, it's not done.

**Compliance is non-negotiable.** Quentin's pass (AU default) is a hard gate, not a suggestion. ABAC for alcohol, state permits for trade promotion lotteries, age gating on digital, clear T&Cs. This doesn't slow down creativity — it defines the edges of the playground.

**Idempotent runs.** Re-running any phase, task, or pipeline must not duplicate or drift. Date-based rotation, deduplication checks, and deterministic logic over state-based reasoning.

---

## The Shelf Truth Framework

The named concepts from The Shelf Truth that appear across all tools:

### The 3-Second Equation
`Reward + Belief / Friction = the shopper's mental calculation`

The consumer decides in moments. The reward must be visible, the belief it's achievable must be instant, and the friction to participate must be minimal.

### The One Job Rule
Every promotion has one primary objective. Pick one:
- **Breaker** (Trial) — get someone who doesn't buy you to try
- **Builder** (Frequency) — get existing buyers to buy more often
- **Loader** (Basket) — get buyers to spend more per occasion
- **Harvester** (Data) — capture first-party data and behaviour
- **Keeper** (Loyalty) — retain against competitor activity

Kitchen-sinking multiple objectives dilutes all of them.

### Hope vs. Greed (The Two Pilots)
- **The Gambler** wants dopamine: instant wins, prize draws, the thrill of possibility
- **The Accountant** wants certainty: cashback, GWP, guaranteed value

Most strong promotions serve one pilot clearly. The best serve both via The Dopamine Sandwich.

### The Dopamine Sandwich
Big prize headline (for The Gambler) + frequent small wins (for The Accountant). The big prize gets attention; the small prizes get participation.

### The Rule of Three
- 1 prize = "impossible"
- 3 prizes = "possible"
- 100 prizes = "probable"

### The Insult Threshold
If the cashback isn't worth the effort of claiming, you've insulted the customer. The reward must exceed the friction cost with room to spare.

### Slippage
The percentage who forget to claim cashbacks — this is what makes cashbacks cheaper than discounts. It's a feature, not a bug, but it requires honest communication about the claim process.

### The Budget Hacker
Self-liquidating premiums, insured promotions, cashback arbitrage (using slippage). Ways to deliver perceived value that exceeds actual cost.

### Friction as a Cost
Every form field costs approximately 10% of entries. The compounding drop-off is brutal. Friction must be justified by the value of what you're collecting.

### The Kill Sheet
A 15-minute diagnostic for whether a promotion will work. If it doesn't pass the Kill Sheet, don't build it — redesign it.

### The S.O.S. Framework
How to pitch promotions to retailers: **Simple** (explain in one sentence), **Operational** (fits their systems), **Sales** (provable uplift).

### The Gatekeeper
The Category Manager at Coles/Woolworths who controls the shelf. They don't care about your brand's objectives — they care about category growth, shopper frequency, and basket size.

---

## Scoring Philosophy

### OfferIQ (7 lenses)
| Lens | What it measures | 0 = | 5 = |
|------|-----------------|-----|-----|
| Adequacy | Is the reward enough? | Insult threshold | Generosity creates advocacy |
| Simplicity | Can a shopper explain it? | Requires re-reading | Instant "get" |
| Certainty | Does the consumer believe they'll win/receive? | Lottery mindset | Guaranteed |
| Salience | Will shoppers notice at shelf? | Invisible | Unmissable |
| Talkability | Will participants tell others? | Silent | PR magnet |
| Retailer Fit | Will a Category Manager approve? | Blocked | Tailor-made |
| Brand Fit | Does it serve the brand's strategic need? | Off-brand | Perfect alignment |

### Verdicts
- **GO** — Ship it. Strong across lenses, compliance clear.
- **TUNE** — Promising but needs bridge moves. Specific, costed changes identified.
- **NO_GO** — Fundamentally flawed. Explain why without ambiguity.

### Bridge Moves
When the verdict is TUNE, bridge moves must be:
- Specific (not "improve the prize")
- Costed (approximate budget impact)
- Owned (who does this)
- Timelined (how long)
- Maximum 4 per route

---

## Voice & Tone (across all outputs)

### The Colleague Standard
Everything sounds like a smart, experienced colleague explaining something useful over coffee. Not presenting from a stage. Not performing expertise.

- **Confident but not loud.** State what you think and why.
- **Specific, never vague.** If you can't be specific, you don't know enough.
- **Honest about uncertainty.** Mixed data? Say so.
- **Practical over theoretical.** Every section should leave the reader able to do something.

### Hard Rules
- Never dramatise. No manufactured urgency.
- Never lecture. The reader is a peer.
- Never manufacture authority. Trevor has thought carefully about these problems — it doesn't have all the answers.
- Australian English. Optimise, analyse, colour, behaviour.
- No American idioms or sports metaphors.

### Banned Phrases
"In today's fast-paced digital landscape", "It's no secret that", "Game-changer", "Leverage" (as verb), "Seamless", "Synergy", "Robust", "Let's dive in", "paradigm shift", "unlock the power of", anything that sounds like a motivational poster.

---

## Data Integrity Rules

### For client deliverables (Electrolux, evaluation outputs)
- Only report what you can verify. Never supplement with assumptions.
- Every data point must trace to a source.
- Thin data is honest data. 4 verified sources beats 11 with half invented.
- Distinguish observation from trend. "Samsung had 5 promotions" is observation. "Samsung is scaling back" is interpretation requiring a baseline.

### For blog content (Marketing Engine)
- Every statistic must hyperlink to its original source. No exceptions.
- Never invent illustrative numbers.
- If you can't find 3 credible sources, pick a different angle.

---

## How This Connects

| System | Reads worldview from | Expresses it as |
|--------|---------------------|-----------------|
| Trudy agents | `mark.json` (programmatic) | OfferIQ scores, bridge moves, verdicts |
| Marketing Engine | Task prompt (voice/tone section) | Blog article voice, banned phrases, Shelf Truth references |
| SEO Deep Dive | Task prompt (keyword strategy) | Topic suggestions aligned to pillars |
| Electrolux task | Task prompt (accuracy rules) | Verified-only reporting, conservative trend language |
| SF Health Check | Task prompt (issue severity) | Health scores, stall detection |

When updating this worldview, consider which downstream systems need to change. `mark.json` changes affect Trudy's scoring. Task prompt changes affect Cowork output quality. Both should stay aligned.
