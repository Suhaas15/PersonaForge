import { NextResponse } from "next/server";
import { PIONEER_API_KEY, PERSONAFORGE_MODEL_ID } from "@/lib/config";

export const runtime = "nodejs";

export async function GET() {
  const ok = Boolean(PIONEER_API_KEY && PERSONAFORGE_MODEL_ID);

  // We deliberately only check for configuration presence here.
  // Optionally, a tiny classify ping could be added later.

  return NextResponse.json({
    ok,
  });
}

