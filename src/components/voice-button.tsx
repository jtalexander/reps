"use client";
/** Speak instead of type, where the browser supports it (Chrome, Safari on iOS). */
import { useState } from "react";

type Rec = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: (e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void;
  onend: () => void;
  start: () => void;
};

export function VoiceButton({ onText, label = "🎙 Speak" }: { onText: (t: string) => void; label?: string }) {
  const [state, setState] = useState<"idle" | "listening" | "unsupported">("idle");
  if (state === "unsupported") return <span className="text-xs text-muted">Voice isn&apos;t supported in this browser; your keyboard&apos;s microphone works too.</span>;
  return (
    <button
      type="button"
      className="btn btn-ghost min-h-9 px-3"
      onClick={() => {
        const w = window as unknown as { SpeechRecognition?: new () => Rec; webkitSpeechRecognition?: new () => Rec };
        const SR = w.SpeechRecognition ?? w.webkitSpeechRecognition;
        if (!SR) return setState("unsupported");
        const rec = new SR();
        rec.lang = "en-US";
        rec.interimResults = false;
        rec.continuous = false;
        rec.onresult = (e) => {
          const said = Array.from({ length: e.results.length }, (_, i) => e.results[i]?.[0]?.transcript ?? "").join(" ").trim();
          if (said) onText(said.charAt(0).toUpperCase() + said.slice(1));
        };
        rec.onend = () => setState("idle");
        setState("listening");
        rec.start();
      }}
    >
      {state === "listening" ? "Listening…" : label}
    </button>
  );
}
