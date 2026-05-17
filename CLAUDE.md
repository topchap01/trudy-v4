# Trudy v4

Promotional strategy AI for Bamboo Marketing / Trevor Services. Multi-agent system that generates and evaluates promotional campaign routes using The Shelf Truth framework.

> **Coming to this fresh?** Read [`SESSION-LOG.md`](./SESSION-LOG.md) first for the most recent handoff between Claude Code, Cowork, and Mark — current state, what was shipped most recently, and what's still in flight.

## Tech Stack

- **Frontend:** React 19 + Vite + Tailwind + React Query (`apps/frontend/`)
- **Backend:** Express + TypeScript + Vercel AI SDK + Anthropic/OpenAI (`apps/backend/`)
- **Database:** MySQL via PlanetScale + Prisma ORM (`infra/prisma/schema.prisma`)
- **Shared packages:** `@trudy/prompts` (Zod schemas), `packages/heuristics/` (scoring rules)
- **Monorepo:** pnpm workspaces

## Architecture

Multi-agent pipeline: FRAMING → CREATE → EVALUATE → SYNTHESIS

Agents: Clara (audience), Miles (category truths), Jax (creative routes), Nina (compliance), Ivy (retail fit), Theo (scoring), Quentin (legal gate), Omar (synthesis narrative), Bruce (final pick).

Key systems:
- **OfferIQ** (`src/lib/offeriq.ts`) — 7-lens scoring: adequacy, simplicity, certainty, salience, talkability, retailerFit, brandFit → GO/TUNE/NO_GO verdict
- **PromoTrack** (`src/lib/promotrack.ts`) — guardrail rules with KEEP/BEND/BREAK flex
- **Heuristics** (`packages/heuristics/mark.json`) — Mark's worldview: principles, scoring anchors, mechanic heuristics, compliance rules

## Key Files

- `apps/backend/src/routes/` — API endpoints
- `apps/backend/src/agents/` — Agent prompts and orchestration
- `packages/prompts/src/schemas.ts` — Zod schemas (IdeaRoute, EvaluationDelta, Framing)
- `packages/heuristics/mark.json` — The worldview config (principles, scoring, archetypes)
- `infra/prisma/schema.prisma` — Database models

## Commands

```bash
pnpm install          # install all workspaces
pnpm dev              # run frontend + backend in parallel
pnpm --filter backend dev   # backend only
pnpm --filter frontend dev  # frontend only
pnpm prisma:push      # push schema to PlanetScale
```

---

## Integration with Cowork Scheduled Tasks

Trudy does not exist in isolation. A suite of Cowork scheduled tasks generates real-world promotional market intelligence that Trudy should consume to ground its evaluations in reality.

### The Data Flow

```
┌─────────────────────────────────────────────────────────────────┐
│  COWORK SCHEDULED TASKS (data collection layer)                 │
│                                                                 │
│  Promo Monitor ──→ baseline_promos.json (200+ AU promos)        │
│       │                                                         │
│       └──→ Electrolux Task ──→ electrolux-landscape-YYYY-MM.json│
│                                (manufacturer + retailer promos) │
│                                                                 │
│  SEO Deep Dive ──→ seo-baseline-YYYY-MM-DD.json                 │
│       │              (keyword gaps, content health)              │
│       └──→ Marketing Engine ──→ blog drafts (human-reviewed)    │
│                                                                 │
│  SF Health Check ──→ campaign entry data (Salesforce)            │
│                                                                 │
│  SF Outcome Export ──→ data/sf-campaign-outcomes.json            │
│       (weekly)          (ALL campaigns: mechanic, timing,       │
│                          entries, client, status — the RAG      │
│                          ground truth for Trudy evaluations)    │
└─────────────────────────────────────────────────────────────────┘
        │
        ▼
┌─────────────────────────────────────────────────────────────────┐
│  TRUDY v4 (evaluation + generation layer)                       │
│                                                                 │
│  Reads market data → grounds evaluations in real competitor     │
│  activity, real mechanic prevalence, real prize values          │
│                                                                 │
│  Reads outcome data → grounds scoring in real entry counts,     │
│  real mechanics used, real timing from Trevor's own campaigns   │
│                                                                 │
│  Reads SEO data → keyword gaps, content health, and competitor  │
│  domains feed into route generation for content alignment       │
│                                                                 │
│  Generates routes → Marketing Engine publishes related content  │
│  Evaluates briefs → outcomes feed back from Salesforce          │
└─────────────────────────────────────────────────────────────────┘
```

