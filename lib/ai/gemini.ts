// The second entry is what runs when the first is rate limited, which on the
// free tier is routine — so it has to be a model that still exists. This list
// had gemini-2.0-flash in it long after Google retired it, which meant every
// fallback answered 404: a request that hit the quota died with a raw "Gemini
// gemini-2.0-flash 404" naming a model the user has never heard of, instead of
// quietly succeeding on the second model. Check both still respond before
// changing this.
const MODELS = ["gemini-2.5-flash", "gemini-2.5-flash-lite"] as const;
const MAX_RETRIES = 3;
const BASE_DELAY_MS = 1000;

/**
 * A part is text, a function the model wants called, or the result we hand
 * back. Callers that only ever build `{ text }` are unaffected — the union is
 * a widening, and the optional keys keep existing object literals assignable.
 */
type GeminiPart = {
  text?: string;
  functionCall?: { name: string; args?: Record<string, unknown> };
  functionResponse?: { name: string; response: Record<string, unknown> };
};

type GeminiMessage = {
  role: "user" | "model";
  parts: GeminiPart[];
};

/** A tool the model may call, in the shape the REST API expects. */
type GeminiTool = {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
};

/**
 * The OpenAPI-subset schema Gemini accepts for structured output. Loose on
 * purpose — the real validation happens with Zod once the JSON comes back.
 */
type ResponseSchema = Record<string, unknown>;

type GenerationConfig = {
  temperature: number;
  maxOutputTokens: number;
  responseMimeType?: string;
  responseSchema?: ResponseSchema;
};

// gemini-2.5-flash thinks before it writes, and those tokens come out of this
// same budget. At 2048 a chat answer to anything open-ended got maybe a hundred
// tokens of prose after the model finished thinking and stopped mid-sentence —
// asking the coach for a 20-item checklist returned one and a half items. The
// ceiling has to leave room for both halves.
const DEFAULT_CONFIG: GenerationConfig = {
  temperature: 0.7,
  maxOutputTokens: 8192,
};

type GeminiResponse = {
  candidates: {
    content: {
      parts: GeminiPart[];
    };
    finishReason?: string;
  }[];
};

/** What a model returned, plus why it stopped — "MAX_TOKENS" means cut off. */
type ModelResult = { text: string; finishReason: string };

