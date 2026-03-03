"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";

type AgentStance = "pro" | "neutral" | "con";
type AgentMood = "calm" | "tense";

interface Agent {
  id: string;
  name: string;
  stance: AgentStance;
  mood: AgentMood;
}

interface Topic {
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

interface Message {
  id: string;
  tick: number;
  agentId: string;
  agentName: string;
  text: string;
  stance: AgentStance;
  mood: AgentMood;
  intensity: number;
}

type EdgeType = "amplify" | "debate" | "factcheck";

interface Edge {
  from: string;
  to: string;
  type: EdgeType;
  tick: number;
  timestamp: string;
}

interface Metrics {
  sentiment: number;
  polarization: number;
  tension: number;
}

interface TickPayload {
  tick: number;
  timestamp: string;
  topic: Topic;
  agents: Agent[];
  messages: Message[];
  edges: Edge[];
  metrics: Metrics;
}

const LiveGraph = dynamic(() => import("@/components/LiveGraph"), {
  ssr: false,
});

export default function Home() {
  const [sponsorStatus, setSponsorStatus] = useState<{
    yutori?: { ok: boolean; status?: number };
    modulate?: { ok: boolean; status?: number };
    pioneer?: { ok: boolean };
    neo4j?: { ok: boolean };
    mockMode?: boolean;
  } | null>(null);
  const [statusUpdatedAt, setStatusUpdatedAt] = useState<Date | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [latestTick, setLatestTick] = useState<TickPayload | null>(null);
  const [topicTitle, setTopicTitle] = useState("");
  const [topicSummary, setTopicSummary] = useState("");
  const [isSettingTopic, setIsSettingTopic] = useState(false);
  const [feedMessages, setFeedMessages] = useState<Message[]>([]);
  const [persistToNeo4j, setPersistToNeo4j] = useState(false);
  const [ingestStatus, setIngestStatus] = useState<string | null>(null);
  const [sttFile, setSttFile] = useState<File | null>(null);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [sttText, setSttText] = useState<string | null>(null);
  const [sttRaw, setSttRaw] = useState<string | null>(null);
  const [showSttRaw, setShowSttRaw] = useState(false);
  const [sttDurationMs, setSttDurationMs] = useState<number | null>(null);
  const [sttUtterances, setSttUtterances] = useState<any[]>([]);
  const [showUtterances, setShowUtterances] = useState(false);
  const [demoRunning, setDemoRunning] = useState(false);
  const [demoSteps, setDemoSteps] = useState<{
    transcribe: "idle" | "pending" | "ok" | "error";
    topic: "idle" | "pending" | "ok" | "error";
    simulation: "idle" | "pending" | "ok" | "error";
    neo4j: "idle" | "pending" | "ok" | "error" | "skipped";
  }>({
    transcribe: "idle",
    topic: "idle",
    simulation: "idle",
    neo4j: "idle",
  });
  const esRef = useRef<EventSource | null>(null);
  const lastIngestRef = useRef<number>(0);

  useEffect(() => {
    void (async () => {
      try {
        const [sponsorRes, pioneerRes, neo4jRes] = await Promise.all([
          fetch("/api/sponsors/health"),
          fetch("/api/pioneer/health"),
          fetch("/api/neo4j/health"),
        ]);

        const sponsorJson = (await sponsorRes.json()) as {
          yutori: { ok: boolean; status?: number };
          modulate: { ok: boolean; status?: number };
          mockMode?: boolean;
        };
        const pioneerJson = (await pioneerRes.json()) as { ok: boolean };
        const neo4jJson = (await neo4jRes.json()) as { ok: boolean };

        setSponsorStatus({
          yutori: sponsorJson.yutori,
          modulate: sponsorJson.modulate,
          pioneer: pioneerJson,
          neo4j: neo4jJson,
          mockMode: sponsorJson.mockMode,
        });
        setStatusUpdatedAt(new Date());
      } catch {
        // best-effort; leave status as null on error
      }
    })();

    return () => {
      if (esRef.current) {
        esRef.current.close();
        esRef.current = null;
      }
    };
  }, []);

  async function handleSetTopic() {
    if (!topicTitle.trim() || !topicSummary.trim()) {
      // Keep it simple: require both fields.
      return;
    }

    setIsSettingTopic(true);
    try {
      const res = await fetch("/api/topic", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          title: topicTitle.trim(),
          summary: topicSummary.trim(),
        }),
      });