### Shared Data Locations (Cowork side)

These files are produced by Cowork tasks and available for Trudy to read:

| File | Location | Updated | Trudy reader | Contains |
|------|----------|---------|--------------|----------|
| Promo baseline | `~/Documents/Claude/Scheduled/promo-monitor-fortnightly/baseline_promos.json` | Fortnightly | `lib/market-context.ts` | All live AU promotions: title, category, promoter, technique, method, value, dates. Canonical taxonomy strings since May 2026. |
| Electrolux landscape | `~/Documents/Claude/Scheduled/electrolux-promo-landscape/electrolux-landscape-YYYY-MM.json` | Monthly | *(not yet wired)* | Whitegoods promos by brand, type, category, value, source |
| SEO baseline | `~/Documents/Claude/Scheduled/weekly-seo-deep-dive/seo-baseline-YYYY-MM-DD.json` | Weekly | `lib/seo-context.ts` | Keyword visibility, content gaps, pillar distribution, cannibalisation risks |
| Wine landscape | `~/Documents/Claude/Scheduled/wine-promo-landscape/wine-landscape-YYYY-MM.pptx` | Monthly | *(not yet wired)* | AU wine/liquor promotions from Dan Murphy's, BWS, Liquorland, First Choice, Vintage Cellars |
| **SF campaign outcomes** | **`data/sf-campaign-outcomes.json` (in this repo)** | **Weekly** | **`lib/campaign-outcomes.ts`** | **Every Trevor campaign ever run: mechanic, timing, entry count, client, retailer, status. Trudy's ground truth for RAG-based evaluation.** |

### SF Outcome Data — The RAG Ground Truth

`data/sf-campaign-outcomes.json` is the most important integration file. It contains every `Promotional_Campaign__c` record from Salesforce — historical and active. During evaluation, Trudy should:

1. **Filter by mechanic:** When evaluating a cashback brief, pull all historical cashback campaigns and show entry count distribution
2. **Filter by client:** Show the client's own campaign history — "You've run 8 promotions through Trevor, averaging X entries"
3. **Filter by category/retailer:** If targeting Coles with a laundry promotion, find comparable campaigns
4. **Benchmark:** "The proposed prize value of $50 cashback compares to an average of $X across your 12 historical cashback campaigns"

Schema version: **v3** (enriched May 2026). Typed as `CampaignOutcome[]`. The `mechanic` field maps to `Campaign_Type__c` in Salesforce and should be matched against `taxonomy.json` mechanics.

#### Key fields for evaluation

**Structured (query directly):** `mechanic`, `entryCount`, `estimatedEntries`, `clientName`, `salesFrom/To`, `receiptRequired`, `campaignCodeRequired`, `ocrCheck`, `entryLimit`, `maxDailyEntries`

**Prize data (v3 — from `Promotional_Campaign_Prize__c`):**
```typescript
prizes: Array<{
  name: string;          // Prize description
  level: string;         // e.g. "Major", "Minor", "Instant"
  value: number;         // Dollar value per unit
  maxWinners: number;    // Total available
  claimed: number;       // Already awarded
  type: string;          // e.g. "Cash", "Gift Card", "Product"
}>
```

**Cashback data (v3 — from `Cashback_Range__c`):**
```typescript
cashbackRanges: Array<{
  name: string;          // Range description
  cashbackValue: number; // Dollar amount
  minSpend: number;      // Minimum qualifying spend
  maxSpend: number;      // Maximum qualifying spend
}>
```

**Computed fields (v3):**
- `totalPrizePoolValue` — sum of (value × maxWinners) across all prizes
- `majorPrizeValue` — highest single prize value
- `clientName` — resolved human-readable name (from Account object)

**Text blobs (parse with Claude at eval time):** `winners` (legacy prize text), `fulfillment` (delivery methods, prize costs), `giftWithPurchase` (GWP descriptions), `entryConsideration` and `purchaseRequirement` (friction analysis)

