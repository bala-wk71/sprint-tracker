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

type GeminiMessage = {
  role: "user" | "model";
  parts: { text: string }[];
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
      parts: { text: string }[];
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
 * Streaming variant of generateResponse, yielding text as the model writes it.
 *
 * Chat is the one caller that benefits: a coach answer can run several hundred
 * tokens behind a thinking pass, and watching it arrive beats a spinner that
 * sits still for fifteen seconds. Everything that persists prose — cleaned-up
 * notes, goal reviews — stays on generateResponse, where truncation can be
 * detected before the text is saved.
 *
 * Streaming works on the ordinary Node runtime; it needs no edge runtime.
 *
 * Model fallback only applies before the first byte. Once the stream is open a
 * failure ends it, because the caller has already rendered a partial answer
 * and restarting on another model would rewrite it mid-sentence.
 */
export async function* streamResponse(
  systemInstruction: string,
  messages: GeminiMessage[],
  options: { temperature?: number; maxOutputTokens?: number } = {}
): AsyncGenerator<string, void, unknown> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY not configured");

  const generationConfig: GenerationConfig = {
    temperature: options.temperature ?? DEFAULT_CONFIG.temperature,
    maxOutputTokens: options.maxOutputTokens ?? DEFAULT_CONFIG.maxOutputTokens,
  };

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
        body: JSON.stringify({
          system_instruction: { parts: [{ text: systemInstruction }] },
          contents: messages,
          generationConfig,
        }),
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

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      // SSE events are separated by a blank line; a chunk can split one in
      // half, so only whole events are consumed and the remainder is kept.
      let sep = buffer.indexOf("\n\n");
      while (sep !== -1) {
        const event = buffer.slice(0, sep);
        buffer = buffer.slice(sep + 2);
        for (const line of event.split("\n")) {
          if (!line.startsWith("data:")) continue;
          const payload = line.slice(5).trim();
          if (!payload || payload === "[DONE]") continue;
          try {
            const parsed = JSON.parse(payload) as GeminiResponse;
            const text = parsed.candidates?.[0]?.content?.parts?.[0]?.text;
            if (text) yield text;
          } catch {
            // A malformed event is not worth killing a good stream over.
          }
        }
        sep = buffer.indexOf("\n\n");
      }
    }
    return;
  }

  throw readableFailure(lastError, new Error(lastError));
}

export type { GeminiMessage, ResponseSchema };