      if (!res.ok) {
        console.error("Failed to set topic", await res.text());
      }
    } catch (error) {
      console.error("Error setting topic", error);
    } finally {
      setIsSettingTopic(false);
    }
  }

  async function handleTranscribe() {
    if (!sttFile) return;

    setIsTranscribing(true);
    setSttText(null);
    setSttRaw(null);
    setSttDurationMs(null);
    setSttUtterances([]);
    try {
      const formData = new FormData();
      formData.append("upload_file", sttFile);

      const res = await fetch("/api/modulate/transcribe", {
        method: "POST",
        body: formData,
      });

      const json = (await res.json()) as {
        ok: boolean;
        text?: string;
        duration_ms?: number | null;
        utterances?: any[];
        rawPreview?: string;
        error?: string;
      };

      if (!res.ok || !json.ok) {
        setSttText(json.error ?? "Transcription failed.");
        return;
      }

      setSttText(json.text ?? null);
      setSttRaw(json.rawPreview ?? null);
      setSttDurationMs(
        typeof json.duration_ms === "number" ? json.duration_ms : null,
      );
      setSttUtterances(Array.isArray(json.utterances) ? json.utterances : []);
    } catch (error) {
      setSttText(
        error instanceof Error ? error.message : "Unknown transcription error.",
      );
    } finally {
      setIsTranscribing(false);
    }
  }

  async function handleUseTranscriptAsTopic() {
    if (!sttText) return;

    const trimmed = sttText.trim();
    if (!trimmed) return;

    const title = trimmed.slice(0, 60) || "Spoken Topic";
    const summary = trimmed.slice(0, 500);

    const speakerIds = new Set(
      sttUtterances
        .map((u) => (u && (u.speaker ?? u.speaker_id ?? null)))
        .filter((v) => v != null),
    );
    const speakerCount = speakerIds.size || null;

    const emotionCounts = new Map<string, number>();
    for (const u of sttUtterances) {
      const e = (u && (u.emotion ?? u.emotion_label)) as string | undefined;
      if (!e) continue;
      emotionCounts.set(e, (emotionCounts.get(e) ?? 0) + 1);
    }
    let dominantEmotion: string | null = null;
    let bestCount = 0;
    for (const [e, count] of emotionCounts.entries()) {
      if (count > bestCount) {
        bestCount = count;
        dominantEmotion = e;
      }
    }

    setTopicTitle(title);
    setTopicSummary(summary);

    try {
      const res = await fetch("/api/topic", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          title,
          summary,
          metadata: {
            speaker_count: speakerCount,
            dominant_emotion: dominantEmotion,
          },
        }),
      });
      if (!res.ok) {
        // eslint-disable-next-line no-console
        console.error("Failed to set topic from transcript", await res.text());
      }
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error("Error setting topic from transcript", error);
    }
  }

  async function handleRunFullDemo() {
    if (!sttFile) {
      setSttText("Please select an audio file first.");
      return;
    }

    setDemoRunning(true);
    setDemoSteps({
      transcribe: "pending",
      topic: "idle",
      simulation: "idle",
      neo4j: "idle",
    });

    let transcript: string | null = null;

    // Step 1: Transcribe
    try {
      const formData = new FormData();
      formData.append("upload_file", sttFile);

      const res = await fetch("/api/modulate/transcribe", {
        method: "POST",
        body: formData,
      });

      const json = (await res.json()) as {
        ok: boolean;
        text?: string;
        duration_ms?: number | null;
        utterances?: any[];
        rawPreview?: string;
        error?: string;
      };

      if (!res.ok || !json.ok || !json.text) {
        setDemoSteps((prev) => ({ ...prev, transcribe: "error" }));
        setDemoRunning(false);
        setSttText(json.error ?? "Transcription failed.");
        return;
      }

      transcript = json.text;
      setSttText(json.text);
      setSttRaw(json.rawPreview ?? null);
      setSttDurationMs(
        typeof json.duration_ms === "number" ? json.duration_ms : null,
      );
      setSttUtterances(Array.isArray(json.utterances) ? json.utterances : []);
      setDemoSteps((prev) => ({ ...prev, transcribe: "ok" }));
    } catch (error) {
      setDemoSteps((prev) => ({ ...prev, transcribe: "error" }));
      setDemoRunning(false);
      setSttText(
        error instanceof Error ? error.message : "Unknown transcription error.",
      );
      return;
    }

    if (!transcript) {
      setDemoRunning(false);
      return;
    }

    // Step 2: Topic
    setDemoSteps((prev) => ({ ...prev, topic: "pending" }));
    try {
      const trimmed = transcript.trim();
      const title = trimmed.slice(0, 60) || "Spoken Topic";
      const summary = trimmed.slice(0, 500);

      setTopicTitle(title);
      setTopicSummary(summary);

      const speakerIds = new Set(
        sttUtterances
          .map((u) => (u && (u.speaker ?? u.speaker_id ?? null)))
          .filter((v) => v != null),
      );
      const speakerCount = speakerIds.size || null;

      const emotionCounts = new Map<string, number>();
      for (const u of sttUtterances) {
        const e = (u && (u.emotion ?? u.emotion_label)) as string | undefined;
        if (!e) continue;
        emotionCounts.set(e, (emotionCounts.get(e) ?? 0) + 1);
      }
      let dominantEmotion: string | null = null;
      let bestCount = 0;
      for (const [e, count] of emotionCounts.entries()) {
        if (count > bestCount) {
          bestCount = count;
          dominantEmotion = e;
        }
      }

      const res = await fetch("/api/topic", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          title,
          summary,
          metadata: {
            speaker_count: speakerCount,
            dominant_emotion: dominantEmotion,
          },
        }),
      });

      if (!res.ok) {
        setDemoSteps((prev) => ({ ...prev, topic: "error" }));
      } else {
        setDemoSteps((prev) => ({ ...prev, topic: "ok" }));
      }
    } catch {
      setDemoSteps((prev) => ({ ...prev, topic: "error" }));
    }

    // Step 3: Simulation
    setDemoSteps((prev) => ({ ...prev, simulation: "pending" }));
    startSimulation();
    setDemoSteps((prev) => ({ ...prev, simulation: "ok" }));

    // Step 4: Neo4j persistence (optional)
    if (sponsorStatus?.neo4j?.ok) {
      setDemoSteps((prev) => ({ ...prev, neo4j: "pending" }));
      setPersistToNeo4j(true);
      setDemoSteps((prev) => ({ ...prev, neo4j: "ok" }));
    } else {
      setDemoSteps((prev) => ({ ...prev, neo4j: "skipped" }));
    }

    setDemoRunning(false);
  }

  function startSimulation() {
    if (esRef.current) {
      esRef.current.close();
      esRef.current = null;
    }

    setIsConnecting(true);

    const es = new EventSource("/api/stream");
    esRef.current = es;

    es.onopen = () => {
      console.log("[SSE] open");
      setIsConnecting(false);
    };

    es.addEventListener("status", (event) => {
      console.log("[SSE] status", (event as MessageEvent).data);
    });

    es.addEventListener("tick", (event) => {
      const data = (event as MessageEvent).data;
      console.log("[SSE] tick", data);

      try {
        const parsed: TickPayload = JSON.parse(data);
        setLatestTick(parsed);
        setFeedMessages((prev) => {
          const combined = [...parsed.messages, ...prev];
          // keep a reasonable window
          return combined.slice(0, 50);
        });

        if (persistToNeo4j) {
          const now = Date.now();
          if (now - lastIngestRef.current >= 1000) {
            lastIngestRef.current = now;
            void (async () => {
              try {
                const res = await fetch("/api/ingest", {
                  method: "POST",
                  headers: {
                    "Content-Type": "application/json",
                  },
                  body: JSON.stringify(parsed),
                });
                if (!res.ok) {
                  const text = await res.text();
                  setIngestStatus(`Ingest error: ${text}`);
                } else {
                  setIngestStatus("Last ingest OK");
                }
              } catch (error) {
                setIngestStatus(
                  `Ingest error: ${
                    error instanceof Error ? error.message : "unknown"
                  }`,
                );
              }
            })();
          }
        }
      } catch (error) {
        console.error("Failed to parse tick payload", error);
      }
    });

    es.onerror = (event) => {
      console.log("[SSE] error", event);
      setIsConnecting(false);
      es.close();
      esRef.current = null;
    };
  }

  return (
    <div className="min-h-screen bg-zinc-50 text-zinc-950 dark:bg-black dark:text-zinc-50">
      <main className="mx-auto flex max-w-3xl flex-col gap-8 px-6 py-20">
        {sponsorStatus && (
          <section className="rounded-lg border border-zinc-200 bg-white/80 p-3 text-xs shadow-sm dark:border-zinc-800 dark:bg-zinc-900/80">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-semibold uppercase tracking-wide text-zinc-600 dark:text-zinc-300">
                Sponsors Status
              </h2>
              {statusUpdatedAt && (
                <span className="text-[10px] text-zinc-500 dark:text-zinc-400">
                  Updated at{" "}
                  {statusUpdatedAt.toLocaleTimeString(undefined, {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
              )}
            </div>
            <div className="mt-2 flex flex-wrap gap-3">
              {[
                {
                  key: "yutori",
                  label: "Yutori",
                  value: sponsorStatus.yutori,
                },
                {
                  key: "modulate",
                  label: "Modulate",
                  value: sponsorStatus.modulate,
                },
                {
                  key: "pioneer",
                  label: "Pioneer",
                  value: sponsorStatus.pioneer,
                },
                {
                  key: "neo4j",
                  label: "Neo4j",
                  value: sponsorStatus.neo4j,
                },
              ].map((item) => (
                <div
                  key={item.key}
                  className="flex items-center gap-1 text-[11px] text-zinc-600 dark:text-zinc-300"
                >
                  <span
                    className={`h-2 w-2 rounded-full ${
                      item.value?.ok ? "bg-emerald-500" : "bg-red-500"
                    }`}
                  />
                  <span className="font-medium">{item.label}</span>
                  {"status" in (item.value ?? {}) &&
                    typeof (item.value as any).status === "number" && (
                      <span className="text-[10px] text-zinc-400">
                        {(item.value as any).status}
                      </span>
                    )}
                </div>
              ))}
            </div>
          </section>
        )}

        <header className="space-y-2">
          <h1 className="text-4xl font-semibold tracking-tight">PersonaForge</h1>
          <p className="text-zinc-600 dark:text-zinc-400">
            Click to connect to the simulation stream (SSE). Events will be
            logged to the console, and the latest tick payload will appear
            below.
          </p>
        </header>

        <section className="space-y-3 rounded-lg border border-zinc-200 bg-white/70 p-4 text-sm shadow-sm dark:border-zinc-800 dark:bg-zinc-900/60">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
            Topic
          </h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400">
                Title
              </label>
              <input
                type="text"
                value={topicTitle}
                onChange={(e) => setTopicTitle(e.target.value)}
                placeholder={
                  latestTick?.topic.title ?? "New AI regulation announced"
                }
                className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 shadow-sm outline-none ring-0 transition focus:border-zinc-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-50"
              />
            </div>
            <div className="space-y-1">
              <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400">
                Summary
              </label>
              <input
                type="text"
                value={topicSummary}
                onChange={(e) => setTopicSummary(e.target.value)}
                placeholder={
                  latestTick?.topic.summary ??
                  "A new AI regulation has been proposed, shaping how models are built, audited, and deployed."
                }
                className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 shadow-sm outline-none ring-0 transition focus:border-zinc-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-50"
              />
            </div>
          </div>
          <button
            type="button"
            onClick={handleSetTopic}
            disabled={isSettingTopic}
            className="inline-flex h-9 items-center justify-center rounded-md bg-zinc-900 px-4 text-xs font-medium text-white transition-colors hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-zinc-50 dark:text-zinc-950 dark:hover:bg-zinc-200"
          >
            {isSettingTopic ? "Setting..." : "Set Topic"}
          </button>
          {latestTick?.topic.enrichment && (
            <div className="mt-4 grid gap-4 border-t border-zinc-200 pt-4 text-xs dark:border-zinc-800 sm:grid-cols-3">
              <div>
                <h3 className="mb-1 font-semibold text-zinc-700 dark:text-zinc-200">
                  Bullets
                </h3>
                <ul className="space-y-1 text-zinc-600 dark:text-zinc-400">
                  {latestTick.topic.enrichment.bullets.map((b) => (
                    <li key={b}>• {b}</li>
                  ))}
                </ul>
              </div>
              <div>
                <h3 className="mb-1 font-semibold text-zinc-700 dark:text-zinc-200">
                  Entities
                </h3>
                <div className="flex flex-wrap gap-1">
                  {latestTick.topic.enrichment.entities.map((e) => (
                    <span
                      key={e}
                      className="rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-zinc-600 dark:bg-zinc-800 dark:text-zinc-200"
                    >
                      {e}
                    </span>
                  ))}
                </div>
              </div>
              <div>
                <h3 className="mb-1 font-semibold text-zinc-700 dark:text-zinc-200">
                  Risks
                </h3>
                <ul className="space-y-1 text-zinc-600 dark:text-zinc-400">
                  {latestTick.topic.enrichment.risks.map((r) => (
                    <li key={r}>• {r}</li>
                  ))}
                </ul>
              </div>
            </div>
          )}
        </section>

        <section className="space-y-3 rounded-lg border border-zinc-200 bg-white/70 p-4 text-sm shadow-sm dark:border-zinc-800 dark:bg-zinc-900/60">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
            Modulate STT (English Fast)
          </h2>
          <p className="text-xs text-zinc-600 dark:text-zinc-400">
            Upload an audio clip to transcribe it using Modulate&apos;s Velma-2
            STT (batch, English fast).
          </p>
          <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center">
            <input
              type="file"
              accept="audio/*"
              onChange={(e) => {
                const file = e.target.files?.[0] ?? null;
                setSttFile(file);
              }}
              className="text-xs text-zinc-600 dark:text-zinc-300"
            />
            <button
              type="button"
              onClick={handleTranscribe}
              disabled={!sttFile || isTranscribing}
              className="inline-flex h-9 items-center justify-center rounded-md bg-zinc-900 px-4 text-xs font-medium text-white transition-colors hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-zinc-50 dark:text-zinc-950 dark:hover:bg-zinc-200"
            >
              {isTranscribing ? "Transcribing..." : "Transcribe"}
            </button>
            <button
              type="button"
              onClick={handleUseTranscriptAsTopic}
              disabled={!sttText}
              className="inline-flex h-9 items-center justify-center rounded-md border border-zinc-300 px-4 text-xs font-medium text-zinc-800 transition-colors hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-zinc-700 dark:text-zinc-100 dark:hover:bg-zinc-800"
            >
              Use transcript as topic
            </button>
            <button
              type="button"
              onClick={handleRunFullDemo}
              disabled={!sttFile || demoRunning}
              className="inline-flex h-9 items-center justify-center rounded-md border border-emerald-500 px-4 text-xs font-medium text-emerald-700 transition-colors hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-emerald-400 dark:text-emerald-200 dark:hover:bg-emerald-900/40"
            >
              {demoRunning ? "Running demo..." : "Run full demo"}
            </button>
          </div>
          <div className="mt-2 grid gap-2 text-[11px] text-zinc-600 dark:text-zinc-400 sm:grid-cols-2 lg:grid-cols-4">
            <div className="flex items-center gap-1">
              <span
                className={`h-2 w-2 rounded-full ${
                  demoSteps.transcribe === "ok"
                    ? "bg-emerald-500"
                    : demoSteps.transcribe === "error"
                      ? "bg-red-500"
                      : demoSteps.transcribe === "pending"
                        ? "bg-amber-500"
                        : "bg-zinc-400"
                }`}
              />
              <span>1. Transcribe</span>
            </div>
            <div className="flex items-center gap-1">
              <span
                className={`h-2 w-2 rounded-full ${
                  demoSteps.topic === "ok"
                    ? "bg-emerald-500"
                    : demoSteps.topic === "error"
                      ? "bg-red-500"
                      : demoSteps.topic === "pending"
                        ? "bg-amber-500"
                        : "bg-zinc-400"
                }`}
              />
              <span>2. Set topic</span>
            </div>
            <div className="flex items-center gap-1">
              <span
                className={`h-2 w-2 rounded-full ${
                  demoSteps.simulation === "ok"
                    ? "bg-emerald-500"
                    : demoSteps.simulation === "error"
                      ? "bg-red-500"
                      : demoSteps.simulation === "pending"
                        ? "bg-amber-500"
                        : "bg-zinc-400"
                }`}
              />
              <span>3. Start simulation</span>
            </div>
            <div className="flex items-center gap-1">
              <span
                className={`h-2 w-2 rounded-full ${
                  demoSteps.neo4j === "ok"
                    ? "bg-emerald-500"
                    : demoSteps.neo4j === "error"
                      ? "bg-red-500"
                      : demoSteps.neo4j === "pending"
                        ? "bg-amber-500"
                        : demoSteps.neo4j === "skipped"
                          ? "bg-zinc-400"
                          : "bg-zinc-400"
                }`}
              />
              <span>4. Neo4j persist</span>
            </div>
          </div>
          {sttText && (
            <div className="mt-3 space-y-2">
              <h3 className="text-xs font-semibold text-zinc-700 dark:text-zinc-200">
                Transcript
              </h3>
              <p className="whitespace-pre-wrap rounded-md bg-zinc-100 p-2 text-xs text-zinc-800 dark:bg-zinc-800 dark:text-zinc-100">
                {sttText}
              </p>
              {sttDurationMs != null && (
                <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                  Duration: {(sttDurationMs / 1000).toFixed(1)}s
                </p>
              )}
            </div>
          )}
          {sttUtterances.length > 0 && (
            <div className="mt-2 space-y-1">
              <button
                type="button"
                onClick={() => setShowUtterances((v) => !v)}
                className="text-[11px] font-medium text-zinc-600 underline-offset-2 hover:underline dark:text-zinc-300"
              >
                {showUtterances ? "Hide utterances" : "Show utterances"}
              </button>
              {showUtterances && (
                <div className="mt-1 max-h-60 space-y-2 overflow-auto rounded-md bg-zinc-50 p-2 text-[11px] dark:bg-zinc-950">
                  {sttUtterances.map((u, idx) => (
                    <div
                      key={idx}
                      className="border-b border-zinc-200 pb-1 last:border-0 dark:border-zinc-800"
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold text-zinc-800 dark:text-zinc-100">
                          Speaker {u?.speaker ?? u?.speaker_id ?? "?"}
                        </span>
                        {u?.emotion && (
                          <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] uppercase tracking-wide text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
                            {u.emotion}
                          </span>
                        )}
                        {u?.accent && (
                          <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] uppercase tracking-wide text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">
                            {u.accent}
                          </span>
                        )}
                        {typeof u?.start_time_ms === "number" && (
                          <span className="text-[10px] text-zinc-500 dark:text-zinc-400">
                            { (u.start_time_ms / 1000).toFixed(1) }s
                          </span>
                        )}
                      </div>
                      {u?.text && (
                        <p className="mt-1 text-zinc-700 dark:text-zinc-200">
                          {u.text}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
          {sttRaw && (
            <div className="mt-2 space-y-1">
              <button
                type="button"
                onClick={() => setShowSttRaw((v) => !v)}
                className="text-[11px] font-medium text-zinc-600 underline-offset-2 hover:underline dark:text-zinc-300"
              >
                {showSttRaw ? "Hide raw response" : "Show raw response"}
              </button>
              {showSttRaw && (
                <pre className="mt-1 max-h-60 overflow-auto rounded-md bg-black p-2 text-[11px] text-zinc-100 dark:bg-zinc-950">
                  {sttRaw}
                </pre>
              )}
            </div>
          )}
        </section>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={startSimulation}
            disabled={isConnecting}
            className="inline-flex h-11 items-center justify-center rounded-md bg-zinc-900 px-5 text-sm font-medium text-white transition-colors hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-zinc-50 dark:text-zinc-950 dark:hover:bg-zinc-200"
          >
            {isConnecting ? "Connecting..." : "Start Simulation"}
          </button>
          <label className="flex items-center gap-2 text-xs text-zinc-600 dark:text-zinc-400">
            <input
              type="checkbox"
              checked={persistToNeo4j}
              onChange={(e) => setPersistToNeo4j(e.target.checked)}
              className="h-3 w-3 rounded border-zinc-400 text-zinc-900 focus:ring-0 dark:border-zinc-600 dark:bg-zinc-900"
            />
            Persist to Neo4j
          </label>
          {latestTick && (
            <div className="flex flex-wrap gap-3 text-xs text-zinc-600 dark:text-zinc-400">
              <span>
                Tick:{" "}
                <span className="font-medium text-zinc-900 dark:text-zinc-100">
                  {latestTick.tick}
                </span>
              </span>
              <span>
                Sentiment:{" "}
                <span className="font-medium text-zinc-900 dark:text-zinc-100">
                  {latestTick.metrics.sentiment.toFixed(2)}
                </span>
              </span>
              <span>
                Polarization:{" "}
                <span className="font-medium text-zinc-900 dark:text-zinc-100">
                  {latestTick.metrics.polarization.toFixed(2)}
                </span>
              </span>
              <span>
                Tension:{" "}
                <span className="font-medium text-zinc-900 dark:text-zinc-100">
                  {latestTick.metrics.tension.toFixed(2)}
                </span>
              </span>
            </div>
          )}
          {ingestStatus && (
            <div className="w-full text-xs text-zinc-500 dark:text-zinc-400">
              {ingestStatus}
            </div>
          )}
        </div>

        {latestTick && (
          <section className="rounded-lg border border-zinc-200 bg-white/70 p-4 text-sm shadow-sm dark:border-zinc-800 dark:bg-zinc-900/60">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
              Live Network
            </h2>
            <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
              Force-directed view of agents and their latest interactions.
            </p>
            <div className="mt-3">
              <LiveGraph agents={latestTick.agents} edges={latestTick.edges} />
            </div>
          </section>
        )}

        <section className="rounded-lg border border-zinc-200 bg-white/70 p-4 text-sm shadow-sm dark:border-zinc-800 dark:bg-zinc-900/60">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
            Feed
          </h2>
          <div className="mt-2 space-y-3">
            {feedMessages.length === 0 && (
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                No posts yet. Start the simulation to see agents react.
              </p>
            )}
            {feedMessages.map((message) => (
              <article
                key={message.id}
                className="rounded-md border border-zinc-200 bg-white p-3 text-xs dark:border-zinc-800 dark:bg-zinc-950"
              >
                <header className="mb-1 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-zinc-900 dark:text-zinc-100">
                      {message.agentName}
                    </span>
                    <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] uppercase tracking-wide text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
                      {message.stance} · {message.mood}
                    </span>
                  </div>
                  <span className="text-[10px] text-zinc-500 dark:text-zinc-400">
                    tick {message.tick} · intensity {message.intensity.toFixed(2)}
                  </span>
                </header>
                <p className="text-zinc-800 dark:text-zinc-100">{message.text}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="rounded-lg border border-zinc-200 bg-white/70 p-4 text-sm shadow-sm dark:border-zinc-800 dark:bg-zinc-900/60">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
            Latest tick payload
          </h2>
          <pre className="mt-2 max-h-80 overflow-auto rounded-md bg-black p-3 text-xs text-zinc-100 dark:bg-zinc-950">
            {latestTick ? JSON.stringify(latestTick, null, 2) : "No data yet"}
          </pre>
        </section>
      </main>
    </div>
  );
}
