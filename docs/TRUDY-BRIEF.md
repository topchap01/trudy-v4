# Trudy — The Shelf Engine

**Trudy is a promotional marketing strategy tool that evaluates and generates campaign ideas using The Shelf framework.**

Built by Bamboo Marketing. Powered by Claude.

---

## What Trudy Does

Trudy takes a promotional campaign brief — or an existing idea — and runs it through the same analytical frameworks a senior promotional strategist would apply, in about 60 seconds instead of 3 days.

It does two things:

### Mode 1: "I need ideas"
You tell Trudy the brand, category, retailers, and what job the promotion needs to do. Trudy researches the competitive landscape, generates 6-8 genuinely different campaign routes, and scores each one from two opposing perspectives — a Provocateur (is this remarkable?) and a Pragmatist (will this actually work?). Each route comes with a prize architecture, friction design, message hierarchy, budget scenarios, and a retailer sell-in pitch.

### Mode 2: "Evaluate my idea"
You describe an existing promotion — or load one from a previous campaign. Trudy runs it through The Shelf's diagnostic frameworks: the 3-Second Equation, the One Job Rule, the Kill Sheet, a friction audit, budget modelling, and retailer readiness. It tells you what works, what breaks (with specific fixes), and whether to go, rework, or kill. If it says rework, it generates three alternative routes that keep what works but fix what's broken.

---

## How It Thinks

Trudy reasons from **The Shelf** — a practitioner framework from Bamboo Marketing's book *"The Shelf: How to Win the 3-Second Decision in Australian Retail"*, based on 20 years and thousands of campaigns across FMCG, telco, consumer electronics, liquor, beauty, and retail.

### The 3-Second Equation
Every shelf decision is a mental calculation: **Conversion = (Reward × Belief) ÷ Friction**. Trudy scores every idea against this equation — but calibrates the scores against prize value and category norms, not flat thresholds.

### The One Job Rule
A promotion can only do one job well. Trudy classifies every idea into one of six jobs:

- **Breaker** — cold trial, conquesting someone who has never bought the brand
- **Converter** — shelf switching, making an in-category shopper reach for your product instead of the one next to it
- **Builder** — frequency, turning a monthly buyer into a weekly buyer
- **Loader** — basket trade-up, increasing transaction value
- **Harvester** — data capture
- **Keeper** — loyalty defence

The distinction matters because each job has different friction tolerances. A Breaker needs near-zero friction. A Converter with a $15,000 prize can tolerate receipt upload and a form. Trudy catches when the wrong job classification leads to the wrong friction assessment.

### The Kill Sheet
Eight checks, calibrated against prize value: Reward, Urgency, Belief, Speed, Scan, Load Time, Data, Ops. Not binary pass/fail — each check is contextualised. A receipt upload for a $15K trip is proportionate. The same form for a $2 cashback crosses the Insult Threshold.

### The Two Pilots
Every shopper runs on one of two instincts: the Gambler (hope, possibility, dopamine) or the Accountant (certainty, justification, smart choice). Trudy identifies which pilot the idea targets and whether the mechanic actually delivers for that pilot.

### Friction as a Budget Lever
Friction isn't always bad. Strategic friction protects budgets, amplifies perceived value, and filters for engaged customers. Trudy models optimal friction as a function of prize value, budget risk, and consumer frustration tolerance — not as something to minimise blindly.

### The Provocateur & The Pragmatist
Instead of 10 agents agreeing, Trudy uses two voices in tension:

- **The Provocateur** scores on surprise, cultural relevance, and talkability. Penalises anything that looks like last year's campaign. Always suggests a wildcard mechanic.
- **The Pragmatist** scores on feasibility, budget risk, and retailer readiness. Grounds every assessment in operational reality and category-specific redemption norms.

The tension between them is where the insight lives.

---

## What It Produces

### For an evaluation (Mode 2):
- **Verdict**: GO / REWORK / KILL with a rationale a CMO can act on
- **One Job classification** with plain-English definition
- **3-Second Equation scores** with narrative interpretation
- **Kill Sheet** (8 checks, calibrated to prize value)
- **What Works / What Breaks / What to Change** — specific, grounded, with Shelf framework references and actionable fixes
- **Budget scenarios** (Conservative / Expected / Aggressive) with volume estimates, prize costs, ops costs, and category benchmarks
- **Message Hierarchy** — current vs improved, following the trigger word order (WIN → PRIZE → QUANTITY → ODDS → COST)
- **Retailer Readiness** — would a category manager say yes, with S.O.S. pitch (Simple, Operational, Sales)
- **Friction Audit** — field-by-field assessment of what to keep and what to cut
- **Provocateur & Pragmatist** assessments as separate, clearly voiced sections
- **Alternative Routes** (if REWORK) — three full strategic options, not stubs

### For idea generation (Mode 1):
- **6-8 campaign routes**, each with mechanic, prize architecture, friction design, message hierarchy, and Trevor-compatible entry config
- **Provocateur + Pragmatist scores** per route
- **Research dossier** — live competitor promotions, cultural moments, retailer context, mechanic precedents

---

## How It Researches

Trudy runs 4-6 targeted web searches (via Serper) and passes the results to Claude with extended thinking enabled. Claude reads the search results — no brittle HTML scraping — and extracts:

1. **Competitor promotions** — what's live in this category right now
2. **Cultural moments** — events, seasons, and hooks in the next 4-8 weeks
3. **Retailer context** — what matters to category managers at these retailers
4. **Mechanic precedents** — has this specific mechanic been done in this category before

Research is cached for 24 hours per brand + category + market combination.

---

## The Trevor Handoff

Trudy outputs campaign specs in a format compatible with the Trevor Campaign Wizard — Bamboo's Salesforce-based campaign execution platform. Every route includes:

- Campaign type (mapped to Trevor's `Promotional_Campaign__c` picklist)
- Prize definitions (mapped to `Promotional_Campaign_Prize__c`)
- Entry form configuration (fields, required flags, receipt settings)
- Entry limits (total, daily)

The "Export to Trevor" button generates a JSON payload that Trevor can import and deploy to Salesforce — bridging strategy (Trudy) to execution (Trevor) in one click.

---

## Tech Stack

- **AI**: Claude (Anthropic) with extended thinking for deep reasoning
- **Backend**: Node.js + Express + TypeScript + Prisma (SQLite)
- **Frontend**: React + Vite + Tailwind CSS
- **Research**: Serper API (Google search) → Claude analysis
- **Structured output**: Claude tool_use for guaranteed schema-compliant JSON
- **Streaming**: SSE for real-time token delivery (synthesis endpoint)

---

## What Trudy Is Not

- **Not autonomous.** It generates options and stress-tests them. Humans set the job, choose the route, and make the final call.
- **Not a consensus machine.** It doesn't optimise for safety. The Provocateur's job is to challenge boring ideas. The Pragmatist's job is to catch what breaks. The tension is the point.
- **Not a replacement for experience.** It compresses cycles. A senior strategist reviews Trudy's output and makes it better — the same way a senior strategist uses a junior analyst's research deck.

---

*Built by Bamboo Marketing. Framework: The Shelf (2026). Engine: Claude by Anthropic.*
