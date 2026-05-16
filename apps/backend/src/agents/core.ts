// apps/backend/src/agents/core.ts
import { z } from 'zod';
import { chat } from '../lib/openai.js';
import { zodToJsonSchema } from '../lib/zod-to-schema.js';

export type GenOpts<T> = {
  system: string;
  prompt: string;
  schema: z.ZodType<T>;
  modelName?: string;
  /** Use tool_use for guaranteed structured output (default: true) */
  useToolUse?: boolean;
};

/**
 * Generate strictly-validated JSON via Claude tool_use + Zod.
 * - Uses tool_use for guaranteed schema-compliant output
 * - Falls back to json mode if tool_use is disabled
 * - Returns typed object or throws a Zod error
 */
export async function generateJson<T>({ system, prompt, schema, modelName, useToolUse = true }: GenOpts<T>): Promise<T> {
  const resolvedModel = modelName || process.env.TRUDY_MODEL_DEFAULT || 'claude-sonnet-4-20250514';

  if (useToolUse) {
    const jsonSchema = zodToJsonSchema(schema);
    const raw = await chat({
      model: resolvedModel,
      system,
      messages: [{ role: 'user', content: prompt }],
      jsonSchema: {
        name: 'structured_output',
        description: 'Return the requested structured data',
        input_schema: jsonSchema,
      },
    });
    const parsed = JSON.parse(raw || '{}');
    return schema.parse(parsed);
  }

  // Fallback: plain json mode
  const raw = await chat({
    model: resolvedModel,
    system,
    messages: [{ role: 'user', content: prompt }],
    json: true,
  });
  const parsed = JSON.parse(raw || '{}');
  return schema.parse(parsed);
}
