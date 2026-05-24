const MODELS = ["gemini-2.5-flash", "gemini-2.0-flash"] as const;
const MAX_RETRIES = 3;
const BASE_DELAY_MS = 1000;

type GeminiMessage = {
  role: "user" | "model";
  parts: { text: string }[];
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
  messages: GeminiMessage[]
): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY not configured");

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  const body = {
    system_instruction: { parts: [{ text: systemInstruction }] },
    contents: messages,
    generationConfig: {
      temperature: 0.7,
      maxOutputTokens: 2048,
    },
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

export async function generateResponse(
  systemInstruction: string,
  messages: GeminiMessage[]
): Promise<string> {
  for (const model of MODELS) {
    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      try {
        return await callModel(model, systemInstruction, messages);
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

export type { GeminiMessage };
