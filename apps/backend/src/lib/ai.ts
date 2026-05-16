// /apps/backend/src/lib/ai.ts
// Vercel AI SDK provider — now using Anthropic Claude.

import { createAnthropic } from '@ai-sdk/anthropic';
import { streamText, type LanguageModel } from 'ai';

/**
 * Ensure required env is present (fail fast at boot)
 */
function assertEnv(key: string) {
  if (!process.env[key]) throw new Error(`Missing required environment variable: ${key}`);
}
assertEnv('ANTHROPIC_API_KEY');

/**
 * Anthropic provider for Vercel AI SDK
 */
export const anthropic = createAnthropic({
  apiKey: process.env.ANTHROPIC_API_KEY!,
});

/**
 * Strongly-typed helper that accepts a structured `input` object,
 * but feeds Vercel AI SDK's `streamText` with a prompt string under the hood.
 */
export type StreamTypedArgs<TInput extends object> = {
  model: LanguageModel;
  system: string;
  input: TInput;
  abortSignal?: AbortSignal;
};

export function streamTyped<TInput extends object>(args: StreamTypedArgs<TInput>) {
  const prompt = [
    'You will receive a JSON object as your input.',
    'Respond directly to it following your system instructions.',
    '',
    'JSON_INPUT:',
    '```json',
    JSON.stringify(args.input, null, 2),
    '```',
  ].join('\n');

  return streamText({
    model: args.model,
    system: args.system,
    prompt,
    abortSignal: args.abortSignal,
  });
}
