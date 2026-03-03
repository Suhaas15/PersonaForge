export type AgentStance = "pro" | "neutral" | "con";

export type AgentMood = "calm" | "tense";

export interface Agent {
  id: string;
  name: string;
  stance: AgentStance;
  mood: AgentMood;
}

export interface Topic {
  title: string;
  summary: string;
  bullets?: string[];
  entities?: string[];
  enrichment?: {
    bullets: string[];
    entities: string[];
    risks: string[];
  };
}

export interface SimulationMessage {
  id: string;
  tick: number;
  agentId: string;
  agentName: string;
  text: string;
  stance: AgentStance;
  mood: AgentMood;
  intensity: number;
}

export type EdgeType = "amplify" | "debate" | "factcheck";

export interface SimulationEdge {
  from: string;
  to: string;
  type: EdgeType;
  tick: number;
  timestamp: string;
}

export interface SimulationMetrics {
  sentiment: number;
  polarization: number;
  tension: number;
}

export interface SimulationTickPayload {
  tick: number;
  timestamp: string;
  topic: Topic;
  agents: Agent[];
  messages: SimulationMessage[];
  edges: SimulationEdge[];
  metrics: SimulationMetrics;
}

type PRNG = () => number;

function mulberry32(seed: number): PRNG {
  let t = seed >>> 0;
  return function () {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

import type { SponsorOrchestrator } from "../sponsors/orchestrator";

export class SimulationEngine {
  private tickCount = 0;
  private agents: Agent[];
  private rng: PRNG;
  private topic: Topic;
  private messages: SimulationMessage[] = [];
  private lastMessagesByAgent: Record<string, string> = {};

  constructor(seed: number = Date.now(), private orchestrator?: SponsorOrchestrator) {
    this.rng = mulberry32(seed);
    this.agents = [
      { id: "influencer", name: "Influencer", stance: "pro", mood: "calm" },
      { id: "skeptic", name: "Skeptic", stance: "con", mood: "tense" },
      { id: "analyst", name: "Analyst", stance: "neutral", mood: "calm" },
      { id: "journalist", name: "Journalist", stance: "neutral", mood: "tense" },
      { id: "optimist", name: "Optimist", stance: "pro", mood: "calm" },
      { id: "conspiracy", name: "Conspiracy", stance: "con", mood: "tense" },
    ];

    this.topic = {
      title: "New AI regulation announced",
      summary:
        "A new AI regulation has been proposed, shaping how models are built, audited, and deployed.",
    };
  }

  async setTopic(topic: Topic): Promise<Topic> {
    const base: Topic = {
      title: topic.title,
      summary: topic.summary,
    };

    this.topic = base;

    if (this.orchestrator) {
      const enrichment = await this.orchestrator.maybeEnrichTopic({
        title: base.title,
        summary: base.summary,
      });

      if (enrichment) {
        this.topic = {
          ...base,
          bullets: enrichment.bullets,
          entities: enrichment.entities,
          enrichment: {
            bullets: enrichment.bullets,
            entities: enrichment.entities,
            risks: enrichment.risks,
          },
        };
      }
    }

    return this.topic;
  }

  async next(): Promise<SimulationTickPayload> {
    this.applyRandomAdjustments();
    this.tickCount += 1;

    const messagesForTick: SimulationMessage[] = [];
    const edgesForTick: SimulationEdge[] = [];
    const tickTimestamp = new Date().toISOString();

    const numPosters = this.randomInt(2, 4);
    const indices = Array.from({ length: this.agents.length }, (_, i) => i);

    for (let p = 0; p < numPosters && indices.length > 0; p += 1) {
      const i = this.randomInt(0, indices.length - 1);
      const agentIndex = indices.splice(i, 1)[0];
      const agent = this.agents[agentIndex];

      const baseIntensity = this.computeIntensity(agent);
      let intensity = baseIntensity;
      let moodForMessage = agent.mood;

      const text = this.generateMessageText(agent, baseIntensity, this.topic);

      if (this.orchestrator) {
        const emotion = await this.orchestrator.maybeScoreEmotion(text);
        if (emotion) {
          const arousalAdjust = (emotion.arousal - 0.5) * 0.8;
          intensity = clamp(baseIntensity + arousalAdjust, 0.2, 1);

          if (emotion.arousal > 0.65) {
            moodForMessage = "tense";
          } else if (emotion.arousal < 0.35) {
            moodForMessage = "calm";
          }
        }
      }
      const messageId = `${this.tickCount}-${agent.id}-${Math.floor(
        this.randomInt(0, 9999),
      )}`;

      const message: SimulationMessage = {
        id: messageId,
        tick: this.tickCount,
        agentId: agent.id,
        agentName: agent.name,
        text,
        stance: agent.stance,
        mood: moodForMessage,
        intensity,
      };

      messagesForTick.push(message);
      this.messages.push(message);
      this.lastMessagesByAgent[agent.id] = messageId;

      let classification: { label: EdgeType; confidence: number } | null = null;

      let classificationBudget = 4;

      if (this.orchestrator && classificationBudget > 0) {
        const classificationResult =
          await this.orchestrator.maybeClassifyMessage({
            topicTitle: this.topic.title,
            topicSummary: this.topic.summary,
            agentRole: agent.name,
            agentStance: agent.stance,
            agentMood: moodForMessage,
            messageText: text,
          });

        if (classificationResult) {
          const effectiveLabel =
            classificationResult.confidence >= 0.6
              ? classificationResult.label
              : "debate";
          classification = {
            label: effectiveLabel,
            confidence: classificationResult.confidence,
          };
          classificationBudget -= 1;
        }
      }

      const edgesForPoster = this.generateEdgesForPoster(
        agent,
        agentIndex,
        classification?.label ?? null,
        this.tickCount,
        tickTimestamp,
      );
      edgesForTick.push(...edgesForPoster);
    }

    const metrics = this.computeMetrics(messagesForTick);

    return {
      tick: this.tickCount,
      timestamp: tickTimestamp,
      topic: this.topic,
      agents: this.agents.map((agent) => ({ ...agent })),
      messages: messagesForTick,
      edges: edgesForTick,
      metrics,
    };
  }

  private applyRandomAdjustments() {
    const countToAdjust = this.randomInt(1, 2);
    const indices = Array.from({ length: this.agents.length }, (_, i) => i);

    for (let i = 0; i < countToAdjust && indices.length > 0; i += 1) {
      const pickIndex = this.randomInt(0, indices.length - 1);
      const agentIndex = indices.splice(pickIndex, 1)[0];
      const agent = this.agents[agentIndex];

      const newStance = this.pickOther(agent.stance, ["pro", "neutral", "con"]);
      const newMood = this.pickOther(agent.mood, ["calm", "tense"]);

      this.agents[agentIndex] = {
        ...agent,
        stance: newStance,
        mood: newMood,
      };
    }
  }

  private computeIntensity(agent: Agent): number {
    const base =
      agent.stance === "neutral"
        ? 0.4
        : agent.stance === "pro"
          ? 0.7
          : 0.8;
    const moodBoost = agent.mood === "tense" ? 0.3 : 0;
    const jitter = (this.rng() - 0.5) * 0.2;
    return clamp(base + moodBoost + jitter, 0.2, 1);
  }

  private generateMessageText(
    agent: Agent,
    intensity: number,
    topic: Topic,
  ): string {
    const { title } = topic;
    const stance = agent.stance;
    const mood = agent.mood;

    const emphasis =
      intensity > 0.8 ? "really" : intensity > 0.6 ? "quite" : "somewhat";

    switch (agent.id) {
      case "influencer": {
        if (stance === "pro") {
          return `🚨 ${title} just dropped. ${emphasis} good news if you care about responsible AI. Share this and let builders know what’s coming.`;
        }
        if (stance === "con") {
          return `Hot take on ${title}: this feels ${emphasis} overreaching. Creators and startups need a voice here — don’t sit this out.`;
        }
        return `Seeing a lot of mixed reactions to ${title}. Curious where you stand — does this move AI in the right direction or not yet?`;
      }
      case "analyst": {
        if (stance === "pro") {
          return `${title}: early read is that compliance overhead rises modestly, but long‑term risk exposure drops ${emphasis} significantly. Net positive for serious teams.`;
        }
        if (stance === "con") {
          return `${title}: short‑term cost curves spike, especially for smaller orgs. The question is whether the projected risk reduction justifies the drag on experimentation.`;
        }
        return `${title}: still parsing the language, but the core trade‑off is speed vs assurance. Details on thresholds and audits will matter more than headlines.`;
      }
      case "journalist": {
        if (stance === "pro") {
          return `According to early reports on ${title}, regulators are prioritizing transparency and auditability over raw deployment speed. Experts say this could stabilize the ecosystem.`;
        }
        if (stance === "con") {
          return `Reports on ${title} suggest new friction for AI rollouts, especially in smaller companies. Critics warn it may slow down innovation without clear evidence of benefit.`;
        }
        return `Coverage around ${title} remains cautious. Sources emphasize that the real impact will only be clear once enforcement guidance and case studies emerge.`;
      }
      case "skeptic": {
        if (stance === "pro") {
          return `Everyone is cheering ${title}, but who is actually accountable if it doesn’t work? I want to see how this is enforced before celebrating.`;
        }
        if (stance === "con") {
          return `${title} is being sold as a safeguard, but where’s the proof it solves the real failure modes? This feels ${emphasis} more like optics than substance.`;
        }
        return `Before we treat ${title} as a win or a loss, can we see clear examples of what would have changed in past incidents? Otherwise it’s just another headline.`;
      }
      case "optimist": {
        if (stance === "pro") {
          return `${title} is a chance to prove that powerful AI and strong safeguards can grow together. Long term, this could build the trust we need for bigger leaps.`;
        }
        if (stance === "con") {
          return `I’m wary of parts of ${title}, but I still think we can shape it into something that protects people without blocking the upside. This is a starting point, not the end.`;
        }
        return `${title} is complicated, but I’m hopeful. If builders, policymakers, and users actually talk to each other, this could evolve into something genuinely constructive.`;
      }
      case "conspiracy": {
        if (stance === "pro") {
          return `Wild thought: what if ${title} is actually about forcing the biggest AI labs to reveal more of what they’re doing behind closed doors? Pure speculation, but the timing is interesting.`;
        }
        if (stance === "con") {
          return `Not saying it’s true, but imagine ${title} quietly locking smaller labs out while big players shape the “safety” narrative. Feels like a story we’ll look back on later.`;
        }
        return `It’s probably nothing, but the way ${title} appeared right as major AI rollouts accelerate is… curious. Worth keeping an eye on, purely as a pattern.`;
      }
      default: {
        return `${agent.name} reacts to ${title} with a ${mood} and ${stance} tone.`;
      }
    }
  }

  private generateEdgesForPoster(
    poster: Agent,
    posterIndex: number,
    classifiedLabel: EdgeType | null,
    tick: number,
    timestamp: string,
  ): SimulationEdge[] {
    const others = this.agents
      .map((agent, index) => ({ agent, index }))
      .filter(({ index }) => index !== posterIndex);

    if (others.length === 0) {
      return [];
    }

    const count = this.randomInt(0, Math.min(2, others.length));
    const pool = [...others];
    const edges: SimulationEdge[] = [];

    for (let i = 0; i < count && pool.length > 0; i += 1) {
      const pickIndex = this.randomInt(0, pool.length - 1);
      const { agent: reactor, index } = pool.splice(pickIndex, 1)[0];

      const type = this.inferEdgeType(reactor, poster, classifiedLabel);

      edges.push({
        from: reactor.id,
        to: poster.id,
        type,
        tick,
        timestamp,
      });
    }

    return edges;
  }

  private inferEdgeType(
    from: Agent,
    to: Agent,
    classifiedLabel: EdgeType | null,
  ): EdgeType {
    if (classifiedLabel) {
      return classifiedLabel;
    }
    if (from.id === "journalist" && to.id === "conspiracy") {
      return "factcheck";
    }
    if (from.id === "skeptic" && to.id === "optimist") {
      return "debate";
    }
    if (from.id === "influencer") {
      return "amplify";
    }

    const options: EdgeType[] = ["amplify", "debate", "factcheck"];
    return options[this.randomInt(0, options.length - 1)];
  }

  private computeMetrics(messagesForTick: SimulationMessage[]): SimulationMetrics {
    const sentimentWeights: Record<AgentStance, number> = {
      pro: 0.7,
      neutral: 0,
      con: -0.7,
    };

    let weightedSum = 0;
    let totalIntensity = 0;

    for (const message of messagesForTick) {
      const weight = sentimentWeights[message.stance];
      weightedSum += weight * message.intensity;
      totalIntensity += message.intensity;
    }

    const sentiment =
      totalIntensity > 0 ? clamp(weightedSum / totalIntensity, -1, 1) : 0;

    let proCount = 0;
    let conCount = 0;
    let tenseCount = 0;

    for (const agent of this.agents) {
      if (agent.stance === "pro") proCount += 1;
      if (agent.stance === "con") conCount += 1;
      if (agent.mood === "tense") tenseCount += 1;
    }

    const engaged = proCount + conCount;
    const polarization =
      engaged === 0
        ? 0
        : (2 * Math.min(proCount, conCount)) / engaged;

    const tension =
      this.agents.length > 0 ? tenseCount / this.agents.length : 0;

    return {
      sentiment,
      polarization: clamp(polarization, 0, 1),
      tension: clamp(tension, 0, 1),
    };
  }

  private randomInt(min: number, max: number): number {
    const value = this.rng();
    return Math.floor(value * (max - min + 1)) + min;
  }

  private pickOther<T>(current: T, options: readonly T[]): T {
    const filtered = options.filter((option) => option !== current);
    if (filtered.length === 0) {
      return current;
    }
    const index = this.randomInt(0, filtered.length - 1);
    return filtered[index];
  }
}

