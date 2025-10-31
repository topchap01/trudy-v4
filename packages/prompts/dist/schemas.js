import { z } from "zod";
/** Shared enums */
export const RiskLevelEnum = z.enum(["SAFE", "BALANCED", "BOLD"]);
export const VerdictEnum = z.enum(["GO", "TUNE", "NO_GO"]);
/** Framing object (output of parallel Clara + Miles in FRAMING) */
export const FramingSchema = z.object({
    problem: z.string().trim().min(20, "Explain the problem in at least 20 chars."),
    success: z.array(z.string().trim().min(3)).min(3, "List at least 3 success criteria."),
    audience: z.object({
        primary: z.string().trim().min(3),
        tensions: z.array(z.string().trim().min(3)).min(1),
        moments: z.array(z.string().trim().min(3)).min(1),
    }),
    constraints: z.array(z.string().trim().min(3)).min(1),
    mandatories: z.array(z.string().trim().min(3)).default([]),
    guardrails: z.array(z.string().trim().min(3)).default([]),
    opportunities: z.array(z.string().trim().min(3)).min(1),
    budgetCeiling: z.number().nonnegative().optional(),
    timingWindowWeeks: z.number().int().min(1).optional(),
});
/** Idea Route produced in CREATE (3–7 candidates) */
export const IdeaRouteSchema = z
    .object({
    title: z.string().trim().min(3),
    hook: z.string().trim().min(10, "Hook must be specific and compelling."),
    archetype: z.string().trim().min(3),
    mechanic: z.string().trim().min(5),
    prizeLadder: z
        .array(z.object({
        tier: z.number().int().min(1),
        description: z.string().trim().min(3),
        qty: z.number().int().min(1),
        estValue: z.number().nonnegative(),
    }))
        .min(1, "At least one prize tier required."),
    channels: z
        .array(z.enum([
        "INSTORE",
        "ONLINE",
        "SOCIAL",
        "SEARCH",
        "TV",
        "OOH",
        "SHOPPER",
        "CRM",
        "PR",
        "INFLUENCER",
        "RETAIL_MEDIA",
        "WEBSITE",
        "APP",
        "SMS",
        "EMAIL",
    ]))
        .min(1, "Specify at least one channel."),
    riskLevel: RiskLevelEnum,
    target: z.array(z.string().trim().min(2)).min(1, "Add an audience target tag."),
    budgetRange: z
        .tuple([z.number().nonnegative(), z.number().positive()])
        .refine((r) => r[1] >= r[0], { message: "budgetRange must be [min,max]." }),
    feasibilityNotes: z.string().trim().min(10),
    complianceNotes: z.string().trim().min(3).optional(),
    kpis: z.array(z.string().trim().min(2)).min(1),
    timeframeWeeks: z.number().int().min(1),
    /** Optional stable reference for de-duplication */
    hash: z.string().trim().min(6).optional(),
})
    .strict();
/** Evaluation deltas (Reality-check, scoring, and bridge moves) */
export const EvaluationDeltaSchema = z
    .object({
    routeRef: z.string().trim().min(3),
    scoreDelta: z.number().min(-100).max(100),
    rationale: z.string().trim().min(15),
    risks: z.array(z.string().trim().min(3)).min(1),
    mitigations: z.array(z.string().trim().min(3)).min(1),
    dtf: z.number().min(0).max(1), // Distance-to-frontier (0..1 normalised)
    bridgeMoves: z
        .array(z.object({
        label: z.string().trim().min(3),
        action: z.string().trim().min(5),
    }))
        .min(1)
        .max(4),
    verdict: VerdictEnum,
})
    .strict();
