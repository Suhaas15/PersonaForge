import { NextResponse } from "next/server";
import { getSimulationEngine } from "@/lib/simulation";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { title, summary } = body ?? {};

    if (typeof title !== "string" || typeof summary !== "string") {
      return NextResponse.json(
        { error: "Invalid payload, expected { title, summary }" },
        { status: 400 },
      );
    }

    const engine = getSimulationEngine();
    const topic = await engine.setTopic({ title, summary });

    return NextResponse.json({ ok: true, topic }, { status: 200 });
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
}

