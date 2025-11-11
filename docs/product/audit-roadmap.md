# War Room Audit & Roadmap

Last updated: 2025-02-14

## 1. Snapshot of Current State

| Area | Strengths | Pain Points |
| --- | --- | --- |
| **Brief & Research** | Overrides exist; dossier structured by tensions, retailer reality, etc. | Auto discovery noisy in appliance/beer segments; no provenance surfaced in UI; overrides hard to spot once applied. |
| **Framing** | Guardrails + hook shortlist embedded in meta; handoff prohibitions available. | UI does not surface prohibitions/hero overlay clearly; meta not reused in export lens. |
| **Evaluation** | Scoreboard + run_again_moves in meta; judge integration. | Prompt leaks raw uppercase tags; improvement examples pull distant categories; measurement copy inconsistent; verdict sometimes mismatched with guardrails. |
| **Creative Sparks** | Harness returns retail line, cadence, legal variant; agent grid rich. | No critique/triage UI; operator cards not filterable; export harness sometimes overruns brief intent. |
| **Routes / Strategist / Opinion** | Strategist deep dive supports custom prompts; synthesis references offer IQ. | Overlapping narratives; strategist copy long and unstructured; opinion rarely reused downstream. |
| **Export** | Legacy deck + new lenses; artefacts stored with metadata. | Lens copy previously hallucinated; export lacks provenance footnotes; legacy toggle not sticky per user. |
| **Judge** | LLM + rules evaluation; exports gated on blockers. | Flags surfaced as raw codes; severity not surfaced in UI besides text block. |
| **Knowledge Grid / Founders** | Segmented notes + benchmarks; founder notes pulled by segment. | Segments too coarse; competitor inspirations leak into run_again suggestions; no tool to edit/retire stale notes. |

## 2. Key Issues to Resolve

1. **Inconsistent grounding across prompts**  
   - Evaluation and Strategist prompts reference generic inspirations (e.g. SharkNinja).  
   - Research auto-fill still drifts (missing competitors, mismatched opportunities).

2. **UI signal overload**  
   - War Room sections show full narratives without curation (evaluation, strategist).  
   - Guardrails (hero overlay, entry lock, judge blockers) not highlighted in a single glance.

3. **Export trust gap**  
   - Lens copy needed filtering; legacy deck still verbose and without citations.  
   - No audit trail tying bullets to specific outputs.

4. **Operational tooling gaps**  
   - No admin surfaces for knowledge grid, founder notes, or export artefact QA.  
   - Overrides/resets require manual payload edits.

## 3. Roadmap (6-Week Sketch)

### Phase A — Ground the Intelligence (Week 1–2)
1. **Prompt tightening**  
   - Rewrite evaluation prompt to enforce “brand-aligned inspiration only” with explicit guardrail: cite only competitor list or labelled inspiration.  
   - Update strategist prompt to deliver structured bullets (Quick wins / Theatre / Retail hooks).  
   - Add provenance requirement (“Source: …”) for each improvement suggestion.
2. **Knowledge grid hygiene**  
   - Carve out new segments for stout/beer & shopper promotions; remove SharkNinja-style notes.  
   - Seed core competitor lists per pilot campaigns (Guinness, Wicked Sister, Beko).  
   - Build script to diff segment notes so future additions go through review.

### Phase B — Experience Polish (Week 3–4)
1. **War Room UI**  
   - Add guardrail banner summarising hero overlay, entry lock, judge blockers, founder priorities.  
   - Collapse evaluation narrative into cards: Verdict / Works / Breaks / Fix / Measurement.  
   - Add filters for Creative Sparks (operator card, tier) and ability to pin favourites.
2. **Research clarity**  
   - Show override vs auto facts with badges + sources; add “Refresh research” toast with timestamp.

### Phase C — Export Excellence (Week 5)
1. **Lens refinement**  
   - Add citations (hover footnotes or inline “Source: Evaluation”) for each bullet.  
   - Introduce “Inspiration” bucket when off-brand examples pass filters (explicitly labelled).  
   - Tune copy density (max 4 bullets per section) and ensure measurement present in each.  
   - Ship the *Mark’s Take* stack: Review → Sharpen → Reboot stitched into the default export so War Room hands off one coherent story.
2. **Legacy deck upgrade**  
   - Merge lens improvements (guarded scoreboard, guardrail banner) into the legacy deck.  
   - Add appendix filters (toggle include Creative Sparks, research overrides, judge log).

### Phase D — Tooling & QA (Week 6)
1. **Admin utilities**  
   - Build lightweight interface to manage founder notes / knowledge grid snippets.  
   - Add export QA view comparing latest export to prior run (diff accepted text).
2. **Regression harness**  
   - Script to run canonical campaigns (Guinness, Wicked Sister, Beko) end-to-end, outputting exports + guardrail snapshots for manual review.  
   - Store snapshots for before/after comparisons.

## 4. Immediate Action Items
- [x] Document vision (this file + `war-room-vision.md`).  
- [ ] Tighten evaluation prompt; remove generic inspirations.  
- [ ] Sanitize knowledge grid segments for pilot categories.  
- [ ] Design guardrail banner & evaluation card layout.  
- [ ] Add export citations & inspiration bucket.

## 5. Open Questions
- Do we want to store justification metadata (e.g. “Source: run_again_moves[2]”) alongside export bullets for machine diffing later?  
- Should Creative Sparks allow manual edits/annotations that feed back into export?  
- What’s the cadence for knowledge grid refresh (weekly, per campaign)?

---
*Prepared for: Mark Alexander / Trudy team*  
*Author: Codex (GPT-5)*
