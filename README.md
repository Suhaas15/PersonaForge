## PersonaForge

PersonaForge is a **live social‑simulation sandbox** for AI agents.

You give it a topic (or speak one aloud), and it spins up a tiny “internet” of personas – influencers, skeptics, analysts, journalists, optimists, conspiracists – then simulates how they react, amplify, fact‑check, and argue in real time.

Under the hood it combines:

- **Next.js 14 + App Router + SSE** for a streaming simulation UI  
- **Neo4j** for a graph of agents, posts, and influence edges  
- **Yutori** for topic enrichment (bullets / entities / risks)  
- **Pioneer (Fastino)** for message classification (amplify / debate / factcheck)  
- **Modulate Velma‑2 STT** for speech‑to‑text, diarization, and emotion signals  

All wired together into one “press a button, watch the world react” demo.

---

## Why this exists

Most “AI social” demos are static: you send a prompt, get a few canned replies, and that’s it.

PersonaForge tries to feel like a tiny **live ecosystem**:

- A new regulation drops → personas start posting.
- Posts trigger **influence edges** (amplification, debate, fact‑checks).
- Sentiment, polarization, and tension drift over time.
- You can speak into the system and have agents react to your words.
- Optionally, the whole thing is persisted into **Neo4j** so you can explore the graph.

---

## Demo flow

The main page (`/`) walks through the stack:

1. **Set Topic**
   - Type a title + summary, or
   - Use **“Run full demo”** with an audio file:
     - Modulate STT → transcript
     - Yutori → enriched topic (bullets, entities, risks)
     - Pioneer → classification of agent posts
     - Simulation starts, optionally persisting to Neo4j

2. **Live Network**
   - Force‑directed graph (`react-force-graph-2d`) of agents as nodes.
   - Links show influence edges (`amplify`, `debate`, `factcheck`).
   - Node radius reflects stance; stroke reflects mood (calm vs tense).

3. **Feed**
   - Timeline of agent posts per tick:
     - Agent name, stance, mood, intensity, and text.
   - Metrics: sentiment, polarization, tension.

4. **Modulate STT (English Fast)**
   - Upload `audio/*`, transcribe via Velma‑2 STT Batch endpoint.
   - Shows:
     - Full transcript
     - Duration (seconds)
     - Collapsible list of utterances (speaker, text, emotion, accent, start time)
   - “Use transcript as topic” posts to `/api/topic`, along with:
     - `speaker_count`
     - `dominant_emotion`

5. **Sponsors Status**
   - Compact panel with **Yutori / Modulate / Pioneer / Neo4j** health lights and last‑updated time.

---

## Architecture (high‑level)

- **Framework**: Next.js 14, TypeScript, App Router, Tailwind
- **Simulation Engine** (`src/lib/simulation/engine.ts`)
  - In‑memory state:
    - tick counter
    - agents (`id`, `name`, `stance`, `mood`)
    - current topic + optional enrichment
  - Each tick:
    - randomly picks posters
    - generates message text per agent role/stance/mood
    - calls sponsors:
      - **Modulate** (optional) → emotion → intensity & mood adjustments
      - **Pioneer/Fastino** → edge classification
    - updates metrics (sentiment, polarization, tension)
    - streams payload via **SSE** (`/api/stream`)

- **Sponsors Orchestrator** (`src/lib/sponsors/orchestrator.ts`)
  - Wraps:
    - `FastinoClient` (Pioneer classify)
    - `YutoriClient` + `enrichTopicWithYutori`
    - `ModulateClient` (STT + optional text emotion)
  - Central place to flip feature flags and handle graceful degradation.

- **Graph Persistence** (`src/lib/neo4j`)
  - `Neo4jService.ingestTick`:
    - MERGE agents
    - MERGE messages + `(:Agent)-[:POSTED]->(:Message)`
    - MERGE `(:Agent)-[:INFLUENCED {tick, type}]->(:Agent)`

---

## Getting started

### 1. Clone & install

```bash
git clone <your-repo-url>
cd personaforge/personaforge

npm install
```

### 2. Env configuration

Copy the example:

```bash
cp .env.example .env.local
```

Then edit `.env.local`:

- **Core flags**

```env
SPONSOR_MOCK_MODE=false

FASTINO_ENABLED=true
YUTORI_ENABLED=true
MODULATE_ENABLED=true
NEO4J_ENABLED=true
```

- **Pioneer / Fastino**

```env
PIONEER_API_KEY=your_pioneer_key_here
PERSONAFORGE_MODEL_ID=d1e89c30-31b2-4b0f-969c-faafae85ebf4
PIONEER_BASE_URL=https://api.pioneer.ai
```

- **Yutori**

```env
YUTORI_API_KEY=your_yutori_key_here
YUTORI_BASE_URL=https://api.yutori.com
```

- **Modulate STT (Velma‑2 batch)**

```env
MODULATE_API_KEY=your_modulate_key_here
MODULATE_BASE_URL=https://modulate-developer-apis.com
MODULATE_STT_ENDPOINT=/api/velma-2-stt-batch
MODULATE_MODEL_ID=velma-2-stt-batch-english-vfast
```

- **Modulate text emotion (optional)**

```env
MODULATE_TEXT_EMOTION_ENDPOINT=        # e.g. /api/velma-2-text-emotion
```

- **Neo4j**

```env
NEO4J_URI=bolt://localhost:7687
NEO4J_USER=neo4j
NEO4J_PASSWORD=your_password
```

> `.env*` files are git‑ignored by default. Don’t commit keys.

### 3. Run Neo4j (local docker example)

```bash
docker run -d --name personaforge-neo4j \
  -p 7474:7474 -p 7687:7687 \
  -e NEO4J_AUTH=neo4j/your_password \
  neo4j:5
```

You can verify with:

```bash
docker ps --filter "name=personaforge-neo4j"
```

### 4. Start the app

```bash
npm run dev
```

Then open:

- Local: `http://localhost:3000`
- Network: whatever Next.js logs under “Network”

---

## Running the full demo

1. Go to **Modulate STT (English Fast)**.
2. Choose a short audio file (20–60 seconds works well).
3. Click **Run full demo**:
   - Step 1: Transcribe (Modulate STT)
   - Step 2: Set topic (using transcript + Yutori enrichment)
   - Step 3: Start simulation (SSE stream)
   - Step 4: Neo4j persist (if healthy)
4. Scroll:
   - Topic section shows Yutori bullets/entities/risks.
   - Live Network animates agent interactions.
   - Feed shows posts and metrics in real time.

You can expand **utterances** and the **raw Modulate response** to debug or demo the underlying model output.

---

## Safety & failure modes

- If any sponsor is misconfigured or down:
  - **Yutori**: enrichment is omitted and simulation falls back to plain topic text.
  - **Pioneer**: falls back to `{ label: "debate", confidence: 0.3 }`.
  - **Modulate STT**: returns a clear “Transcription unavailable” message.
  - **Neo4j**: health check fails and “Persist to Neo4j” is skipped; simulation stays in memory only.
- All keys are strictly used server‑side; the browser only sees derived strings and boolean statuses.

---

## Roadmap / ideas

- Use Modulate text emotion endpoint as the **primary** driver for agent mood and intensity.
- Let users define new persona archetypes from the UI.
- Add history playback + time scrubbing using Neo4j snapshots.
- Add an “explain this tick” panel that introspects why edges were classified as amplify/debate/factcheck.

