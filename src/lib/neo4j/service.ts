import type { Driver, Session } from "neo4j-driver";
import { getNeo4jDriver } from "./client";

export interface Neo4jAgent {
  id: string;
  name: string;
}

export interface Neo4jMessage {
  id: string;
  tick: number;
  agentId: string;
  agentName: string;
  text: string;
  stance: string;
  mood: string;
  intensity: number;
  timestamp?: string;
}

export type Neo4jEdgeType = "amplify" | "debate" | "factcheck";

export interface Neo4jEdge {
  from: string;
  to: string;
  type: Neo4jEdgeType;
  tick: number;
  timestamp?: string;
}

export interface Neo4jTickPayload {
  tick: number;
  timestamp?: string;
  agents: Neo4jAgent[];
  messages: Neo4jMessage[];
  edges: Neo4jEdge[];
  // topic and metrics are included in the API payload, but we don't persist them yet.
}

export class Neo4jService {
  private get driver(): Driver {
    return getNeo4jDriver();
  }

  private getSession(): Session {
    return this.driver.session();
  }

  async upsertAgent(agent: Neo4jAgent): Promise<void> {
    const session = this.getSession();
    try {
      await session.run(
        `
        MERGE (a:Agent { id: $id })
        SET a.name = $name
        `,
        {
          id: agent.id,
          name: agent.name,
        },
      );
    } finally {
      await session.close();
    }
  }

  async createMessage(msg: Neo4jMessage): Promise<void> {
    const session = this.getSession();
    try {
      const ts = msg.timestamp ?? new Date().toISOString();
      await session.run(
        `
        MERGE (m:Message { id: $id })
        SET m.tick = $tick,
            m.agentId = $agentId,
            m.agentName = $agentName,
            m.text = $text,
            m.stance = $stance,
            m.mood = $mood,
            m.intensity = $intensity,
            m.timestamp = $timestamp
        WITH m
        MATCH (a:Agent { id: $agentId })
        MERGE (a)-[:POSTED]->(m)
        `,
        {
          id: msg.id,
          tick: msg.tick,
          agentId: msg.agentId,
          agentName: msg.agentName,
          text: msg.text,
          stance: msg.stance,
          mood: msg.mood,
          intensity: msg.intensity,
          timestamp: ts,
        },
      );
    } finally {
      await session.close();
    }
  }

  async createEdge(edge: Neo4jEdge): Promise<void> {
    const session = this.getSession();
    try {
      const ts = edge.timestamp ?? new Date().toISOString();
      const query = `
        MERGE (a:Agent { id: $from })
        MERGE (b:Agent { id: $to })
        MERGE (a)-[r:INFLUENCED { tick: $tick, type: $type }]->(b)
        SET r.timestamp = $timestamp
      `;
      await session.run(
        query,
        {
          from: edge.from,
          to: edge.to,
          tick: edge.tick,
          type: edge.type,
          timestamp: ts,
        },
      );
    } finally {
      await session.close();
    }
  }

  async ingestTick(payload: Neo4jTickPayload): Promise<void> {
    const fallbackTimestamp = payload.timestamp ?? new Date().toISOString();
    if (!payload.timestamp) {
      payload.timestamp = fallbackTimestamp;
    }

    const agents = Array.isArray(payload.agents) ? payload.agents : [];
    const messages = Array.isArray(payload.messages) ? payload.messages : [];
    const edges = Array.isArray(payload.edges) ? payload.edges : [];

    for (const agent of agents) {
      await this.upsertAgent(agent);
    }

    for (const msg of messages) {
      const msgWithTimestamp: Neo4jMessage = {
        ...msg,
        timestamp: msg.timestamp ?? fallbackTimestamp,
      };
      await this.createMessage(msgWithTimestamp);
    }

    for (const edge of edges ?? []) {
      const edgeWithTimestamp: Neo4jEdge = {
        ...edge,
        timestamp: edge.timestamp ?? fallbackTimestamp,
      };
      await this.createEdge(edgeWithTimestamp);
    }
  }
}

