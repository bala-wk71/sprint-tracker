const MODELS = ["gemini-2.5-flash", "gemini-2.0-flash"] as const;
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

const DEFAULT_CONFIG: GenerationConfig = {
  temperature: 0.7,
  maxOutputTokens: 2048,
};

type GeminiResponse = {
  candidates: {
    content: {
      parts: { text: string }[];
    };
  }[];
};

async function callModel(
  model: string,
  systemInstruction: string,
  messages: GeminiMessage[],
  generationConfig: GenerationConfig
): Promise<string> {
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
  return data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
}

async function callWithFallback(
  systemInstruction: string,
  messages: GeminiMessage[],
  generationConfig: GenerationConfig
): Promise<string> {
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
          throw err;
        }
      }
    }
  }

  throw new Error("All Gemini models failed");
}

export async function generateResponse(
  systemInstruction: string,
  messages: GeminiMessage[]
): Promise<string> {
  return callWithFallback(systemInstruction, messages, DEFAULT_CONFIG);
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
  const raw = await callWithFallback(systemInstruction, messages, {
    temperature: options.temperature ?? 0.2,
    maxOutputTokens: options.maxOutputTokens ?? 4096,
    responseMimeType: "application/json",
    responseSchema,
  });

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

export type { GeminiMessage, ResponseSchema };
