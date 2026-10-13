"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { ArrowUp, Mic, Square, Volume2, VolumeX } from "lucide-react";
import { cn } from "@/lib/utils";
import { createThread } from "@/app/(app)/assistant/actions";
import { useSpeech } from "@/lib/hooks/useSpeech";

const THREAD_KEY = "sprint-tracker:jarvis-thread";
const VOICE_KEY = "sprint-tracker:jarvis-voice";

function readStored(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}
function store(key: string, value: string) {
  try {
    window.localStorage.setItem(key, value);
  } catch {}
}

// Spoken replies on/off, remembered per browser. Read through an external
// store so the server render (always "on") and the client agree.
const VOICE_EVENT = "sprint-tracker:jarvis-voice-change";
function subscribeVoice(onChange: () => void) {
  window.addEventListener(VOICE_EVENT, onChange);
  return () => window.removeEventListener(VOICE_EVENT, onChange);
}
const readVoice = () => readStored(VOICE_KEY) !== "off";

/** Reads the coach's SSE stream (same framing ChatPane parses). */
async function ask(
  message: string,
  conversationId: string,
  onText: (answer: string) => void
): Promise<string> {
  const res = await fetch("/api/ai/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message, conversationId }),
  });
  if (!res.ok || !res.body) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || `Request failed (${res.status})`);
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let answer = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let sep = buffer.indexOf("\n\n");
    while (sep !== -1) {
      const event = buffer.slice(0, sep);
      buffer = buffer.slice(sep + 2);
      for (const line of event.split("\n")) {
        if (!line.startsWith("data:")) continue;
        let msg: { t?: string; reset?: boolean; error?: string };
        try {
          msg = JSON.parse(line.slice(5).trim());
        } catch {
          continue;
        }
        if (msg.error) throw new Error(msg.error);
        if (msg.reset) answer = "";
        if (msg.t) answer += msg.t;
        onText(answer);
      }
      sep = buffer.indexOf("\n\n");
    }
  }
  if (!answer.trim()) throw new Error("No answer came back. Try again.");
  return answer;
}

/**
 * Jarvis theme's ask bar: type or speak a question, the coach answers here
 * and reads the answer aloud. The exchange is saved to one ongoing thread in
 * the Assistant page.
 */
export function JarvisBar() {
  const [input, setInput] = useState("");
  const [answer, setAnswer] = useState("");
  const [asked, setAsked] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const voiceOn = useSyncExternalStore(subscribeVoice, readVoice, () => true);
  const busyRef = useRef(false);
  const speakRef = useRef<(text: string) => void>(() => {});

  const send = useCallback(async (text: string) => {
    const message = text.trim();
    if (!message || busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError(null);
    setAsked(message);
    setAnswer("");
    setInput("");
    try {
      const run = async (id: string) => ask(message, id, setAnswer);
      let id = readStored(THREAD_KEY);
      let full: string;
      if (!id) {
        const created = await createThread("Jarvis", { revalidate: false });
        if (!created.ok) throw new Error(created.error);
        id = created.id;
        store(THREAD_KEY, id);
        full = await run(id);
      } else {
        try {
          full = await run(id);
        } catch (e) {
          // The remembered thread was deleted: start a new one, once.
          if (!(e instanceof Error) || !/404|not found/i.test(e.message)) throw e;
          const created = await createThread("Jarvis", { revalidate: false });
          if (!created.ok) throw new Error(created.error);
          store(THREAD_KEY, created.id);
          full = await run(created.id);
        }
      }
      if (readVoice()) speakRef.current(full);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }, []);

  const speech = useSpeech({ onFinal: send });
  useEffect(() => {
    speakRef.current = speech.speak;
  }, [speech.speak]);

  const toggleVoice = () => {
    const next = !voiceOn;
    store(VOICE_KEY, next ? "on" : "off");
    window.dispatchEvent(new Event(VOICE_EVENT));
    if (!next) speech.stopSpeaking();
  };

  const status = speech.listening
    ? speech.interim || "Listening…"
    : busy && !answer
      ? "Working on it…"
      : null;

  return (
    <div className="jv-bar rounded-xl border border-border bg-card p-3">
      {(asked || status || error || speech.error) && (
        <div className="mb-2 max-h-40 overflow-y-auto text-sm" aria-live="polite">
          {asked && !speech.listening && (
            <p className="text-xs text-muted-foreground">&gt; {asked}</p>
          )}
          {status && <p className="text-primary">{status}</p>}
          {answer && (
            <p className="mt-1 whitespace-pre-wrap text-foreground">{answer}</p>
          )}
          {(error || speech.error) && (
            <p className="text-destructive">{error || speech.error}</p>
          )}
          {answer && !busy && (
            <Link
              href="/assistant"
              className="mt-1 inline-block text-xs text-primary hover:underline"
            >
              Continue in Assistant
            </Link>
          )}
        </div>
      )}
      <form
        className="flex items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
      >
        {speech.canListen && (
          <button
            type="button"
            onClick={speech.listening ? speech.stopListening : speech.listen}
            disabled={busy}
            aria-label={speech.listening ? "Stop listening" : "Speak"}
            aria-pressed={speech.listening}
            className={cn(
              "flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-primary text-primary disabled:opacity-40",
              speech.listening && "jv-pulse bg-primary text-primary-foreground"
            )}
          >
            {speech.listening ? (
              <Square className="h-4 w-4" />
            ) : (
              <Mic className="h-4 w-4" />
            )}
          </button>
        )}
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask Jarvis"
          aria-label="Ask Jarvis"
          maxLength={2000}
          className="h-10 min-w-0 flex-1 rounded-md border border-input bg-background px-3 text-sm"
        />
        {speech.canSpeak && (
          <button
            type="button"
            onClick={toggleVoice}
            aria-label={voiceOn ? "Turn spoken replies off" : "Turn spoken replies on"}
            aria-pressed={voiceOn}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:text-foreground"
          >
            {voiceOn ? (
              <Volume2 className={cn("h-4 w-4", speech.speaking && "text-primary")} />
            ) : (
              <VolumeX className="h-4 w-4" />
            )}
          </button>
        )}
        <button
          type="submit"
          disabled={busy || !input.trim()}
          aria-label="Send"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground disabled:opacity-40"
        >
          <ArrowUp className="h-4 w-4" />
        </button>
      </form>
    </div>
  );
}
