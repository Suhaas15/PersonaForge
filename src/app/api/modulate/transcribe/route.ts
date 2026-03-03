import { NextResponse } from "next/server";
import { ModulateClient } from "@/lib/sponsors/modulate";

export const runtime = "nodejs";

const client = new ModulateClient();

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file =
      formData.get("upload_file") ?? formData.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json(
        { ok: false, error: "missing file" },
        { status: 400 },
      );
    }

    const result = await client.transcribeAudio(file);
    const rawPreview =
      typeof result.raw === "string"
        ? result.raw.slice(0, 5000)
        : JSON.stringify(result.raw ?? null).slice(0, 5000);

    return NextResponse.json(
      {
        ok: true,
        text: result.text,
        duration_ms: result.durationMs ?? null,
        utterances: result.utterances ?? [],
        rawPreview,
      },
      { status: 200 },
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "unknown error";
    return NextResponse.json(
      { ok: false, error: message },
      { status: 500 },
    );
  }
}