**Known gaps:** No consumer-facing headline/hook field exists in Salesforce — it lives on the microsite only. `campaignStart` is null on all records — use `salesFrom`/`salesTo` for timing. Only 8/58 campaigns have `estimatedEntries`. `Promotional_Campaign_Win_Definition__c` exists but returned empty (field names may differ from API names).

### Shared Taxonomy

Both Trudy and the Cowork tasks use these canonical classifications. When adding new terms, update `packages/heuristics/taxonomy.json` (the source of truth) and notify the Cowork task prompts.

**Mechanics** (Trudy's `mechanic` field maps to Cowork's `technique`):
- Cashback, Instant Win, Prize Draw (Single/Multi), GWP, Bundle Deal, Trade-In, Extended Warranty, Finance/Interest-Free, Percentage Discount, Competition, Collect-to-Win, Conditional, Unique Code, 1-in-X, Sweepstake

**Categories** (product categories tracked across both systems):
- Laundry, Refrigeration, Dishwashers, Cooking, Small Kitchen Appliances, Vacuum/Floor Care, Air Treatment, RTD Spirit, Beer, Wine, Personal Care, Beverages, Biscuits & Snacks, FMCG (general)

**Brands** (tracked by Cowork, relevant to Trudy evaluations):
- Client: Electrolux, Westinghouse
- Competitor (whitegoods): Samsung, LG, Bosch, Miele, Fisher & Paykel, Haier, Hisense, Breville, Dyson
- Other clients: Vinarchy, Boss Coffee, Jacob's Creek, Grant Burge, Croser

**Retailers:**
- AU: Coles, Woolworths, IGA, Harvey Norman, JB Hi-Fi, The Good Guys, Bing Lee, Appliances Online, Myer
- NZ: Noel Leeming, Harvey Norman NZ

**One Job taxonomy** (shared between Trudy IdeaRoutes and blog content pillars):
- Breaker (Trial), Converter, Builder (Frequency), Loader (Basket), Harvester (Data), Keeper (Loyalty)

### Integration Status

**Shipped (all three data → Trudy arrows):**

1. **Market context in evaluations** ✅ — `lib/market-context.ts` reads Promo Monitor baseline, fuzzy-matches mechanic/category, injects live AU competitor promos into the research dossier. Agents see "Here are N [mechanic] promotions currently live in AU" with values and promoters.

2. **SF campaign outcomes in evaluations** ✅ — `lib/campaign-outcomes.ts` reads `data/sf-campaign-outcomes.json`, injects Trevor's own past campaigns as `mechanicPrecedents` with entry counts, prize ladders, cashback tiers, and claim rates.

3. **SEO content alignment** ✅ — `lib/seo-context.ts` reads SEO Deep Dive baseline, injects keyword gaps, pillar distribution, refresh candidates, cannibalisation risks, and competitor domains into `categoryFacts`. Route generation now knows which content gaps exist.

**Not yet built:**

4. **Competitive intelligence in CREATE phase:** Jax (creative agent) should know what competitors are running right now. A brand proposing "cashback on laundry" should see that Samsung already has 3 active cashback promos on laundry — differentiation required.

5. **Outcome feedback loop:** Trudy reasons with Trevor's past campaign data (one-way) but doesn't capture Mark's per-verdict scoring as a feedback signal. Closing this loop would let the system improve as it learns what worked.

6. **Electrolux landscape → Trudy:** Whitegoods-specific competitor data alongside generic Promo Monitor. Reader not yet built.

7. **Wine landscape → Trudy:** Wine/liquor promo data. Task created (monthly), reader not yet built.

### The Worldview

`packages/heuristics/mark.json` IS the worldview. It contains Mark's principles, scoring anchors, mechanic heuristics, compliance rules, and narrative structure. The Cowork tasks (especially the Marketing Engine's voice/tone and the Electrolux task's accuracy rules) are aligned to the same philosophy but express it differently for their specific contexts.

If you update `mark.json`, consider whether the change should propagate to Cowork task prompts (tone, principles, what "good" looks like).

---

## Development Notes

- Hex colours: no `#` prefix in PptxGenJS (if generating slides)
- Prisma: `referentialIntegrity = "prisma"` (PlanetScale limitation — no foreign keys at DB level)
- AI SDK: uses Vercel AI SDK streaming; Anthropic for main agents, OpenAI for embeddings
- Heuristic embeddings: stored as strings (serialised float arrays) for similarity search
