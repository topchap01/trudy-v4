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

  const requestedModel = model;
  const requestedIsGPT5 =
    typeof requestedModel === "string" && requestedModel.toLowerCase().includes("gpt-5");
  const fallbackModel = process.env.TRUDY_GPT5_FALLBACK_MODEL || "gpt-4o";

  const isGPT5 =
    typeof requestedModel === "string" && requestedModel.toLowerCase().includes("gpt-5");
  const safeTemperature = isGPT5 ? 1 : temperature;
  const safeTopP = isGPT5 ? 1 : top_p;
  const safePresence = isGPT5 ? 0 : presence_penalty;
  const safeFrequency = isGPT5 ? 0 : frequency_penalty;

  const FAKE = String(process.env.TRUDY_FAKE_RUNS || "").toLowerCase() === "true";
  const TRACE = String(process.env.TRUDY_TRACE || "").toLowerCase() === "1";

  if (TRACE) {
    console.log(
      "[chat] model=%s json=%s temp=%s max=%s FAKE=%s",
      model,
      json,
      safeTemperature,
      max_output_tokens,
      FAKE
    );
  }

  const start = Date.now();
  console.info(JSON.stringify({
    type: 'llm.request',
    model,
    json,
    temperature: safeTemperature,
    top_p: safeTopP,
    presence_penalty: safePresence,
    frequency_penalty: safeFrequency,
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
      temperature: safeTemperature,
      top_p: safeTopP,
      presence_penalty: safePresence,
      frequency_penalty: safeFrequency,
      messages: [] as any[],
      response_format: json ? { type: "json_object" } : undefined,
    };
    const tokenField =
      typeof model === "string" && model.toLowerCase().includes("gpt-5")
        ? "max_completion_tokens"
        : "max_tokens";
    (payload as any)[tokenField] = max_output_tokens;
    if (system) payload.messages.push({ role: "system", content: system });
    payload.messages.push(...messages);

    if (TRACE) {
      console.log("[chat] sending %d messages", payload.messages.length);
    }

    const r = await client.chat.completions.create(payload);
    const message = r.choices?.[0]?.message;
    const rawContent: any = message?.content;
    let out = "";
    if (typeof rawContent === "string") {
      out = rawContent;
    } else if (Array.isArray(rawContent)) {
      out = rawContent
        .map((chunk: any) => {
          if (!chunk) return "";
          if (typeof chunk === "string") return chunk;
          if (typeof chunk.text === "string") return chunk.text;
          if (Array.isArray(chunk.text)) return chunk.text.join("");
          if (typeof chunk.content === "string") return chunk.content;
          if (Array.isArray(chunk.content)) return chunk.content.join("");
          return "";
        })
        .join("");
    }
    if (TRACE) {
      console.log("[chat] raw choice", JSON.stringify(r.choices?.[0] || null));
      console.log("[chat] raw message", JSON.stringify(message));
      console.log("[chat] received %d chars", out.length);
    }
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
    const finalOut = out.trim();
    if (!finalOut && requestedIsGPT5 && !json) {
      console.warn(
        "[chat] %s returned empty output; retrying with fallback model %s",
        requestedModel,
        fallbackModel
      );
      return chat({
        ...args,
        model: fallbackModel,
        meta: { ...meta, fallbackFrom: requestedModel },
      });
    }
    return finalOut;
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
