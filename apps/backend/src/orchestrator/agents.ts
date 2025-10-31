// apps/backend/src/orchestrator/agents.ts
import OpenAI from 'openai';
import { z } from 'zod';

/* ---------------------------------------
 * Shared helpers
 * ------------------------------------- */

function getModel(): string {
  return process.env.TRUDY_SYNTH_MODEL?.trim() || 'gpt-4o-mini';
}

function hasKey(): boolean {
  return Boolean(process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY.trim());
}

function parseJsonSafe(raw: string): any | null {
  try {
    return JSON.parse(raw);
  } catch {
    const m = raw.match(/\{[\s\S]*\}/m);
    if (!m) return null;
    try {
      return JSON.parse(m[0]);
    } catch {
      return null;
    }
  }
}

/** Normalise verdicts to the three allowed labels. */
export function normalizeVerdict(input: unknown): 'GO' | 'TUNE' | 'NO_GO' {
  const s = String(input || '').trim().toLowerCase().replace(/\s+/g, ' ');
  if (['go', 'green', 'approve', 'ship'].includes(s)) return 'GO';
  if (['tune', 'refine', 'adjust', 'revise'].includes(s)) return 'TUNE';
  if (['no go', 'no-go', 'nogo', 'stop', 'reject', 'no'].includes(s)) return 'NO_GO';
  return 'TUNE';
}

/* ---------------------------------------
 * Clara — FRAMING
 * ------------------------------------- */

const ClaraFramingSchema = z.object({
  objective: z.string().min(10),
  audience: z.string().min(5),
  keyConstraints: z.array(z.string()).min(1),
  success: z.array(z.string()).min(1),
});
export type ClaraFraming = z.infer<typeof ClaraFramingSchema>;

/**
 * Ask CLARA to produce a framing snapshot.
 * Returns null if OPENAI env or TRUDY_CLARA_SYSTEM is not set.
 */
export async function askClaraForFraming(args: {
  campaign: { id: string; title?: string | null; market?: string | null };
  briefParsed: any;
}): Promise<ClaraFraming | null> {
  if (!hasKey()) return null;
  const system = (process.env.TRUDY_CLARA_SYSTEM || '').trim();
  if (!system) return null;

  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

  const userPayload = {
    instruction:
      'Frame this campaign succinctly. Respond ONLY with JSON that matches the schema.',
    schema: {
      objective: 'string (>=10 chars)',
      audience: 'string (>=5 chars)',
      keyConstraints: ['string (at least 1 item)'],
      success: ['string (at least 1 item)'],
    },
    context: {
      campaign: { id: args.campaign.id, title: args.campaign.title, market: args.campaign.market },
      brief: args.briefParsed ?? {},
    },
  };

  const completion = await openai.chat.completions.create({
    model: getModel(),
    temperature: 0.2,
    messages: [
      { role: 'system', content: `${system}\nCRITICAL: Output MUST be compact JSON, no prose.` },
      { role: 'user', content: JSON.stringify(userPayload) },
    ],
    response_format: { type: 'json_object' as const },
  });

  const raw = completion.choices?.[0]?.message?.content || '{}';
  const parsed = parseJsonSafe(raw);
  if (!parsed) return null;

  // Validate and return strictly typed framing
  return ClaraFramingSchema.parse(parsed);
}

/* ---------------------------------------
 * Omar — EVALUATION
 * ------------------------------------- */

const OmarSummarySchema = z.object({
  routeCount: z.number(),
  composition: z.object({
    SAFE: z.number(),
    BALANCED: z.number(),
    BOLD: z.number(),
  }),
  mechanicSpread: z.array(z.object({ mechanic: z.string(), count: z.number() })),
  findings: z.array(z.string()),
  recommendations: z.array(z.string()),
});

const OmarDeltaSchema = z.object({
  type: z.enum(['ADD', 'CHANGE', 'REMOVE']),
  area: z.enum(['MECHANIC', 'HOOK', 'PRIZE', 'CHANNELS', 'COMPLIANCE', 'FEASIBILITY']),
  rationale: z.string(),
});

const OmarVerdictSchema = z.object({
  label: z.string().optional(),
  normalized: z.enum(['GO', 'TUNE', 'NO_GO']).optional(),
  rationale: z.string().optional(),
});

const OmarEvalSchema = z.object({
  summary: OmarSummarySchema,
  deltas: z.array(OmarDeltaSchema).optional(),
  verdict: OmarVerdictSchema.optional(),
});
export type OmarEval = z.infer<typeof OmarEvalSchema>;

/**
 * Ask OMAR to evaluate the CURRENT routes and return structured JSON.
 * Returns null if OPENAI env or TRUDY_OMAR_SYSTEM is not set.
 */
export async function askOmarForEvaluation(args: {
  campaign: { id: string; title?: string | null; market?: string | null };
  briefParsed: any;
  routes: Array<any>;
}): Promise<OmarEval | null> {
  if (!hasKey()) return null;
  const system = (process.env.TRUDY_OMAR_SYSTEM || '').trim();
  if (!system) return null;

  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

  const userPayload = {
    instruction:
      'Evaluate the given routes. Respond ONLY with JSON that matches the schema.',
    schema: {
      summary: {
        routeCount: 'number',
        composition: { SAFE: 'number', BALANCED: 'number', BOLD: 'number' },
        mechanicSpread: [{ mechanic: 'string', count: 'number' }],
        findings: ['string'],
        recommendations: ['string'],
      },
      deltas:
        '[{type:"ADD|CHANGE|REMOVE", area:"MECHANIC|HOOK|PRIZE|CHANNELS|COMPLIANCE|FEASIBILITY", rationale:"string"}]',
      verdict: '{label?:string, normalized?:"GO|TUNE|NO_GO", rationale?:string}',
    },
    context: {
      campaign: { id: args.campaign.id, title: args.campaign.title, market: args.campaign.market },
      brief: args.briefParsed ?? {},
      routes: args.routes ?? [],
    },
  };

  const completion = await openai.chat.completions.create({
    model: getModel(),
    temperature: 0.2,
    messages: [
      { role: 'system', content: `${system}\nCRITICAL: Output MUST be compact JSON, no prose.` },
      { role: 'user', content: JSON.stringify(userPayload) },
    ],
    response_format: { type: 'json_object' as const },
  });

  const raw = completion.choices?.[0]?.message?.content || '{}';
  const parsed = parseJsonSafe(raw);
  if (!parsed) return null;

  // Normalise verdict if present
  if (parsed?.verdict?.normalized) {
    parsed.verdict.normalized = normalizeVerdict(parsed.verdict.normalized);
  }

  // Validate and return strictly typed evaluation
  return OmarEvalSchema.parse(parsed);
}
