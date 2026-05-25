"use client";

import { useState } from "react";
import { Skull, Heart, Flame, Brain, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { AI_PERSONAS, type AiPersona } from "@/lib/ai/prompts";

const PERSONA_ICONS: Record<AiPersona, typeof Skull> = {
  drill_sergeant: Skull,
  nurturer: Heart,
  nietzsche: Flame,
  rational: Brain,
};

const PERSONA_COLORS: Record<AiPersona, string> = {
  drill_sergeant: "border-red-500/50 bg-red-500/10 hover:bg-red-500/20",
  nurturer: "border-pink-500/50 bg-pink-500/10 hover:bg-pink-500/20",
  nietzsche: "border-orange-500/50 bg-orange-500/10 hover:bg-orange-500/20",
  rational: "border-blue-500/50 bg-blue-500/10 hover:bg-blue-500/20",
};

const PERSONA_ACTIVE: Record<AiPersona, string> = {
  drill_sergeant: "border-red-500 bg-red-500/20 ring-2 ring-red-500/30",
  nurturer: "border-pink-500 bg-pink-500/20 ring-2 ring-pink-500/30",
  nietzsche: "border-orange-500 bg-orange-500/20 ring-2 ring-orange-500/30",
  rational: "border-blue-500 bg-blue-500/20 ring-2 ring-blue-500/30",
};

export function PersonaSelector({ current }: { current: AiPersona }) {
  const [selected, setSelected] = useState<AiPersona>(current);
  const [saving, setSaving] = useState(false);

  const handleSelect = async (persona: AiPersona) => {
    if (persona === selected || saving) return;
    setSaving(true);
    setSelected(persona);

    try {
      await fetch("/api/ai/persona", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ persona }),
      });
    } catch {
      setSelected(selected);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      {(Object.keys(AI_PERSONAS) as AiPersona[]).map((key) => {
        const Icon = PERSONA_ICONS[key];
        const isActive = selected === key;

        return (
          <button
            key={key}
            onClick={() => handleSelect(key)}
            disabled={saving}
            className={cn(
              "relative flex flex-col items-center gap-1.5 rounded-lg border p-3 text-center transition-all",
              isActive ? PERSONA_ACTIVE[key] : PERSONA_COLORS[key],
              saving && "opacity-60"
            )}
          >
            {isActive && (
              <Check className="absolute right-1.5 top-1.5 h-3.5 w-3.5 text-foreground" />
            )}
            <Icon className="h-5 w-5 text-foreground" />
            <span className="text-xs font-medium text-foreground">
              {AI_PERSONAS[key].label}
            </span>
            <span className="hidden text-[10px] leading-tight text-muted-foreground sm:block">
              {AI_PERSONAS[key].description}
            </span>
          </button>
        );
      })}
    </div>
  );
}
