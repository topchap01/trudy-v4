// apps/backend/src/lib/openai.ts
// Core LLM wrapper — powered by Anthropic Claude.
// Features: tool_use for structured output, extended thinking, streaming.

import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// Re-export the client for streaming endpoints
export { client as anthropicClient };

type ChatArgs = {
  model: string;
  system?: string;
  messages: Array<{ role: "system" | "user" | "assistant"; content: string }>;
  temperature?: number;
  top_p?: number;
  presence_penalty?: number;   // ignored — Claude doesn't support
  frequency_penalty?: number;  // ignored — Claude doesn't support
  max_output_tokens?: number;
  json?: boolean;
  /** Pass a JSON schema object to use Claude's tool_use for guaranteed structured output. */
  jsonSchema?: { name: string; description?: string; input_schema: Record<string, any> };
  /** Enable extended thinking — Claude will reason deeply before responding. */
  thinking?: boolean;
  /** Budget tokens for extended thinking (default 10000). */
  thinkingBudget?: number;
  meta?: Record<string, any>;
};

type ChatResult = {
  text: string;
  thinkingText?: string;
};

export async function chat(args: ChatArgs): Promise<string> {
  const result = await chatFull(args);
  return result.text;
}

/**
 * Full chat that returns both the text and any thinking output.
 * Use this when you want to inspect the reasoning.
 */
export async function chatFull(args: ChatArgs): Promise<ChatResult> {
  const {
    model: requestedModel,
    system,
    messages,
    temperature = 0.3,
    top_p = 1,
    max_output_tokens = 1200,
    json = false,
    jsonSchema,
    thinking = false,
    thinkingBudget = 10000,
    meta = {},
  } = args;

  const model = mapModel(requestedModel);

  const FAKE = String(process.env.TRUDY_FAKE_RUNS || "").toLowerCase() === "true";
  const TRACE = String(process.env.TRUDY_TRACE || "").toLowerCase() === "1";

  if (TRACE) {
    console.log(
      "[chat] model=%s (requested=%s) json=%s schema=%s thinking=%s temp=%s max=%s FAKE=%s",
      model, requestedModel, json, !!jsonSchema, thinking, temperature, max_output_tokens, FAKE
    );
  }

  const start = Date.now();
  console.info(JSON.stringify({
    type: 'llm.request',
    model,
    requested_model: requestedModel,
    json,
    has_schema: !!jsonSchema,
    thinking,
    temperature,
    top_p,
    max_output_tokens,
    meta,
  }));

  if (FAKE) {
    if (TRACE) console.log("[chat] FAKE RUN ENABLED — returning stub string.");
    return {
      text: JSON.stringify({
        judgement: { verdict: "GO_WITH_CONDITIONS", because: "FAKE_RUN" },
        deep: { note: "This is a stub because TRUDY_FAKE_RUNS=true" }
      }),
    };
  }

  try {
    // Build Claude messages — filter out system role (passed separately)
    const claudeMessages: Anthropic.MessageParam[] = [];
    for (const msg of messages) {
      if (msg.role === "system") continue;
      claudeMessages.push({ role: msg.role, content: msg.content });
    }

    if (!claudeMessages.length) {
      claudeMessages.push({ role: "user", content: system || "Continue." });
    }

    // Build system prompt
    const systemParts: string[] = [];
    if (system) systemParts.push(system);
    for (const msg of messages) {
      if (msg.role === "system") systemParts.push(msg.content);
    }

    // For plain json mode (no schema), add instruction
    if (json && !jsonSchema) {
      systemParts.push(
        "CRITICAL: You MUST respond with valid JSON only. No markdown fences, no prose outside the JSON object."
      );
    }
    const systemPrompt = systemParts.length ? systemParts.join("\n\n") : undefined;

    if (TRACE) {
      console.log("[chat] sending %d messages to Claude", claudeMessages.length);
    }

    // ---- Tool Use for structured output ----
    if (jsonSchema) {
      // When we have a schema, use tool_use to guarantee valid JSON
      const tool: Anthropic.Tool = {
        name: jsonSchema.name,
        description: jsonSchema.description || `Return structured ${jsonSchema.name} output`,
        input_schema: jsonSchema.input_schema as Anthropic.Tool.InputSchema,
      };

      // Tell Claude to use the tool
      const toolSystemParts = [...(systemPrompt ? [systemPrompt] : [])];
      toolSystemParts.push(
        `You MUST call the "${tool.name}" tool with your response. Do not write any text outside the tool call.`
      );

      const toolPayload: any = {
        model,
        max_tokens: max_output_tokens,
        ...(systemPrompt ? { system: toolSystemParts.join("\n\n") } : {}),
        messages: claudeMessages,
        tools: [tool],
        tool_choice: { type: "tool" as const, name: tool.name },
      };

      // Extended thinking is incompatible with tool_choice forced, so skip it here
      if (!thinking) {
        toolPayload.temperature = temperature;
        toolPayload.top_p = top_p;
      }

      const r = await client.messages.create(toolPayload);

      let toolInput: any = null;
      for (const block of r.content) {
        if (block.type === "tool_use" && block.name === tool.name) {
          toolInput = block.input;
          break;
        }
      }

      const durationMs = Date.now() - start;
      console.info(JSON.stringify({
        type: 'llm.response',
        model,
        json: true,
        structured: true,
        duration_ms: durationMs,
        meta,
        usage: r.usage ?? null,
        stop_reason: r.stop_reason,
      }));

      // tool_use returns already-parsed JSON — stringify it for callers that expect a string
      return { text: JSON.stringify(toolInput ?? {}) };
    }

    // ---- Extended thinking mode (uses streaming to avoid 10-min timeout) ----
    if (thinking) {
      const thinkPayload: any = {
        model,
        max_tokens: max_output_tokens + thinkingBudget,
        thinking: {
          type: "enabled",
          budget_tokens: thinkingBudget,
        },
        ...(systemPrompt ? { system: systemPrompt } : {}),
        messages: claudeMessages,
      };

      // Use streaming to handle long-running thinking requests
      const stream = client.messages.stream(thinkPayload);

      let out = "";
      let thinkingText = "";

      for await (const event of stream) {
        if (event.type === "content_block_delta") {
          if (event.delta.type === "thinking_delta") {
            thinkingText += event.delta.thinking;
          } else if (event.delta.type === "text_delta") {
            out += event.delta.text;
          }
        }
      }

      const finalMessage = await stream.finalMessage();

      if (TRACE) {
        console.log("[chat] thinking: %d chars, response: %d chars", thinkingText.length, out.length);
      }

      const durationMs = Date.now() - start;
      console.info(JSON.stringify({
        type: 'llm.response',
        model,
        json,
        thinking: true,
        thinking_chars: thinkingText.length,
        duration_ms: durationMs,
        meta,
        usage: finalMessage.usage ?? null,
        stop_reason: finalMessage.stop_reason,
      }));

      let finalOut = out.trim();
      if (json && finalOut.startsWith("```")) {
        finalOut = finalOut.replace(/^```(?:json)?\s*/, "").replace(/\s*```$/, "").trim();
      }

      return { text: finalOut, thinkingText };
    }

    // ---- Standard mode ----
    const r = await client.messages.create({
      model,
      max_tokens: max_output_tokens,
      temperature,
      top_p,
      ...(systemPrompt ? { system: systemPrompt } : {}),
      messages: claudeMessages,
    });

    let out = "";
    for (const block of r.content) {
      if (block.type === "text") {
        out += block.text;
      }
    }

    if (TRACE) {
      console.log("[chat] received %d chars, stop_reason=%s", out.length, r.stop_reason);
    }

    const durationMs = Date.now() - start;
    console.info(JSON.stringify({
      type: 'llm.response',
      model,
      json,
      duration_ms: durationMs,
      meta,
      usage: r.usage ?? null,
      stop_reason: r.stop_reason,
    }));

    let finalOut = out.trim();
    if (json && finalOut.startsWith("```")) {
      finalOut = finalOut.replace(/^```(?:json)?\s*/, "").replace(/\s*```$/, "").trim();
    }

    return { text: finalOut };
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
    throw err;
  }
}

