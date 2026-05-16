# Trudy v4

Promotional strategy AI for Bamboo Marketing / Trevor Services. Multi-agent system that generates and evaluates promotional campaign routes using The Shelf Truth framework.

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
└─────────────────────────────────────────────────────────────────┘
        │
        ▼
┌─────────────────────────────────────────────────────────────────┐
│  TRUDY v4 (evaluation + generation layer)                       │
│                                                                 │
│  Reads market data → grounds evaluations in real competitor     │
│  activity, real mechanic prevalence, real prize values          │
│                                                                 │
│  Generates routes → Marketing Engine publishes related content  │
│  Evaluates briefs → outcomes feed back from Salesforce          │
└─────────────────────────────────────────────────────────────────┘
```

### Shared Data Locations (Cowork side)

These files are produced by Cowork tasks and available for Trudy to read:

| File | Location | Updated | Contains |
|------|----------|---------|----------|
| Promo baseline | `~/Documents/Claude/Scheduled/promo-monitor-fortnightly/baseline_promos.json` | Fortnightly | All live AU promotions: title, category, promoter, technique, method, value, dates |
| Electrolux landscape | `~/Documents/Claude/Scheduled/electrolux-promo-landscape/electrolux-landscape-YYYY-MM.json` | Monthly | Whitegoods promos by brand, type, category, value, source |
| SEO baseline | `~/Documents/Claude/Scheduled/weekly-seo-deep-dive/seo-baseline-YYYY-MM-DD.json` | Weekly | Keyword visibility, content gaps, pillar distribution |

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

### Integration Opportunities (not yet built)

1. **Market context in evaluations:** When Trudy evaluates a cashback promotion, it should pull recent cashback promotions from the Promo Monitor baseline to show: "Here are 8 cashback promotions currently live in AU. Average value is $X. Your proposed value is $Y."

2. **Outcome loop via Salesforce:** Trudy generates routes → client runs the promo through Trevor → SF captures Entry_Count__c, redemption rates → outcomes attach to the original IdeaRoute for future RAG retrieval.

3. **Content alignment:** Marketing Engine's keyword gaps and pillar analysis could inform which Trudy concepts get blog coverage (e.g., if "instant win promotion mechanics" has no article, the engine should prioritise it).

4. **Competitive intelligence in CREATE phase:** Jax (creative agent) should know what competitors are running right now. A brand proposing "cashback on laundry" should see that Samsung already has 3 active cashback promos on laundry — differentiation required.

### The Worldview

`packages/heuristics/mark.json` IS the worldview. It contains Mark's principles, scoring anchors, mechanic heuristics, compliance rules, and narrative structure. The Cowork tasks (especially the Marketing Engine's voice/tone and the Electrolux task's accuracy rules) are aligned to the same philosophy but express it differently for their specific contexts.

If you update `mark.json`, consider whether the change should propagate to Cowork task prompts (tone, principles, what "good" looks like).

---

## Development Notes

- Hex colours: no `#` prefix in PptxGenJS (if generating slides)
- Prisma: `referentialIntegrity = "prisma"` (PlanetScale limitation — no foreign keys at DB level)
- AI SDK: uses Vercel AI SDK streaming; Anthropic for main agents, OpenAI for embeddings
- Heuristic embeddings: stored as strings (serialised float arrays) for similarity search
