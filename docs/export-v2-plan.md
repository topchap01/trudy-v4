# Export v2 – Client Deck Blueprint

## Goals
- Replace the current UI-dump PDF with a three-page narrative deck that a strategist could hand to a client.
- Speak differently based on promotion archetype (value-led hero, prize ladder, IP, pure cashback/GWP).
- Keep operational/debug detail in an optional appendix.

## Page Layout
### 1. Trudy Verdict (Page 1)
- **Lead line**: Campaign, brand, date, verdict badge.
- **What’s wrong**: 2–3 bullets highlighting misalignment (mechanic, value story, finance risk).
- **What Trudy changed**: before/after ladder table or sentence list.
- **Run this**: one paragraph summarising the recommended route + risk note.

### 2. Recommended Promotion (Page 2)
- **Value story**: “Everyone gets …” line (cashback, GWP, etc.).
- **Hero story**: only when a true hero exists; else omit.
- **Mechanic**: 3 ordered steps; mention proof/timing if relevant.
- **Hooks**: up to 3 cleaned lines; guarantee language enforced.
- **Brand role & finance note**: short card (“Beko hosts the winter kitchen…”, “Liability open: cap claims or insure.”).

### 3. Inside the Room (Page 3)
- Four agent cards (OfferIQ, StoryBrand, Shopper, Retailer), each:
  - Verdict badge
  - One headline sentence
  - Up to 3 supporting bullets (scrubbed for archetype).
- Must-fix summary (only genuine blockers).
- Quick-win summary.

### Appendix (optional)
- Collapsible sections for framing/evaluation transcripts, scoreboards, raw hooks, etc. Hidden by default.

## Archetype Detection
- **VALUE_LED_HERO**: assured value present (cashback/GWP) plus hero overlay.
- **GWP_ONLY**: GWP or assured items, no hero.
- **PRIZE_LADDER**: hero prize count > 0, no guaranteed base.
- **IP_PROMO**: `ipTieIn` set; emphasise property.
- **STUDENT_CASHBACK / FINANCE_HEAVY**: if market/category + guardrails indicate finance focus.

The renderer will:
- Choose tone + sections per archetype.
- Skip cadence talk for GWP-only.
- Force dual-ticket language (double pass) when awards imply shared experience.

## Data Inputs
- Snapshot already includes:
  - `snapshot.context.briefSpec` (mechanic, rewards, retailers, etc.)
  - `snapshot.narratives.evaluation.meta` (OfferIQ verdicts, cadence summaries)
  - `snapshot.offerIQ`, `snapshot.room`, `snapshot.exports`.

Need helper extractors:
- `summariseValueStory(spec)`
- `summariseHeroStory(meta, spec)`
- `summariseMechanic(spec)`
- `summariseFinanceRisk(spec, meta)`
- `scrubHooks(hooks, archetype)`
- `summariseAgent(agentOutput, archetype)`

## Implementation Plan
1. Add new renderer entry (`renderClientDeck`) returning {html,title,accent}.
2. Introduce archetype helper module so both renderer and future logic can reuse.
3. Keep existing `renderExportHtml` during transition; add env flag `EXPORT_V2=1` to switch.
4. Once v2 stabilises, delete the old template and unused CSS.