/**
 * Stream a chat response as an async iterator of text deltas.
 * Used for SSE endpoints where the UI needs token-by-token output.
 */
export async function* chatStream(args: Omit<ChatArgs, 'json' | 'jsonSchema' | 'thinking'>): AsyncGenerator<string> {
  const {
    model: requestedModel,
    system,
    messages,
    temperature = 0.3,
    top_p = 1,
    max_output_tokens = 2000,
    meta = {},
  } = args;

  const model = mapModel(requestedModel);

  const claudeMessages: Anthropic.MessageParam[] = [];
  for (const msg of messages) {
    if (msg.role === "system") continue;
    claudeMessages.push({ role: msg.role, content: msg.content });
  }
  if (!claudeMessages.length) {
    claudeMessages.push({ role: "user", content: system || "Continue." });
  }

  const systemParts: string[] = [];
  if (system) systemParts.push(system);
  for (const msg of messages) {
    if (msg.role === "system") systemParts.push(msg.content);
  }
  const systemPrompt = systemParts.length ? systemParts.join("\n\n") : undefined;

  const start = Date.now();
  console.info(JSON.stringify({
    type: 'llm.stream.start',
    model,
    meta,
  }));

  const stream = client.messages.stream({
    model,
    max_tokens: max_output_tokens,
    temperature,
    top_p,
    ...(systemPrompt ? { system: systemPrompt } : {}),
    messages: claudeMessages,
  });

  for await (const event of stream) {
    if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
      yield event.delta.text;
    }
  }

  const finalMessage = await stream.finalMessage();
  const durationMs = Date.now() - start;
  console.info(JSON.stringify({
    type: 'llm.stream.end',
    model,
    duration_ms: durationMs,
    meta,
    usage: finalMessage.usage ?? null,
  }));
}

/**
 * Map OpenAI model names to Claude equivalents.
 */
function mapModel(model: string): string {
  const lower = (model || "").toLowerCase().trim();
  if (lower.startsWith("claude-")) return model;

  if (lower.includes("gpt-4o-mini") || lower.includes("gpt-4.1-mini"))
    return "claude-sonnet-4-20250514";
  if (lower.includes("gpt-4o") || lower.includes("gpt-4.1") || lower.includes("gpt-5"))
    return "claude-sonnet-4-20250514";
  if (lower.includes("gpt-4-turbo") || lower.includes("gpt-4"))
    return "claude-sonnet-4-20250514";
  if (lower.includes("gpt-3.5"))
    return "claude-haiku-3-5-20241022";

  return "claude-sonnet-4-20250514";
}
