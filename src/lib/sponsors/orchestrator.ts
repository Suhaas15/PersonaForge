import { SPONSORS } from "../config";
import { FastinoClient, type FastinoInput } from "./fastino";
import { ModulateClient, type ModulateEmotionScore } from "./modulate";
import {
  YutoriClient,
  type TopicEnrichment,
  type YutoriTopic,
  enrichTopicWithYutori,
} from "./yutori";

export type OrchestratorLabel = "amplify" | "debate" | "factcheck";

export class SponsorOrchestrator {
  private fastino: FastinoClient;
  private yutori: YutoriClient;
  private modulate: ModulateClient;

  constructor() {
    this.fastino = new FastinoClient();
    this.yutori = new YutoriClient();
    this.modulate = new ModulateClient();
  }

  async maybeEnrichTopic(
    topic: YutoriTopic,
  ): Promise<TopicEnrichment | null> {
    if (!SPONSORS.yutori.enabled) {
      return null;
    }
    if (SPONSORS.mockMode) {
      return this.yutori.enrichTopic(topic);
    }
    return enrichTopicWithYutori(topic);
  }

  async maybeScoreEmotion(text: string): Promise<ModulateEmotionScore | null> {
    if (!SPONSORS.modulate.enabled) {
      return null;
    }
    return this.modulate.scoreEmotionText(text);
  }

  async maybeClassifyMessage(
    input: FastinoInput,
  ): Promise<{ label: OrchestratorLabel; confidence: number } | null> {
    if (!SPONSORS.fastino.enabled) {
      return null;
    }
    const result = await this.fastino.classify(input);

    if (!SPONSORS.mockMode && Math.random() < 0.1) {
      // eslint-disable-next-line no-console
      console.log(
        "[FASTINO]",
        input.agentRole,
        "->",
        result.label,
        `(${result.confidence.toFixed(2)})`,
      );
    }

    return result;
  }
}

