// apps/backend/src/agents/core.ts
import { z } from 'zod';
import { chat } from '../lib/openai.js';

export type GenOpts<T> = {
  system: string;
  prompt: string;
  schema: z.ZodType<T>;
  modelName?: string;
};

/**
 * Generate strictly-validated JSON via Vercel AI SDK + Zod.
 * - Enforces JSON output
 * - Returns typed object or throws a Zod error
 */
export async function generateJson<T>({ system, prompt, schema, modelName }: GenOpts<T>): Promise<T> {
  const resolvedModel = modelName || process.env.TRUDY_MODEL_DEFAULT || 'gpt-4o-mini';
  const raw = await chat({
    model: resolvedModel,
    system,
    messages: [{ role: 'user', content: prompt }],
    json: true,
  });
  const parsed = JSON.parse(raw || '{}');
  return schema.parse(parsed);
}
