# Session Log

Shared handoff log between Claude Code sessions, Cowork sessions, and Mark. **Newest entry at the top.** Each entry: `## YYYY-MM-DD — Title`, with an `Actor:` line and freeform sections beneath. Append, don't rewrite history — past entries are the audit trail.

---

## 2026-05-16 — Cowork integration shipped (Phases 3 + 4)

**Actor:** Claude Code (Opus 4.7, 1M context)

### Summary

Started session with app not booting and ~30 files of uncommitted War Room refactor. Ended with: working app + six clean commits + two of the three "data → Trudy" arrows from the architecture diagram fully wired. Trudy agents now reason with grounded data from the Promo Monitor baseline (live AU competitor promos) and the Salesforce campaign-outcomes export (Trevor's own past campaigns with prize claim rates).

### Commits added (in order)

| Commit | What it did |
|---|---|
| `652bd02` | Cowork integration contract: `CLAUDE.md`, `packages/heuristics/taxonomy.json`, `packages/heuristics/worldview.md` |
| `69aa633` | Landed War Room refactor (56 files). Shelf-native routing + wizard UI. TS errors fixed (~20 → 0). New `src/env.ts` pre-import dotenv loader with `override:true` |
| `590699d` | `lib/market-context.ts` reader for Promo Monitor + `GET /api/market-context`. Fuzzy match handles "Cash back" ↔ "Cashback", "Sweep single draw" ↔ "Prize Draw (Single)" |
| `d481eb4` | Wired Promo Monitor into `runShelfResearch`. Agents see observed AU competitor promos in `competitorPromos` + `categoryFacts` |
| `81058c0` | `lib/campaign-outcomes.ts` for SF export + `GET /api/campaign-outcomes`. Wired into `runShelfResearch` — agents see Trevor's own campaigns in `mechanicPrecedents` with entry counts and prize claim rates. `data/` added to `.gitignore` |
| `46becf1` | Surfaced `cashbackRanges` — cashback campaigns now expose tier structures (spend thresholds × cashback values) for price-point reasoning |

### Integration files in play

| Path | Who writes | Who reads (Trudy code) |
|---|---|---|
| `~/Documents/Claude/Scheduled/promo-monitor-fortnightly/baseline_promos.json` | Promo Monitor task | `lib/market-context.ts` |
| `<repo>/data/sf-campaign-outcomes.json` (gitignored) | SF Outcome Export task | `lib/campaign-outcomes.ts` |

### What an agent now sees in the dossier for a cashback brief

- *categoryFacts*: "Trevor has run 7 Cashback campaigns (2,975 total entries, avg 425). Cashback structures: $100–$1,000 cashback against $100–$10,000 spend thresholds. Highest-entry: Westinghouse Aspire Bundle Cashback (896 entries)"
- *mechanicPrecedents*: per-campaign tier ladder, e.g. "888 entries | cashback tiers: $3,000–$4,999 → $250; $5,000–$6,999 → $400; $7,000–$9,999 → $700; $10,000+ → $1,000"
- *competitorPromos*: up to 20 currently-live AU promos from Promo Monitor, prepended ahead of Claude's web-search extractions

### Known data-quality gaps (Cowork-side, not Trudy)

- Promo Monitor: some `value` fields unparseable (e.g. "Upto $1,00") — dropped from value stats but records still surface
- Promo Monitor: classifier false positives (e.g. "Visa Gift Card" tagged as "Cash back" technique)
- SF: cashback campaigns don't carry redemption/claim counts per range — only tier structure
- SF: `winners` and `consumerUrl` empty across all 58 records

### Still not wired (next obvious work)

- **SEO Deep Dive baseline → Trudy** (would feed Jax during route generation)
- **Electrolux landscape → Trudy** (whitegoods-specific competitor data alongside generic Promo Monitor)
- Push canonical taxonomy labels back into Cowork task prompts (currently fuzzy-matched Trudy-side)

### Shell fixes Mark needs to do once

1. `unset ANTHROPIC_API_KEY` from `~/.zshrc` — was exported empty, shadowing the `.env`. Trudy overrides via `src/env.ts` but other Node projects will hit the same bug
2. Trailing space on `SERPER_API_KEY` in `apps/backend/.env` — causes Serper HTTP 400; shelf-research falls back to empty dossier

### Architecture diagram check-in

Mark shared `bamboo_trevor_intelligence_platform.svg` — diagram is largely accurate to shipped state. Two minor corrections to the diagram noted: Quentin (legal gate) missing from the agents list; SEO → Trudy arrow is aspirational not yet shipped. Minor SVG bug on line 166 (broken `<path>` element with `y1`/`y2` attributes; cosmetic only, line 167 below it renders the actual arrow).
