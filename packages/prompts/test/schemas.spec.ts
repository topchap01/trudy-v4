import { describe, it, expect } from "vitest";
import {
  FramingSchema,
  IdeaRouteSchema,
  EvaluationDeltaSchema,
} from "../src/schemas";

describe("FramingSchema", () => {
  it("parses a valid framing object", () => {
    const input = {
      problem:
        "Shoppers are trading down; we must protect premium share while driving trial of light refreshment SKUs.",
      success: ["+8% incremental units", "Retailer feature", "Distinctive memory"],
      audience: {
        primary: "Adults 25–54 occasional wine buyers",
        tensions: ["Price sensitivity vs. desire for small moments of joy"],
        moments: ["Pre-Easter shop", "BBQ weekends"],
      },
      constraints: ["$250k budget", "4-week window"],
      opportunities: ["Retail media boost", "Creator UGC wave"],
      budgetCeiling: 250000,
      timingWindowWeeks: 4,
    };
    const parsed = FramingSchema.safeParse(input);
    expect(parsed.success).toBe(true);
  });

  it("rejects empty arrays and short copy", () => {
    const bad = {
      problem: "Too short",
      success: [],
      audience: { primary: "X", tensions: [], moments: [] },
      constraints: [],
      opportunities: [],
    };
    const parsed = FramingSchema.safeParse(bad as any);
    expect(parsed.success).toBe(false);
  });
});

describe("IdeaRouteSchema", () => {
  it("parses a valid idea route", () => {
    const input = {
      title: "Bucket List on a Budget",
      hook: "Turn your weekly shop into a step towards your bucket list — one receipt at a time.",
      archetype: "Quest / Progress",
      mechanic: "Buy participating wines; upload receipt; collect entries; monthly draw + grand prize.",
      prizeLadder: [
        { tier: 1, description: "Weekly $200 grocery credit", qty: 8, estValue: 200 },
        { tier: 2, description: "Monthly $2,000 mini-adventure fund", qty: 2, estValue: 2000 },
        { tier: 3, description: "Grand $20,000 Adventure Fund", qty: 1, estValue: 20000 },
      ],
      channels: ["SHOPPER", "RETAIL_MEDIA", "SOCIAL", "WEBSITE"],
      riskLevel: "BALANCED",
      target: ["Value-seeking hosts", "Entertainers"],
      budgetRange: [100000, 250000],
      feasibilityNotes: "Retail-ready mechanics; existing receipt validation; scalable prizing.",
      complianceNotes: "AU trade promotion permit likely in SA/ACT/NT.",
      kpis: ["Entries per unit", "Incremental sales uplift"],
      timeframeWeeks: 6,
      hash: "route_blb_001",
    };
    const parsed = IdeaRouteSchema.safeParse(input);
    expect(parsed.success).toBe(true);
  });

  it("rejects empty prize ladder or channels", () => {
    const bad = {
      title: "X",
      hook: "short",
      archetype: "A",
      mechanic: "B",
      prizeLadder: [],
      channels: [],
      riskLevel: "SAFE",
      target: [],
      budgetRange: [200000, 100000], // invalid order
      feasibilityNotes: "ok",
      kpis: [],
      timeframeWeeks: 0,
    };
    const parsed = IdeaRouteSchema.safeParse(bad as any);
    expect(parsed.success).toBe(false);
  });
});

describe("EvaluationDeltaSchema", () => {
  it("parses a valid evaluation delta", () => {
    const input = {
      routeRef: "route_blb_001",
      scoreDelta: 12,
      rationale:
        "Higher participation likelihood due to weekly micro-wins; strong fit with retailer media bundle.",
      risks: ["UGC moderation load"],
      mitigations: ["Automate profanity filtering; cap daily submissions."],
      dtf: 0.22,
      bridgeMoves: [
        { label: "Friction", action: "Add QR-to-receipt upload and auto-read fields." },
        { label: "Distinctiveness", action: "Own the 'Adventure Fund' naming across assets." },
      ],
      verdict: "TUNE",
    };
    const parsed = EvaluationDeltaSchema.safeParse(input);
    expect(parsed.success).toBe(true);
  });

  it("rejects invalid ranges and empty arrays", () => {
    const bad = {
      routeRef: "ab",
      scoreDelta: 200,
      rationale: "too short",
      risks: [],
      mitigations: [],
      dtf: 2,
      bridgeMoves: [],
      verdict: "MAYBE",
    };
    const parsed = EvaluationDeltaSchema.safeParse(bad as any);
    expect(parsed.success).toBe(false);
  });
});
