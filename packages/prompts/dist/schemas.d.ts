import { z } from "zod";
/** Shared enums */
export declare const RiskLevelEnum: z.ZodEnum<["SAFE", "BALANCED", "BOLD"]>;
export type RiskLevel = z.infer<typeof RiskLevelEnum>;
export declare const VerdictEnum: z.ZodEnum<["GO", "TUNE", "NO_GO"]>;
export type Verdict = z.infer<typeof VerdictEnum>;
/** Framing object (output of parallel Clara + Miles in FRAMING) */
export declare const FramingSchema: z.ZodObject<{
    problem: z.ZodString;
    success: z.ZodArray<z.ZodString, "many">;
    audience: z.ZodObject<{
        primary: z.ZodString;
        tensions: z.ZodArray<z.ZodString, "many">;
        moments: z.ZodArray<z.ZodString, "many">;
    }, "strip", z.ZodTypeAny, {
        primary: string;
        tensions: string[];
        moments: string[];
    }, {
        primary: string;
        tensions: string[];
        moments: string[];
    }>;
    constraints: z.ZodArray<z.ZodString, "many">;
    mandatories: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
    guardrails: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
    opportunities: z.ZodArray<z.ZodString, "many">;
    budgetCeiling: z.ZodOptional<z.ZodNumber>;
    timingWindowWeeks: z.ZodOptional<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    problem: string;
    success: string[];
    audience: {
        primary: string;
        tensions: string[];
        moments: string[];
    };
    constraints: string[];
    mandatories: string[];
    guardrails: string[];
    opportunities: string[];
    budgetCeiling?: number | undefined;
    timingWindowWeeks?: number | undefined;
}, {
    problem: string;
    success: string[];
    audience: {
        primary: string;
        tensions: string[];
        moments: string[];
    };
    constraints: string[];
    opportunities: string[];
    mandatories?: string[] | undefined;
    guardrails?: string[] | undefined;
    budgetCeiling?: number | undefined;
    timingWindowWeeks?: number | undefined;
}>;
export type Framing = z.infer<typeof FramingSchema>;
/** Idea Route produced in CREATE (3–7 candidates) */
export declare const IdeaRouteSchema: z.ZodObject<{
    title: z.ZodString;
    hook: z.ZodString;
    archetype: z.ZodString;
    mechanic: z.ZodString;
    prizeLadder: z.ZodArray<z.ZodObject<{
        tier: z.ZodNumber;
        description: z.ZodString;
        qty: z.ZodNumber;
        estValue: z.ZodNumber;
    }, "strip", z.ZodTypeAny, {
        tier: number;
        description: string;
        qty: number;
        estValue: number;
    }, {
        tier: number;
        description: string;
        qty: number;
        estValue: number;
    }>, "many">;
    channels: z.ZodArray<z.ZodEnum<["INSTORE", "ONLINE", "SOCIAL", "SEARCH", "TV", "OOH", "SHOPPER", "CRM", "PR", "INFLUENCER", "RETAIL_MEDIA", "WEBSITE", "APP", "SMS", "EMAIL"]>, "many">;
    riskLevel: z.ZodEnum<["SAFE", "BALANCED", "BOLD"]>;
    target: z.ZodArray<z.ZodString, "many">;
    budgetRange: z.ZodEffects<z.ZodTuple<[z.ZodNumber, z.ZodNumber], null>, [number, number], [number, number]>;
    feasibilityNotes: z.ZodString;
    complianceNotes: z.ZodOptional<z.ZodString>;
    kpis: z.ZodArray<z.ZodString, "many">;
    timeframeWeeks: z.ZodNumber;
    /** Optional stable reference for de-duplication */
    hash: z.ZodOptional<z.ZodString>;
}, "strict", z.ZodTypeAny, {
    title: string;
    hook: string;
    archetype: string;
    mechanic: string;
    prizeLadder: {
        tier: number;
        description: string;
        qty: number;
        estValue: number;
    }[];
    channels: ("INSTORE" | "ONLINE" | "SOCIAL" | "SEARCH" | "TV" | "OOH" | "SHOPPER" | "CRM" | "PR" | "INFLUENCER" | "RETAIL_MEDIA" | "WEBSITE" | "APP" | "SMS" | "EMAIL")[];
    riskLevel: "SAFE" | "BALANCED" | "BOLD";
    target: string[];
    budgetRange: [number, number];
    feasibilityNotes: string;
    kpis: string[];
    timeframeWeeks: number;
    complianceNotes?: string | undefined;
    hash?: string | undefined;
}, {
    title: string;
    hook: string;
    archetype: string;
    mechanic: string;
    prizeLadder: {
        tier: number;
        description: string;
        qty: number;
        estValue: number;
    }[];
    channels: ("INSTORE" | "ONLINE" | "SOCIAL" | "SEARCH" | "TV" | "OOH" | "SHOPPER" | "CRM" | "PR" | "INFLUENCER" | "RETAIL_MEDIA" | "WEBSITE" | "APP" | "SMS" | "EMAIL")[];
    riskLevel: "SAFE" | "BALANCED" | "BOLD";
    target: string[];
    budgetRange: [number, number];
    feasibilityNotes: string;
    kpis: string[];
    timeframeWeeks: number;
    complianceNotes?: string | undefined;
    hash?: string | undefined;
}>;
export type IdeaRoute = z.infer<typeof IdeaRouteSchema>;
/** Evaluation deltas (Reality-check, scoring, and bridge moves) */
export declare const EvaluationDeltaSchema: z.ZodObject<{
    routeRef: z.ZodString;
    scoreDelta: z.ZodNumber;
    rationale: z.ZodString;
    risks: z.ZodArray<z.ZodString, "many">;
    mitigations: z.ZodArray<z.ZodString, "many">;
    dtf: z.ZodNumber;
    bridgeMoves: z.ZodArray<z.ZodObject<{
        label: z.ZodString;
        action: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        label: string;
        action: string;
    }, {
        label: string;
        action: string;
    }>, "many">;
    verdict: z.ZodEnum<["GO", "TUNE", "NO_GO"]>;
}, "strict", z.ZodTypeAny, {
    routeRef: string;
    scoreDelta: number;
    rationale: string;
    risks: string[];
    mitigations: string[];
    dtf: number;
    bridgeMoves: {
        label: string;
        action: string;
    }[];
    verdict: "GO" | "TUNE" | "NO_GO";
}, {
    routeRef: string;
    scoreDelta: number;
    rationale: string;
    risks: string[];
    mitigations: string[];
    dtf: number;
    bridgeMoves: {
        label: string;
        action: string;
    }[];
    verdict: "GO" | "TUNE" | "NO_GO";
}>;
export type EvaluationDelta = z.infer<typeof EvaluationDeltaSchema>;
//# sourceMappingURL=schemas.d.ts.map