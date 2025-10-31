export declare const system: string;
export type Phase = "FRAMING" | "CREATE" | "EVALUATE" | "SYNTHESIS";
/** Phase-specific guidance to append to Clara's system prompt */
export declare function phaseDirectives(phase: Phase): string;
//# sourceMappingURL=clara.d.ts.map