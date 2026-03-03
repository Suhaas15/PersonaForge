import { NextResponse } from "next/server";
import { Neo4jService, type Neo4jTickPayload } from "@/lib/neo4j/service";

export const runtime = "nodejs";

const NEO4J_ENABLED = process.env.NEO4J_ENABLED === "true";
const service = new Neo4jService();

export async function POST(request: Request) {
  if (!NEO4J_ENABLED) {
    return NextResponse.json(
      { ok: false, error: "neo4j disabled" },
      { status: 403 },
    );
  }

  try {
    const payload = (await request.json()) as Neo4jTickPayload;
    const ts = payload.timestamp ?? new Date().toISOString();

    payload.edges = (payload.edges ?? []).map((e) => ({
      ...e,
      tick: e.tick ?? payload.tick,
      timestamp: e.timestamp ?? ts,
    }));

    payload.messages = (payload.messages ?? []).map((m) => ({
      ...m,
      timestamp: m.timestamp ?? ts,
    }));

    // Temporary debug: confirm normalized payload
    // eslint-disable-next-line no-console
    console.log(
      "[INGEST]",
      payload.tick,
      "edges",
      payload.edges.length,
      "messages",
      payload.messages.length,
    );

    await service.ingestTick(payload);
    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "unknown error";
    return NextResponse.json(
      { ok: false, error: message },
      { status: 500 },
    );
  }
}

