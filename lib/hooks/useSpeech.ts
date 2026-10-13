"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";

// Voice in and out through the browser's own Web Speech API: free, no key,
// no quota. Listening works in Chrome (desktop and Android), Edge and Safari;
// where it is missing, `canListen` is false and the mic is simply not shown.

type RecognitionResultEvent = {
  results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }>;
};
type Recognition = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((e: RecognitionResultEvent) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: { error?: string }) => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
};
type RecognitionCtor = new () => Recognition;

function recognitionCtor(): RecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: RecognitionCtor;
    webkitSpeechRecognition?: RecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

const noSubscribe = () => () => {};

/** Strip markdown so the voice doesn't read out asterisks and hashes. */
export function speakable(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/[*_#`>|]/g, "")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

export function useSpeech({
  onFinal,
}: {
  /** Called once with what was heard when the speaker stops. */
  onFinal: (text: string) => void;
}) {
  const canListen = useSyncExternalStore(
    noSubscribe,
    () => recognitionCtor() !== null,
    () => false
  );
  const canSpeak = useSyncExternalStore(
    noSubscribe,
    () => "speechSynthesis" in window,
    () => false
  );
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState("");
  const [speaking, setSpeaking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const rec = useRef<Recognition | null>(null);
  const onFinalRef = useRef(onFinal);
  useEffect(() => {
    onFinalRef.current = onFinal;
  }, [onFinal]);

  const stopSpeaking = useCallback(() => {
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }
    setSpeaking(false);
  }, []);

  const listen = useCallback(() => {
    const Ctor = recognitionCtor();
    if (!Ctor) return;
    stopSpeaking();
    setError(null);
    setInterim("");
    const r = new Ctor();
    r.lang = navigator.language || "en-US";
    r.interimResults = true;
    r.continuous = false;
    let heard = "";
    r.onresult = (e) => {
      let text = "";
      for (let i = 0; i < e.results.length; i++) {
        text += e.results[i][0].transcript;
      }
      heard = text;
      setInterim(text);
    };
    r.onerror = (e) => {
      if (e.error === "not-allowed" || e.error === "service-not-allowed") {
        setError("Microphone access is blocked for this site.");
      } else if (e.error && e.error !== "no-speech" && e.error !== "aborted") {
        setError("Didn't catch that. Try again.");
      }
    };
    r.onend = () => {
      setListening(false);
      setInterim("");
      rec.current = null;
      if (heard.trim()) onFinalRef.current(heard.trim());
    };
    rec.current = r;
    setListening(true);
    try {
      r.start();
    } catch {
      setListening(false);
    }
  }, [stopSpeaking]);

  const stopListening = useCallback(() => rec.current?.stop(), []);

  const speak = useCallback(
    (text: string) => {
      if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
      const clean = speakable(text);
      if (!clean) return;
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(clean);
      u.lang = navigator.language || "en-US";
      u.rate = 1.03;
      // Prefer a British male-sounding voice when the device has one.
      const voices = window.speechSynthesis.getVoices();
      const pick =
        voices.find((v) => /daniel|george|ryan|uk english male/i.test(v.name)) ??
        voices.find((v) => v.lang === "en-GB");
      if (pick) u.voice = pick;
      u.onend = () => setSpeaking(false);
      u.onerror = () => setSpeaking(false);
      setSpeaking(true);
      window.speechSynthesis.speak(u);
    },
    []
  );

  useEffect(
    () => () => {
      rec.current?.abort();
      if (typeof window !== "undefined" && "speechSynthesis" in window) {
        window.speechSynthesis.cancel();
      }
    },
    []
  );

  return {
    canListen,
    canSpeak,
    listening,
    interim,
    speaking,
    error,
    listen,
    stopListening,
    speak,
    stopSpeaking,
  };
}
