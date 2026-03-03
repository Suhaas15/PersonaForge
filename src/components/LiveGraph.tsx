"use client";

import { useMemo } from "react";
import dynamic from "next/dynamic";

const ForceGraph2D = dynamic(
  () => import("react-force-graph-2d").then((mod) => mod.default),
  { ssr: false },
);

type AgentStance = "pro" | "neutral" | "con";
type AgentMood = "calm" | "tense";

type EdgeType = "amplify" | "debate" | "factcheck";

export interface LiveGraphAgent {
  id: string;
  name: string;
  stance: AgentStance;
  mood: AgentMood;
}

export interface LiveGraphEdge {
  from: string;
  to: string;
  type: EdgeType;
  tick: number;
  timestamp: string;
}

interface GraphNode extends LiveGraphAgent {
  // coordinates are provided by force-graph at runtime
  x?: number;
  y?: number;
}

interface GraphLink extends LiveGraphEdge {
  source: string;
  target: string;
}

interface LiveGraphProps {
  agents: LiveGraphAgent[];
  edges: LiveGraphEdge[];
}

export default function LiveGraph({ agents, edges }: LiveGraphProps) {
  const data = useMemo(
    () => ({
      nodes: agents.map<GraphNode>((agent) => ({
        ...agent,
      })),
      links: edges.map<GraphLink>((edge) => ({
        ...edge,
        source: edge.from,
        target: edge.to,
      })),
    }),
    [agents, edges],
  );

  return (
    <div className="h-[500px] w-full overflow-hidden rounded-md border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
      {/* ForceGraph2D is dynamically imported to avoid SSR issues */}
      <ForceGraph2D
        graphData={data as unknown as { nodes: unknown[]; links: unknown[] }}
        nodeLabel={(node: unknown) => {
          const n = node as GraphNode;
          return `${n.name} (${n.stance}, ${n.mood})`;
        }}
        nodeCanvasObject={(node: unknown, ctx, globalScale) => {
          const n = node as GraphNode;
          const radiusBase =
            n.stance === "pro" ? 10 : n.stance === "neutral" ? 8 : 7;

          const radius = radiusBase;
          const lineWidth = n.mood === "tense" ? 2.5 : 1.3;

          const x = n.x ?? 0;
          const y = n.y ?? 0;

          ctx.beginPath();
          ctx.arc(x, y, radius, 0, 2 * Math.PI, false);
          ctx.fillStyle = "#f4f4f5";
          ctx.fill();
          ctx.lineWidth = lineWidth;
          ctx.strokeStyle = "#27272a";
          ctx.stroke();

          const label = n.name;
          const fontSize = 10 / globalScale;
          ctx.font = `${fontSize}px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;
          ctx.textAlign = "center";
          ctx.textBaseline = "top";
          ctx.fillStyle = "#18181b";
          ctx.fillText(label, x, y + radius + 2);
        }}
        linkWidth={(link: unknown) => {
          const l = link as GraphLink;
          switch (l.type) {
            case "amplify":
              return 2.4;
            case "debate":
              return 1.8;
            case "factcheck":
            default:
              return 1.2;
          }
        }}
        linkLineDash={(link: unknown) => {
          const l = link as GraphLink;
          switch (l.type) {
            case "debate":
              return [4, 3];
            case "factcheck":
              return [2, 2];
            case "amplify":
            default:
              return undefined;
          }
        }}
        linkDirectionalParticles={0}
        cooldownTicks={60}
      />
    </div>
  );
}

