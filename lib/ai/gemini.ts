// Which key and model answer, in order. Each key is a separate Google project
// with its own free-tier quota (20 requests a day per model on the primary),
// so when one runs out the next route takes over. The backup key belongs to a
// newer account: Google no longer serves the 2.5 models to new users, so it
// runs Gemini 3. The strong model on each key comes before either lite model,
// because the lite models write noticeably worse reports and plans.
// Check every model still responds before changing this: a retired model
// answers 404 (this list once held gemini-2.0-flash long after it was gone).
type Route = { key: string; model: string; gen: 2 | 3 };

const routeId = (r: Route) => `${r.key.slice(-6)}:${r.model}`;

/**
 * A route that used up its daily quota stays skipped for an hour, so later
 * requests on the same warm instance don't each spend retries rediscovering it.
 */
const exhaustedUntil = new Map<string, number>();
const EXHAUSTED_FOR_MS = 60 * 60 * 1000;

function routes(): Route[] {
  const primary = process.env.GEMINI_API_KEY;
  const backup = process.env.GEMINI_API_KEY_BACKUP;
  const all: (Route | null)[] = [
    primary ? { key: primary, model: "gemini-2.5-flash", gen: 2 } : null,
    backup ? { key: backup, model: "gemini-3.6-flash", gen: 3 } : null,
    primary ? { key: primary, model: "gemini-2.5-flash-lite", gen: 2 } : null,
    backup ? { key: backup, model: "gemini-3.5-flash-lite", gen: 3 } : null,
  ];
  const list = all.filter((r): r is Route => r !== null);
  if (list.length === 0) throw new Error("GEMINI_API_KEY not configured");
  // If every route is marked used up, try them all anyway: the marks are guesses.
  const live = list.filter((r) => (exhaustedUntil.get(routeId(r)) ?? 0) < Date.now());
  return live.length ? live : list;
}

const isDailyLimit = (status: number, body: string) => status === 429 && /PerDay/i.test(body);

function noteFailure(route: Route, status: number, body: string) {
  if (isDailyLimit(status, body)) exhaustedUntil.set(routeId(route), Date.now() + EXHAUSTED_FOR_MS);
}

const MAX_RETRIES = 3;
const BASE_DELAY_MS = 1000;

/**
 * A part is text, a function the model wants called, or the result we hand
 * back. Callers that only ever build `{ text }` are unaffected — the union is
 * a widening, and the optional keys keep existing object literals assignable.
 */