async function callModel(
  model: string,
  systemInstruction: string,
  messages: GeminiMessage[],
  generationConfig: GenerationConfig
): Promise<ModelResult> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY not configured");

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  const body = {
    system_instruction: { parts: [{ text: systemInstruction }] },
    contents: messages,
    generationConfig,
  };

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Gemini ${model} ${res.status}: ${text}`);
  }

  const data = (await res.json()) as GeminiResponse;
  const candidate = data.candidates?.[0];
  return {
    text: candidate?.content?.parts?.[0]?.text ?? "",
    finishReason: candidate?.finishReason ?? "STOP",
  };
}

/**
 * These errors reach the user verbatim, and the upstream text is written for
 * whoever holds the API key: it names models and quota buckets that mean
 * nothing to someone who just clicked "Extract". Anything we cannot explain is
 * passed through unchanged rather than flattened into a vague apology.
 */
function readableFailure(msg: string, err: unknown): Error {
  if (msg.includes("429"))
    return new Error("The AI is over its rate limit. Try again in a minute.");
  if (msg.includes("503"))
    return new Error("The AI is briefly unavailable. Try again in a moment.");
  return err instanceof Error ? err : new Error(msg);
}

async function callWithFallback(
  systemInstruction: string,
  messages: GeminiMessage[],
  generationConfig: GenerationConfig
): Promise<ModelResult> {
  for (const model of MODELS) {
    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      try {
        return await callModel(
          model,
          systemInstruction,
          messages,
          generationConfig
        );
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        const isRetryable = msg.includes("429") || msg.includes("503");

        if (isRetryable && attempt < MAX_RETRIES - 1) {
          await new Promise((r) =>
            setTimeout(r, BASE_DELAY_MS * Math.pow(2, attempt))
          );
          continue;
        }

        if (!isRetryable || model === MODELS[MODELS.length - 1]) {
          if (model !== MODELS[MODELS.length - 1]) break;
          throw readableFailure(msg, err);
        }
      }
    }
  }

  throw new Error("All Gemini models failed");
}

export async function generateResponse(
  systemInstruction: string,
  messages: GeminiMessage[],
  options: {
    temperature?: number;
    maxOutputTokens?: number;
    /**
     * Throw instead of returning a half-finished answer. Prose that gets
     * saved — a cleaned-up note — must not be stored cut off mid-sentence;
     * chat, where a partial reply is still readable, leaves this off.
     */
    failOnTruncation?: boolean;
  } = {}
): Promise<string> {
  const { text, finishReason } = await callWithFallback(
    systemInstruction,
    messages,
    {
      temperature: options.temperature ?? DEFAULT_CONFIG.temperature,
      maxOutputTokens: options.maxOutputTokens ?? DEFAULT_CONFIG.maxOutputTokens,
    }
  );

  if (options.failOnTruncation && finishReason === "MAX_TOKENS")
    throw new Error("The notes were too long to clean up in one pass.");

  return text;
}

/**
 * Structured output. Gemini is pinned to JSON by `responseSchema`, but a model
 * can still wrap it in a code fence or return something the schema does not
 * describe, so callers must validate the parsed value themselves.
 */
export async function generateJson(
  systemInstruction: string,
  messages: GeminiMessage[],
  responseSchema: ResponseSchema,
  options: { temperature?: number; maxOutputTokens?: number } = {}
): Promise<unknown> {
  const { text: raw, finishReason } = await callWithFallback(
    systemInstruction,
    messages,
    {
      temperature: options.temperature ?? 0.2,
      maxOutputTokens: options.maxOutputTokens ?? 4096,
      responseMimeType: "application/json",
      responseSchema,
    }
  );

  // Truncated JSON will not parse, so say why rather than "unreadable".
  if (finishReason === "MAX_TOKENS")
    throw new Error("There was too much here to read in one pass.");

  const cleaned = raw
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "");

  try {
    return JSON.parse(cleaned);
  } catch {
    throw new Error("Gemini returned malformed JSON");
  }
}

/**
 * Open a streaming generation and yield each decoded chunk.
 *
 * Model fallback applies only before the first byte. Once the stream is open a
 * failure ends it, because the caller has already rendered a partial answer
 * and restarting on another model would rewrite it mid-sentence.
 *
 * Streaming works on the ordinary Node runtime; it needs no edge runtime.
 */
/** Pull the JSON payloads out of one SSE event block. */
function* parseEvent(event: string): Generator<GeminiResponse> {
  for (const line of event.split("\n")) {
    if (!line.startsWith("data:")) continue;
    const payload = line.slice(5).trim();
    if (!payload || payload === "[DONE]") continue;
    try {
      yield JSON.parse(payload) as GeminiResponse;
    } catch {
      // A malformed event is not worth killing a good stream over.
    }
  }
}

async function* openStream(
  systemInstruction: string,
  messages: GeminiMessage[],
  generationConfig: GenerationConfig,
  tools: GeminiTool[]
): AsyncGenerator<GeminiResponse, void, unknown> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY not configured");

  const body: Record<string, unknown> = {
    system_instruction: { parts: [{ text: systemInstruction }] },
    contents: messages,
    generationConfig,
  };
  if (tools.length > 0) body.tools = [{ function_declarations: tools }];

  let lastError = "";

  for (const model of MODELS) {
    const url =
      `https://generativelanguage.googleapis.com/v1beta/models/` +
      `${model}:streamGenerateContent?alt=sse&key=${apiKey}`;

    let res: Response;
    try {
      res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
      continue;
    }

    if (!res.ok || !res.body) {
      lastError = `Gemini ${model} ${res.status}: ${await res.text()}`;
      continue;
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    // Gemini terminates SSE events with CRLF CRLF, not LF LF. Splitting on
    // "\n\n" alone matches nothing against "\r\n\r\n", which silently drops
    // every event and yields an empty stream — normalise before framing.
    const consume = function* (
      chunk: string,
      flush: boolean
    ): Generator<GeminiResponse> {
      buffer += chunk.replace(/\r\n/g, "\n");

      // A chunk can split an event in half, so only whole events are taken
      // and the remainder is kept for the next read. On flush, whatever is
      // left is treated as a final event: the last one need not be
      // blank-line terminated.
      let sep = buffer.indexOf("\n\n");
      while (sep !== -1) {
        const event = buffer.slice(0, sep);
        buffer = buffer.slice(sep + 2);
        yield* parseEvent(event);
        sep = buffer.indexOf("\n\n");
      }
      if (flush && buffer.trim()) {
        const rest = buffer;
        buffer = "";
        yield* parseEvent(rest);
      }
    };

    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        yield* consume("", true);
        break;
      }
      yield* consume(decoder.decode(value, { stream: true }), false);
    }
    return;
  }

  throw readableFailure(lastError, new Error(lastError));
}

