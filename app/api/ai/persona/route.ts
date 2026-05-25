import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { AiPersona } from "@/lib/ai/prompts";

const VALID_PERSONAS: AiPersona[] = ["drill_sergeant", "nurturer", "nietzsche", "rational"];

export async function PATCH(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const persona = body.persona as AiPersona;

  if (!VALID_PERSONAS.includes(persona)) {
    return NextResponse.json({ error: "Invalid persona" }, { status: 400 });
  }

  const { error } = await supabase
    .from("users")
    .update({ ai_persona: persona })
    .eq("id", user.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ persona });
}
