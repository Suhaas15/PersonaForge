const mockModeEnv = process.env.SPONSOR_MOCK_MODE;
const fastinoEnabledEnv = process.env.FASTINO_ENABLED;
const yutoriEnabledEnv = process.env.YUTORI_ENABLED;
const modulateEnabledEnv = process.env.MODULATE_ENABLED;

const parseBoolean = (value: string | undefined, defaultValue: boolean): boolean =>
  value === undefined ? defaultValue : value.toLowerCase() === "true";

export const SPONSORS = {
  fastino: {
    enabled: parseBoolean(fastinoEnabledEnv, false),
  },
  yutori: {
    enabled: parseBoolean(yutoriEnabledEnv, false),
  },
  modulate: {
    enabled: parseBoolean(modulateEnabledEnv, false),
  },
  mockMode: parseBoolean(mockModeEnv, false),
} as const;

export const FASTINO_API_KEY = process.env.FASTINO_API_KEY ?? "";
export const FASTINO_BASE_URL = process.env.FASTINO_BASE_URL ?? "";

export const YUTORI_API_KEY = process.env.YUTORI_API_KEY ?? "";
export const YUTORI_BASE_URL =
  process.env.YUTORI_BASE_URL && process.env.YUTORI_BASE_URL.length > 0
    ? process.env.YUTORI_BASE_URL
    : "https://api.yutori.com";

export const MODULATE_API_KEY = process.env.MODULATE_API_KEY ?? "";
export const MODULATE_BASE_URL =
  process.env.MODULATE_BASE_URL && process.env.MODULATE_BASE_URL.length > 0
    ? process.env.MODULATE_BASE_URL
    : "https://modulate-developer-apis.com";
export const MODULATE_STT_ENDPOINT =
  process.env.MODULATE_STT_ENDPOINT ?? "/api/velma-2-stt-batch-english-vfast";
export const MODULATE_MODEL_ID =
  process.env.MODULATE_MODEL_ID ?? "velma-2-stt-batch-english-vfast";
export const MODULATE_TEXT_EMOTION_ENDPOINT =
  process.env.MODULATE_TEXT_EMOTION_ENDPOINT;

export const PIONEER_API_KEY = process.env.PIONEER_API_KEY ?? "";
export const PERSONAFORGE_MODEL_ID = process.env.PERSONAFORGE_MODEL_ID ?? "";
export const PIONEER_BASE_URL =
  process.env.PIONEER_BASE_URL ?? "https://api.pioneer.ai";

export const PIONEER_CONFIG = {
  apiKey: PIONEER_API_KEY,
  modelId: PERSONAFORGE_MODEL_ID,
  baseUrl: PIONEER_BASE_URL,
} as const;

export function ensurePioneerConfigured() {
  assertEnabledConfig(
    "Pioneer (Fastino)",
    !SPONSORS.mockMode && SPONSORS.fastino.enabled,
    {
      PIONEER_API_KEY,
      PERSONAFORGE_MODEL_ID,
    },
  );
}

export interface SponsorServiceConfig {
  mockMode: boolean;
  yutoriEnabled: boolean;
  modulateEnabled: boolean;
  yutoriApiKey?: string;
  modulateApiKey?: string;
  yutoriBaseUrl: string;
  modulateBaseUrl?: string;
}

export const SPONSOR_SERVICE_CONFIG: SponsorServiceConfig = {
  mockMode: SPONSORS.mockMode,
  yutoriEnabled: SPONSORS.yutori.enabled,
  modulateEnabled: SPONSORS.modulate.enabled,
  yutoriApiKey: process.env.YUTORI_API_KEY,
  modulateApiKey: process.env.MODULATE_API_KEY,
  yutoriBaseUrl: YUTORI_BASE_URL,
  modulateBaseUrl: MODULATE_BASE_URL,
};

export function assertEnabledConfig(
  name: string,
  enabled: boolean,
  required: Record<string, string | undefined>,
): void {
  if (!enabled) return;

  const missing = Object.entries(required)
    .filter(([, value]) => !value)
    .map(([key]) => key);

  if (missing.length > 0) {
    throw new Error(
      `${name} is enabled but missing required environment variables: ${missing.join(
        ", ",
      )}`,
    );
  }
}