/** Runs one tool call and returns the text to hand back to the model. */
export type ToolRunner = (
  name: string,
  args: Record<string, unknown>
) => Promise<{ text: string; summary: string }>;

export type StreamEvent =
  | { type: "text"; text: string }
  | { type: "tool"; name: string; summary: string }
  /** Discard any text emitted so far: it was preamble before a lookup. */
  | { type: "reset" };

/** Lookups the model may chain before it has to answer. */
const DEFAULT_MAX_HOPS = 4;

/**
 * Streaming generation with function calling.
 *
 * Each hop opens a stream. Text is emitted as it arrives, because the common
 * case is a hop that answers directly and buffering it would defeat the point.
 * If that hop turns out to have asked for a tool instead, a `reset` event tells
 * the caller to drop whatever preamble it showed, the tools are run, their
 * results are appended, and the next hop starts.
 *
 * The hop ceiling matters on Gemini's free tier: a turn costs one request per
 * hop against a ~15/minute budget. When it is reached the model is asked once
 * more with no tools at all, which forces it to answer from what it has rather
 * than ending the turn on an unanswered tool call.
 */
export async function* streamWithTools(
  systemInstruction: string,
  messages: GeminiMessage[],
  tools: GeminiTool[],
  run: ToolRunner,
  options: {
    temperature?: number;
    maxOutputTokens?: number;
    maxHops?: number;
  } = {}
): AsyncGenerator<StreamEvent, void, unknown> {
  const generationConfig: GenerationConfig = {
    temperature: options.temperature ?? DEFAULT_CONFIG.temperature,
    maxOutputTokens: options.maxOutputTokens ?? DEFAULT_CONFIG.maxOutputTokens,
  };
  const maxHops = options.maxHops ?? DEFAULT_MAX_HOPS;
  const convo = [...messages];

  for (let hop = 0; hop <= maxHops; hop++) {
    // The last pass drops the tools, so the model has to produce prose.
    const hopTools = hop < maxHops ? tools : [];

    const calls: { name: string; args: Record<string, unknown> }[] = [];
    let emittedText = false;

    for await (const chunk of openStream(
      systemInstruction,
      convo,
      generationConfig,
      hopTools
    )) {
      for (const part of chunk.candidates?.[0]?.content?.parts ?? []) {
        if (part.functionCall?.name) {
          calls.push({
            name: part.functionCall.name,
            args: part.functionCall.args ?? {},
          });
        } else if (part.text) {
          emittedText = true;
          yield { type: "text", text: part.text };
        }
      }
    }

    if (calls.length === 0) return;

    // This hop was a lookup after all; anything already shown was preamble.
    if (emittedText) yield { type: "reset" };

    convo.push({
      role: "model",
      parts: calls.map((c) => ({
        functionCall: { name: c.name, args: c.args },
      })),
    });

    const responses: GeminiPart[] = [];
    for (const call of calls) {
      const result = await run(call.name, call.args);
      yield { type: "tool", name: call.name, summary: result.summary };
      responses.push({
        functionResponse: {
          name: call.name,
          response: { result: result.text },
        },
      });
    }

    convo.push({ role: "user", parts: responses });
  }
}

export type { GeminiMessage, GeminiTool, ResponseSchema };
