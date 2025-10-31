// apps/backend/src/lib/openai.ts
import OpenAI from "openai";

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

type ChatArgs = {
  model: string;
  system?: string;
  messages: Array<{ role: "system" | "user" | "assistant"; content: string }>;
  temperature?: number;
  top_p?: number;
  presence_penalty?: number;
  frequency_penalty?: number;
  max_output_tokens?: number;
  json?: boolean;
  meta?: Record<string, any>;
};

export async function chat(args: ChatArgs): Promise<string> {
  const {
    model,
    system,
    messages,
    temperature = 0.3,
    top_p = 1,
    presence_penalty = 0,
    frequency_penalty = 0,
    max_output_tokens = 1200,
    json = false,
    meta = {},
  } = args;

  const FAKE = String(process.env.TRUDY_FAKE_RUNS || "").toLowerCase() === "true";
  const TRACE = String(process.env.TRUDY_TRACE || "").toLowerCase() === "1";

  if (TRACE) {
    console.log("[chat] model=%s json=%s temp=%s max=%s FAKE=%s",
      model, json, temperature, max_output_tokens, FAKE);
  }

  const start = Date.now();
  console.info(JSON.stringify({
    type: 'llm.request',
    model,
    json,
    temperature,
    top_p,
    presence_penalty,
    frequency_penalty,
    max_output_tokens,
    meta,
  }));

  if (FAKE) {
    if (TRACE) console.log("[chat] FAKE RUN ENABLED — returning stub string.");
    return JSON.stringify({
      judgement: { verdict: "GO_WITH_CONDITIONS", because: "FAKE_RUN" },
      deep: { note: "This is a stub because TRUDY_FAKE_RUNS=true" }
    });
  }

  try {
    const payload: any = {
      model,
      temperature,
      top_p,
      presence_penalty,
      frequency_penalty,
      messages: [] as any[],
      response_format: json ? { type: "json_object" } : undefined,
      max_tokens: max_output_tokens,
    };
    if (system) payload.messages.push({ role: "system", content: system });
    payload.messages.push(...messages);

    if (TRACE) {
      console.log("[chat] sending %d messages", payload.messages.length);
    }

    const r = await client.chat.completions.create(payload);
    const out = r.choices?.[0]?.message?.content || "";
    if (TRACE) console.log("[chat] received %d chars", out.length);
    const durationMs = Date.now() - start;
    console.info(JSON.stringify({
      type: 'llm.response',
      model,
      json,
      duration_ms: durationMs,
      meta,
      usage: r.usage ?? null,
      choices: r.choices?.length ?? 0,
    }));
    return out.trim();
  } catch (err: any) {
    const durationMs = Date.now() - start;
    console.error(JSON.stringify({
      type: 'llm.error',
      model,
      json,
      duration_ms: durationMs,
      meta,
      error: err?.message || String(err),
    }));
    console.error("[chat] ERROR:", err?.message || err);
    // Surface the error so caller can decide what to persist
    throw err;
  }
}
