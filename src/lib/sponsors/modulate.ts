import {
  MODULATE_BASE_URL,
  MODULATE_STT_ENDPOINT,
  MODULATE_API_KEY,
  MODULATE_TEXT_EMOTION_ENDPOINT,
  SPONSOR_SERVICE_CONFIG,
  SPONSORS,
} from "../config";

export interface ModulateEmotionScore {
  arousal: number;
  valence: number;
}

export class ModulateClient {
  async scoreEmotionText(
    text: string,
  ): Promise<ModulateEmotionScore | null> {
    if (
      SPONSOR_SERVICE_CONFIG.mockMode ||
      !SPONSOR_SERVICE_CONFIG.modulateEnabled ||
      !MODULATE_TEXT_EMOTION_ENDPOINT
    ) {
      return null;
    }

    if (!MODULATE_API_KEY) {
      console.warn(
        "Modulate text emotion is enabled but MODULATE_API_KEY is missing.",
      );
      return null;
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2000);

    try {
      const response = await fetch(
        `${MODULATE_BASE_URL!.replace(/\/$/, "")}${MODULATE_TEXT_EMOTION_ENDPOINT}`,
        {
          method: "POST",
          headers: {
            "X-API-Key": MODULATE_API_KEY,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ text }),
          signal: controller.signal,
        },
      );

      if (!response.ok) {
        console.warn(
          "Modulate text emotion non-2xx response:",
          response.status,
          response.statusText,
        );
        return null;
      }

      const json = (await response.json()) as any;
      const arousal =
        typeof json?.arousal === "number"
          ? json.arousal
          : typeof json?.result?.arousal === "number"
            ? json.result.arousal
            : undefined;
      const valence =
        typeof json?.valence === "number"
          ? json.valence
          : typeof json?.result?.valence === "number"
            ? json.result.valence
            : undefined;

      if (
        typeof arousal !== "number" ||
        Number.isNaN(arousal) ||
        typeof valence !== "number" ||
        Number.isNaN(valence)
      ) {
        return null;
      }

      return { arousal, valence };
    } catch (error) {
      if ((error as Error).name === "AbortError") {
        console.warn("Modulate text emotion request timed out");
      } else {
        console.warn("Modulate text emotion error:", error);
      }
      return null;
    } finally {
      clearTimeout(timeout);
    }
  }

  async transcribeAudio(
    file: File,
  ): Promise<{
    text: string;
    durationMs?: number;
    utterances?: unknown[];
    raw: unknown;
  }> {
    if (SPONSOR_SERVICE_CONFIG.mockMode || !SPONSOR_SERVICE_CONFIG.modulateEnabled) {
      return { text: "Transcription unavailable (Modulate disabled).", raw: null };
    }

    if (!MODULATE_API_KEY) {
      throw new Error(
        "Modulate STT is enabled but MODULATE_API_KEY is missing. Check your environment configuration.",
      );
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);

    try {
      const formData = new FormData();
      formData.append("upload_file", file);
      formData.append("speaker_diarization", "true");
      formData.append("emotion_signal", "true");

      const response = await fetch(
        `${MODULATE_BASE_URL!.replace(/\/$/, "")}${MODULATE_STT_ENDPOINT}`,
        {
          method: "POST",
          headers: {
            "X-API-Key": MODULATE_API_KEY,
          },
          body: formData,
          signal: controller.signal,
        },
      );

      const bodyText = await response.text();
      if (!response.ok) {
        // eslint-disable-next-line no-console
        console.warn(
          "Modulate STT non-2xx response:",
          response.status,
          bodyText.slice(0, 300),
        );
      }

      let json: any;
      try {
        json = bodyText ? JSON.parse(bodyText) : {};
      } catch {
        return {
          text: "",
          durationMs: undefined,
          utterances: [],
          raw: bodyText.slice(0, 5000),
        };
      }

      const text = typeof json?.text === "string" ? json.text : "";
      const durationMs =
        typeof json?.duration_ms === "number" ? json.duration_ms : undefined;
      const utterances = Array.isArray(json?.utterances)
        ? json.utterances
        : [];

      return {
        text,
        durationMs,
        utterances,
        raw: json,
      };
    } catch (error) {
      if ((error as Error).name === "AbortError") {
        // eslint-disable-next-line no-console
        console.warn("Modulate STT request timed out");
      } else {
        // eslint-disable-next-line no-console
        console.warn("Modulate STT error:", error);
      }
      return { text: "Transcription unavailable.", durationMs: undefined, utterances: [], raw: null };
    } finally {
      clearTimeout(timeout);
    }
  }
}

export async function modulateHealth(): Promise<{ ok: boolean; status: number }> {
  const { modulateApiKey, modulateBaseUrl } = SPONSOR_SERVICE_CONFIG;

  if (!modulateBaseUrl) {
    return { ok: false, status: 0 };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 2000);

  try {
    const response = await fetch(
      `${modulateBaseUrl.replace(/\/$/, "")}/health`,
      {
        method: "GET",
        headers: {
          Authorization: modulateApiKey ? `Bearer ${modulateApiKey}` : "",
        },
        signal: controller.signal,
      },
    );

    return { ok: response.ok, status: response.status };
  } catch {
    return { ok: false, status: 0 };
  } finally {
    clearTimeout(timeout);
  }
}

