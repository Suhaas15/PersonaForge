import { SPONSOR_SERVICE_CONFIG, SPONSORS } from "../config";

export interface YutoriTopic {
  title: string;
  summary: string;
}

export interface YutoriEnrichment {
  bullets: string[];
  entities: string[];
  risks: string[];
}

export type TopicEnrichment = YutoriEnrichment;

function extractTitleWords(title: string): string[] {
  const words = title
    .split(/\s+/)
    .map((w) => w.replace(/[^a-z0-9]/gi, ""))
    .filter(Boolean);

  const unique = Array.from(new Set(words));
  return unique.slice(0, 6);
}

function mockEnrichTopic(topic: YutoriTopic): YutoriEnrichment {
  const words = extractTitleWords(topic.title);
  const entities = words.slice(0, 3);

  const bullets: string[] = [];
  for (let i = 0; i < 3; i += 1) {
    const word = words[i] ?? "stakeholders";
    if (i === 0) {
      bullets.push(`How ${topic.title} could reshape ${word.toLowerCase()} practices.`);
    } else if (i === 1) {
      bullets.push(`Key risks and safeguards around ${word.toLowerCase()} in this regulation.`);
    } else {
      bullets.push(`Questions ${word.toLowerCase()} teams should ask before reacting.`);
    }
  }

  return {
    bullets,
    entities,
    risks: [],
  };
}

export class YutoriClient {
  async enrichTopic(topic: YutoriTopic): Promise<YutoriEnrichment> {
    if (SPONSORS.mockMode) {
      return mockEnrichTopic(topic);
    }

    // In real mode, enrichment is handled by enrichTopicWithYutori.
    throw new Error("YutoriClient.enrichTopic should not be used in real mode.");
  }
}

export async function enrichTopicWithYutori(
  input: YutoriTopic,
): Promise<TopicEnrichment | null> {
  if (SPONSOR_SERVICE_CONFIG.mockMode || !SPONSOR_SERVICE_CONFIG.yutoriEnabled) {
    return null;
  }

  const apiKey = SPONSOR_SERVICE_CONFIG.yutoriApiKey;
  const baseUrl = SPONSOR_SERVICE_CONFIG.yutoriBaseUrl;

  if (!apiKey) {
    return null;
  }

  const body = {
    task: "enrich_topic",
    input: {
      title: input.title,
      summary: input.summary,
    },
    output_schema: {
      type: "object",
      properties: {
        bullets: { type: "array", items: { type: "string" } },
        entities: { type: "array", items: { type: "string" } },
        risks: { type: "array", items: { type: "string" } },
      },
      required: ["bullets", "entities", "risks"],
    },
  };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 2000);

  try {
    const tryRequest = async (path: string) => {
      const response = await fetch(
        `${baseUrl.replace(/\/$/, "")}${path}`,
        {
          method: "POST",
          headers: {
            "X-API-Key": apiKey,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(body),
          signal: controller.signal,
        },
      );
      return response;
    };

    let response = await tryRequest("/v1/agents/tasks");
    if (!response.ok) {
      response = await tryRequest("/v1/tasks");
    }

    if (!response.ok) {
      // eslint-disable-next-line no-console
      console.warn(
        "Yutori enrich_topic request failed:",
        response.status,
        response.statusText,
      );
      return null;
    }

    const json = (await response.json()) as unknown;
    const container =
      (json as any)?.output ??
      (json as any)?.result ??
      (json as any);

    const bulletsRaw = container?.bullets;
    const entitiesRaw = container?.entities;
    const risksRaw = container?.risks;

    const bullets = Array.isArray(bulletsRaw)
      ? bulletsRaw.filter((b: unknown) => typeof b === "string")
      : [];
    const entities = Array.isArray(entitiesRaw)
      ? entitiesRaw.filter((e: unknown) => typeof e === "string")
      : [];
    const risks = Array.isArray(risksRaw)
      ? risksRaw.filter((r: unknown) => typeof r === "string")
      : [];

    if (!bullets.length && !entities.length && !risks.length) {
      return null;
    }

    return { bullets, entities, risks };
  } catch (error) {
    // eslint-disable-next-line no-console
    console.warn("Yutori enrich_topic error:", error);
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

export async function yutoriHealth(): Promise<{ ok: boolean; status: number }> {
  const { yutoriApiKey, yutoriBaseUrl } = SPONSOR_SERVICE_CONFIG;

  if (!yutoriApiKey) {
    return { ok: false, status: 0 };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 2000);

  try {
    const response = await fetch(
      `${yutoriBaseUrl.replace(/\/$/, "")}/health`,
      {
        method: "GET",
        headers: {
          "X-API-Key": yutoriApiKey,
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

