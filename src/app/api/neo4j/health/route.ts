import { NextResponse } from "next/server";
import { Neo4jService } from "@/lib/neo4j/service";

export const runtime = "nodejs";

const service = new Neo4jService();
const neo4jEnabled =
  process.env.NEO4J_ENABLED &&
  process.env.NEO4J_ENABLED.toLowerCase() === "true";

export async function GET() {
  if (!neo4jEnabled) {
    return NextResponse.json({
      ok: false,
      error: "neo4j disabled",
    });
  }

  try {
    const driver = (service as any).driver as unknown;
    const session = (service as any).driver?.session?.()
      ?? (service as any).getSession?.();

    if (!session) {
      throw new Error("Neo4j session unavailable");
    }

    try {
      await session.run("MATCH (n) RETURN 1 LIMIT 1");
    } finally {
      await session.close();
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "unknown error";
    return NextResponse.json(
      { ok: false, error: message },
      { status: 500 },
    );
  }
}