type GeminiPart = {
  text?: string;
  functionCall?: { id?: string; name: string; args?: Record<string, unknown> };
  functionResponse?: { id?: string; name: string; response: Record<string, unknown> };
  /** Gemini 3 attaches this to a function call; it must go back with it. */
  thoughtSignature?: string;
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
  /** Caps gemini-2.5 "thinking" tokens; long extractions otherwise spend minutes thinking. */
  thinkingConfig?: { thinkingBudget: number };
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

/** Gemini 3 takes a thinking level instead of a token budget. */
function configFor(route: Route, config: GenerationConfig): Record<string, unknown> {
  if (route.gen === 2 || !config.thinkingConfig) return config;
  const { thinkingConfig, ...rest } = config;
  return { ...rest, thinkingConfig: { thinkingLevel: thinkingConfig.thinkingBudget <= 1024 ? "low" : "medium" } };
}

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

class GeminiHttpError extends Error {
  constructor(
    readonly status: number,
    readonly body: string,
    model: string
  ) {
    super(`Gemini ${model} ${status}: ${body}`);
  }
}

async function callModel(
  route: Route,
  systemInstruction: string,
  messages: GeminiMessage[],
  generationConfig: GenerationConfig
): Promise<ModelResult> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${route.model}:generateContent`;

  const body = {
    system_instruction: { parts: [{ text: systemInstruction }] },
    contents: messages,
    generationConfig: configFor(route, generationConfig),
  };

  const started = Date.now();
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": route.key },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    if (process.env.GEMINI_DEBUG) console.log(`[gemini] ${route.model} ${res.status} after ${Date.now() - started}ms`);
    noteFailure(route, res.status, text);
    throw new GeminiHttpError(res.status, text, route.model);
  }

  const data = (await res.json()) as GeminiResponse;
  const candidate = data.candidates?.[0];
  if (process.env.GEMINI_DEBUG) {
    console.log(`[gemini] ${route.model} ok after ${Date.now() - started}ms, ${candidate?.finishReason}`);
  }
  return {
    // Gemini 3 can split an answer across parts; signature-only parts carry no text.
    text: (candidate?.content?.parts ?? []).map((p) => p.text ?? "").join(""),
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
  let lastError: unknown = new Error("All Gemini models failed");
  for (const route of routes()) {
    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      try {
        return await callModel(route, systemInstruction, messages, generationConfig);
      } catch (err) {
        lastError = err;
        const status = err instanceof GeminiHttpError ? err.status : 0;
        const body = err instanceof GeminiHttpError ? err.body : "";
        // A per-minute limit or a brief outage is worth waiting out; a used-up
        // day, a retired model or a refused key means moving to the next route.
        const transient = (status === 429 && !isDailyLimit(status, body)) || status === 503;
        if (!transient) break;
        if (attempt < MAX_RETRIES - 1) {
          await new Promise((r) => setTimeout(r, BASE_DELAY_MS * Math.pow(2, attempt)));
        }
      }
    }
  }
  const msg = lastError instanceof Error ? lastError.message : String(lastError);
  throw readableFailure(msg, lastError);
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
  options: { temperature?: number; maxOutputTokens?: number; thinkingBudget?: number } = {}
): Promise<unknown> {
  const { text: raw, finishReason } = await callWithFallback(
    systemInstruction,
    messages,
    {
      temperature: options.temperature ?? 0.2,
      maxOutputTokens: options.maxOutputTokens ?? 4096,
      responseMimeType: "application/json",
      responseSchema,
      ...(options.thinkingBudget === undefined ? {} : { thinkingConfig: { thinkingBudget: options.thinkingBudget } }),
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
  let lastError = "";

  for (const route of routes()) {
    const body: Record<string, unknown> = {
      system_instruction: { parts: [{ text: systemInstruction }] },
      contents: messages,
      generationConfig: configFor(route, generationConfig),
    };
    if (tools.length > 0) body.tools = [{ function_declarations: tools }];
    const url =
      `https://generativelanguage.googleapis.com/v1beta/models/` +
      `${route.model}:streamGenerateContent?alt=sse`;

    let res: Response;
    try {
      res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": route.key },
        body: JSON.stringify(body),
      });
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
      continue;
    }

    if (!res.ok || !res.body) {
      const text = await res.text();
      noteFailure(route, res.status, text);
      lastError = `Gemini ${route.model} ${res.status}: ${text}`;
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

    const calls: { id?: string; name: string; args: Record<string, unknown> }[] = [];
    // The model's call parts go back exactly as received: Gemini 3 needs the
    // thought signature on them, and each response must carry its call's id.
    const callParts: GeminiPart[] = [];
    let emittedText = false;

    for await (const chunk of openStream(
      systemInstruction,
      convo,
      generationConfig,
      hopTools
    )) {
      for (const part of chunk.candidates?.[0]?.content?.parts ?? []) {
        if (part.functionCall?.name) {
          callParts.push(part);
          calls.push({
            id: part.functionCall.id,
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

    convo.push({ role: "model", parts: callParts });

    const responses: GeminiPart[] = [];
    for (const call of calls) {
      const result = await run(call.name, call.args);
      yield { type: "tool", name: call.name, summary: result.summary };
      responses.push({
        functionResponse: {
          ...(call.id ? { id: call.id } : {}),
          name: call.name,
          response: { result: result.text },
        },
      });
    }

    convo.push({ role: "user", parts: responses });
  }
}

export type { GeminiMessage, GeminiTool, ResponseSchema };
