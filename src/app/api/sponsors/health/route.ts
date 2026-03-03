import { NextResponse } from "next/server";
import { yutoriHealth } from "@/lib/sponsors/yutori";
import { modulateHealth } from "@/lib/sponsors/modulate";

export const runtime = "nodejs";

export async function GET() {
  const [yutori, modulate] = await Promise.all([
    yutoriHealth(),
    modulateHealth(),
  ]);

  return NextResponse.json({
    yutori,
    modulate,
  });
}

