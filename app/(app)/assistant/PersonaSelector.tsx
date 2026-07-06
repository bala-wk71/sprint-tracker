"use client";

import { useState } from "react";
import { Skull, Heart, Flame, Brain } from "lucide-react";
import { cn } from "@/lib/utils";
import { AI_PERSONAS, type AiPersona } from "@/lib/ai/prompts";

const PERSONA_ICONS: Record<AiPersona, typeof Skull> = {
  drill_sergeant: Skull,
  nurturer: Heart,
  nietzsche: Flame,
  rational: Brain,
};

const PERSONA_ACTIVE: Record<AiPersona, string> = {
  drill_sergeant: "border-red-500 bg-red-500/15 text-foreground",
  nurturer: "border-pink-500 bg-pink-500/15 text-foreground",
  nietzsche: "border-orange-500 bg-orange-500/15 text-foreground",
  rational: "border-blue-500 bg-blue-500/15 text-foreground",
};

const PERSONA_ICON_COLOR: Record<AiPersona, string> = {
  drill_sergeant: "text-red-500",
  nurturer: "text-pink-500",
  nietzsche: "text-orange-500",
  rational: "text-blue-500",
};

export function PersonaSelector({ current }: { current: AiPersona }) {
  const [selected, setSelected] = useState<AiPersona>(current);
  const [saving, setSaving] = useState(false);

  const handleSelect = async (persona: AiPersona) => {
    if (persona === selected || saving) return;
    const previous = selected;
    setSaving(true);
    setSelected(persona);

    try {
      await fetch("/api/ai/persona", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ persona }),
      });
    } catch {
      setSelected(previous);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {(Object.keys(AI_PERSONAS) as AiPersona[]).map((key) => {
        const Icon = PERSONA_ICONS[key];
        const isActive = selected === key;

        return (
          <button
            key={key}
            onClick={() => handleSelect(key)}
            disabled={saving}
            title={AI_PERSONAS[key].description}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
              isActive
                ? PERSONA_ACTIVE[key]
                : "border-border text-muted-foreground hover:border-muted-foreground/50 hover:text-foreground",
              saving && "opacity-60"
            )}
          >
            <Icon
              className={cn(
                "h-3.5 w-3.5",
                isActive ? PERSONA_ICON_COLOR[key] : "text-muted-foreground"
              )}
            />
            {AI_PERSONAS[key].label}
          </button>
        );
      })}
    </div>
  );
}
