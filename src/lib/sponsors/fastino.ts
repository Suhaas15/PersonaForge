import {
  PIONEER_CONFIG,
  SPONSORS,
  ensurePioneerConfigured,
} from "../config";

export type FastinoLabel = "amplify" | "debate" | "factcheck";

export interface FastinoClassification {
  label: FastinoLabel;
  confidence: number;
  latencyMs?: number;
}

export interface FastinoInput {
  topicTitle: string;
  topicSummary: string;
  agentRole: string;
  agentStance: string;
  agentMood: string;
  messageText: string;
}

function hashText(text: string): number {
  let hash = 0;
  for (let i = 0; i < text.length; i += 1) {
    const chr = text.charCodeAt(i);
    hash = (hash << 5) - hash + chr;
    hash |= 0; // keep 32-bit
  }
  return hash;
}

function mockClassify(text: string): FastinoClassification {
  const hash = Math.abs(hashText(text));
  const labels: FastinoLabel[] = ["amplify", "debate", "factcheck"];
  const label = labels[hash % labels.length];
  const confidence = 0.6 + (hash % 40) / 100; // 0.60 - 0.99

  return {
    label,
    confidence: Math.min(confidence, 0.99),
  };
}

const classificationCache = new Map<
  string,
  { result: FastinoClassification; timestamp: number }
>();

const CLASSIFICATION_TTL_MS = 30_000;

export class FastinoClient {
  async classify(input: FastinoInput): Promise<FastinoClassification> {
    const formattedText = `[${input.agentRole}] ${input.agentStance} ${input.agentMood} ${input.messageText}`;

    if (SPONSORS.mockMode) {
      return mockClassify(formattedText);
    }

    if (!SPONSORS.fastino.enabled) {
      return { label: "debate", confidence: 0.3 };
    }

    const now = Date.now();
    const cached = classificationCache.get(formattedText);
    if (cached && now - cached.timestamp < CLASSIFICATION_TTL_MS) {
      return cached.result;
    }

    try {
      ensurePioneerConfigured();
    } catch (error) {
      // Surface configuration issues clearly during development, but do not break the simulation.
      // eslint-disable-next-line no-console
      console.error(error);
      return { label: "debate", confidence: 0.3 };
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2000);

    const startedAt = Date.now();

    try {
      const response = await fetch(
        `${PIONEER_CONFIG.baseUrl.replace(/\/$/, "")}/felix/inference/classify`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${PIONEER_CONFIG.apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model_id: PIONEER_CONFIG.modelId,
            text: formattedText,
            categories: ["amplify", "debate", "factcheck"],
            include_confidence: true,
          }),
          signal: controller.signal,
        },
      );

      const latencyMs = Date.now() - startedAt;

      if (!response.ok) {
        // eslint-disable-next-line no-console
        console.error(
          "Fastino Pioneer classify request failed:",
          response.status,
          response.statusText,
        );
        return { label: "debate", confidence: 0.3, latencyMs };
      }

      const json = (await response.json()) as {
        prediction?: string;
        confidence?: number;
        latency_ms?: number;
      };

      const rawLabel = json.prediction;

      const allowedLabels: FastinoLabel[] = ["amplify", "debate", "factcheck"];
      const label = allowedLabels.includes(rawLabel as FastinoLabel)
        ? (rawLabel as FastinoLabel)
        : "debate";

      const confidence =
        typeof json.confidence === "number" && !Number.isNaN(json.confidence)
          ? json.confidence
          : 0.3;

      const result: FastinoClassification = {
        label,
        confidence,
        latencyMs: json.latency_ms ?? latencyMs,
      };
      classificationCache.set(formattedText, { result, timestamp: now });
      return result;
    } catch (error) {
      if ((error as Error).name === "AbortError") {
        // eslint-disable-next-line no-console
        console.warn("Fastino Pioneer classify request timed out");
      } else {
        // eslint-disable-next-line no-console
        console.error("Fastino Pioneer classify error:", error);
      }

      return { label: "debate", confidence: 0.3 };
    } finally {
      clearTimeout(timeout);
    }
  }
}

