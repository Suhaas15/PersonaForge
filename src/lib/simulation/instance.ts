import { SimulationEngine } from "./engine";
import { SponsorOrchestrator } from "../sponsors/orchestrator";

let engine: SimulationEngine | null = null;
let orchestrator: SponsorOrchestrator | null = null;

function getOrchestrator(): SponsorOrchestrator {
  if (!orchestrator) {
    orchestrator = new SponsorOrchestrator();
  }
  return orchestrator;
}

export function getSimulationEngine(): SimulationEngine {
  if (!engine) {
    engine = new SimulationEngine(Date.now(), getOrchestrator());
  }
  return engine;
}

