/** Browser-safe constants and JSON decoders shared by the Host and client plugin faces. */

/** Settings namespace owned by the Ollama Cloud plugin. */
export const OLLAMA_SETTINGS_NAMESPACE = 'llm-ollama'
/** Provider route owned by the Ollama Cloud plugin. */
export const OLLAMA_PROVIDER = 'ollama-cloud'
/** Credential reference used when the settings section names none. */
export const DEFAULT_API_KEY_ENV = 'OLLAMA_API_KEY'
/** Public Ollama Cloud native API base URL. */
export const OLLAMA_PUBLIC_BASE_URL = 'https://ollama.com/api'
/** Default context capacity for models without discovered metadata. */
export const OLLAMA_DEFAULT_CONTEXT_WINDOW = 262_144
/** Default maximum idle interval while a stream read is outstanding. */
export const OLLAMA_DEFAULT_STREAM_IDLE_TIMEOUT_MS = 300_000
/** Private Connection RPC channel used by this package's two runtime faces. */
export const OLLAMA_RPC_CHANNEL = '/ollama-cloud'
/** Rich model-discovery endpoint inside {@link OLLAMA_RPC_CHANNEL}. */
export const OLLAMA_DISCOVER_ENDPOINT = 'models/discover'
/** Atomic settings-save endpoint inside {@link OLLAMA_RPC_CHANNEL}. */
export const OLLAMA_SAVE_ENDPOINT = 'settings/save'
/** Cloud usage-snapshot endpoint inside {@link OLLAMA_RPC_CHANNEL}. */
export const OLLAMA_USAGE_ENDPOINT = 'usage/read'

/** One model stored in the plugin's advisory catalog. */
export interface OllamaCatalogModelConfig {
  /** Wire model id accepted by the configured endpoint. */
  id: string
  /** Selector label; omission uses {@link id}. */
  name?: string
  /** Optional selector detail for similar model variants. */
  description?: string
  /** Known combined request and response context capacity. */
  contextWindow?: number
  /** Per-request output cap for this model. */
  maxTokens?: number
  /** Whether the model accepts image input. */
  vision?: boolean
  /** Whether the model supports native thinking; this does not identify accepted efforts. */
  thinking?: boolean
  /** Chat-picker default when the conversation has not chosen a level. */
  defaultEffort?: string
  /** Legacy capability flag. Ignored at runtime; still decoded. */
  tools?: boolean
}

/** Settings fields presented by the package's Web configuration card. */
export interface OllamaSettingsView {
  /** Credential reference resolved by the Host. */
  apiKeyEnv: string
  /** Native API base URL. */
  baseURL: string
  /** Advisory model catalog. */
  models: OllamaCatalogModelConfig[]
  /** Optional provider-wide output cap. */
  maxTokens?: number
  /** Context fallback for models without an exact capacity. */
  defaultContextWindow: number
  /** Stream idle timeout in milliseconds. */
  streamIdleTimeoutMs: number
}

/** Draft endpoint and one-shot credential sent to rich model discovery. */
export interface OllamaDiscoveryRequest {
  /** Unsaved native API base URL. */
  baseURL?: string
  /** Unsaved credential used for this request only. */
  apiKey?: string
}

/** Rich model-discovery result returned to the package's own client card. */
export interface OllamaDiscoveryResult {
  /** Models in provider order, including native capability flags. */
  models: OllamaCatalogModelConfig[]
}

/** Atomic editable-settings payload sent by the package's browser face. */
export interface OllamaSaveRequest {
  /** API URL currently shown by the editor. */
  baseURL: string
  /** Complete advisory catalog currently shown by the editor. */
  models: OllamaCatalogModelConfig[]
  /** Settings descriptor revision from which the editor began. */
  expectedRevision: number
}

/** Accepted settings snapshot returned after one atomic Host mutation. */
export interface OllamaSaveResult {
  /** Resolved settings after the mutation commits. */
  settings: OllamaSettingsView
  /** New descriptor revision accepted by the Host. */
  revision: number
}

/** One model's accounted requests inside a usage window. */
export interface OllamaUsageModelCount {
  /** Provider-side model label ("web search" names the search capability). */
  name: string
  /** Requests accounted to this model in the window. */
  requestCount: number
}

/** One metered quota window (session or weekly). */
export interface OllamaUsageWindow {
  /** Consumed fraction of the window; 0.891 renders as "89.1%". */
  usage: number
  /** Per-model request counts in the window, provider order. */
  models: OllamaUsageModelCount[]
}

/** Secret-free cloud usage snapshot read for the configuration card. */
export interface OllamaUsageView {
  /** ISO-8601 time the Host read the snapshot. */
  fetchedAt: string
  /** Rolling session window, when the endpoint reports one. */
  session?: OllamaUsageWindow
  /** Rolling weekly window, when the endpoint reports one. */
  weekly?: OllamaUsageWindow
}

/**
 * Usage answer crossing the plugin RPC: a snapshot, or the word that the
 * endpoint has no usage surface. "Unsupported" is a legitimate answer (a
 * self-hosted Ollama answers 404), not a failure, so it rides the success
 * branch instead of an error code.
 */
export type OllamaUsageReply =
  | { status: 'ok', usage: OllamaUsageView }
  | { status: 'unsupported' }

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function optionalPositiveInteger(value: unknown): value is number | undefined {
  return value === undefined || (typeof value === 'number' && Number.isSafeInteger(value) && value > 0)
}

/**
 * Narrow one model crossing the settings or plugin-RPC JSON boundary.
 * @param value - untrusted JSON value.
 * @returns the validated model, or undefined when any field is invalid.
 */
export function decodeOllamaCatalogModel(value: unknown): OllamaCatalogModelConfig | undefined {
  if (!isRecord(value) || typeof value['id'] !== 'string' || value['id'].length === 0) return undefined
  const name = value['name']
  const description = value['description']
  const contextWindow = value['contextWindow']
  const maxTokens = value['maxTokens']
  const vision = value['vision']
  const thinking = value['thinking']
  const defaultEffort = value['defaultEffort']
  const tools = value['tools']
  if (name !== undefined && typeof name !== 'string') return undefined
  if (description !== undefined && typeof description !== 'string') return undefined
  if (!optionalPositiveInteger(contextWindow) || !optionalPositiveInteger(maxTokens)) return undefined
  if (vision !== undefined && typeof vision !== 'boolean') return undefined
  if (thinking !== undefined && typeof thinking !== 'boolean') return undefined
  if (defaultEffort !== undefined && (typeof defaultEffort !== 'string' || defaultEffort.length === 0)) {
    return undefined
  }
  if (tools !== undefined && typeof tools !== 'boolean') return undefined
  return {
    id: value['id'],
    ...name === undefined ? {} : { name },
    ...description === undefined ? {} : { description },
    ...contextWindow === undefined ? {} : { contextWindow },
    ...maxTokens === undefined ? {} : { maxTokens },
    ...vision === undefined ? {} : { vision },
    ...thinking === undefined ? {} : { thinking },
    ...defaultEffort === undefined ? {} : { defaultEffort },
    ...tools === undefined ? {} : { tools },
  }
}

/**
 * Narrow the redacted, schema-resolved settings section before it enters React state.
 * @param value - untrusted settings response value.
 * @returns the validated settings view, or undefined when the response is invalid.
 */
export function decodeOllamaSettings(value: unknown): OllamaSettingsView | undefined {
  if (!isRecord(value)) return undefined
  const apiKeyEnv = value['apiKeyEnv']
  const baseURL = value['baseURL']
  const models = value['models']
  const maxTokens = value['maxTokens']
  const defaultContextWindow = value['defaultContextWindow']
  const streamIdleTimeoutMs = value['streamIdleTimeoutMs']
  if (typeof apiKeyEnv !== 'string' || apiKeyEnv.length === 0) return undefined
  if (typeof baseURL !== 'string' || baseURL.length === 0) return undefined
  if (!Array.isArray(models)) return undefined
  if (!optionalPositiveInteger(maxTokens)) return undefined
  if (!optionalPositiveInteger(defaultContextWindow) || defaultContextWindow === undefined) return undefined
  if (typeof streamIdleTimeoutMs !== 'number' || !Number.isFinite(streamIdleTimeoutMs) || streamIdleTimeoutMs <= 0) {
    return undefined
  }
  const decodedModels: OllamaCatalogModelConfig[] = []
  for (const model of models) {
    const decoded = decodeOllamaCatalogModel(model)
    if (decoded === undefined) return undefined
    decodedModels.push(decoded)
  }
  return {
    apiKeyEnv,
    baseURL,
    models: decodedModels,
    ...maxTokens === undefined ? {} : { maxTokens },
    defaultContextWindow,
    streamIdleTimeoutMs,
  }
}

/**
 * Narrow the rich discovery request received by the Host plugin.
 * @param value - untrusted RPC request payload.
 * @returns the validated request, or undefined when the payload is invalid.
 */
export function decodeOllamaDiscoveryRequest(value: unknown): OllamaDiscoveryRequest | undefined {
  if (!isRecord(value)) return undefined
  const baseURL = value['baseURL']
  const apiKey = value['apiKey']
  if (baseURL !== undefined && (typeof baseURL !== 'string' || baseURL.length === 0)) return undefined
  if (apiKey !== undefined && typeof apiKey !== 'string') return undefined
  return {
    ...baseURL === undefined ? {} : { baseURL },
    ...apiKey === undefined ? {} : { apiKey },
  }
}

/**
 * Narrow the rich discovery result received by the browser plugin.
 * @param value - untrusted RPC result value.
 * @returns the validated result, or undefined when any model is invalid.
 */
export function decodeOllamaDiscoveryResult(value: unknown): OllamaDiscoveryResult | undefined {
  if (!isRecord(value) || !Array.isArray(value['models'])) return undefined
  const models: OllamaCatalogModelConfig[] = []
  for (const model of value['models']) {
    const decoded = decodeOllamaCatalogModel(model)
    if (decoded === undefined) return undefined
    models.push(decoded)
  }
  return { models }
}

/**
 * Narrow one usage window crossing the plugin RPC.
 * @param value - untrusted JSON value.
 * @returns the validated window, or undefined when any field is invalid.
 */
function decodeOllamaUsageWindow(value: unknown): OllamaUsageWindow | undefined {
  if (!isRecord(value)) return undefined
  const usage = value['usage']
  if (typeof usage !== 'number' || !Number.isFinite(usage) || usage < 0) return undefined
  const modelsValue = value['models']
  const models: OllamaUsageModelCount[] = []
  if (modelsValue !== undefined) {
    if (!Array.isArray(modelsValue)) return undefined
    for (const entry of modelsValue) {
      if (!isRecord(entry) || typeof entry['name'] !== 'string' || entry['name'].length === 0) return undefined
      const requestCount = entry['requestCount']
      if (typeof requestCount !== 'number' || !Number.isSafeInteger(requestCount) || requestCount < 0) {
        return undefined
      }
      models.push({ name: entry['name'], requestCount })
    }
  }
  return { usage, models }
}

/**
 * Narrow one usage snapshot.
 * @param value - untrusted JSON value.
 * @returns the validated snapshot, or undefined when it is malformed.
 */
export function decodeOllamaUsageView(value: unknown): OllamaUsageView | undefined {
  if (!isRecord(value)) return undefined
  if (typeof value['fetchedAt'] !== 'string' || value['fetchedAt'].length === 0) return undefined
  const session = value['session'] === undefined ? undefined : decodeOllamaUsageWindow(value['session'])
  const weekly = value['weekly'] === undefined ? undefined : decodeOllamaUsageWindow(value['weekly'])
  if (value['session'] !== undefined && session === undefined) return undefined
  if (value['weekly'] !== undefined && weekly === undefined) return undefined
  if (session === undefined && weekly === undefined) return undefined
  return {
    fetchedAt: value['fetchedAt'],
    ...session === undefined ? {} : { session },
    ...weekly === undefined ? {} : { weekly },
  }
}

/**
 * Narrow the usage reply returned by the Host usage endpoint.
 * @param value - untrusted RPC result value.
 * @returns the validated reply, or undefined when it is malformed.
 */
export function decodeOllamaUsageReply(value: unknown): OllamaUsageReply | undefined {
  if (!isRecord(value)) return undefined
  if (value['status'] === 'unsupported') return { status: 'unsupported' }
  if (value['status'] !== 'ok') return undefined
  const usage = decodeOllamaUsageView(value['usage'])
  return usage === undefined ? undefined : { status: 'ok', usage }
}

/**
 * Narrow one atomic settings-save request crossing the plugin RPC.
 * @param value - untrusted RPC payload.
 * @returns the validated request, or undefined when any field is invalid.
 */
export function decodeOllamaSaveRequest(value: unknown): OllamaSaveRequest | undefined {
  if (!isRecord(value) || typeof value['baseURL'] !== 'string' || value['baseURL'].length === 0) return undefined
  if (!Array.isArray(value['models']) || !Number.isSafeInteger(value['expectedRevision'])) return undefined
  const expectedRevision = value['expectedRevision'] as number
  if (expectedRevision < 0) return undefined
  const models: OllamaCatalogModelConfig[] = []
  for (const model of value['models']) {
    const decoded = decodeOllamaCatalogModel(model)
    if (decoded === undefined) return undefined
    models.push(decoded)
  }
  return { baseURL: value['baseURL'], models, expectedRevision }
}

/**
 * Narrow the accepted settings snapshot returned by the Host save endpoint.
 * @param value - untrusted RPC result value.
 * @returns the validated result, or undefined when it is malformed.
 */
export function decodeOllamaSaveResult(value: unknown): OllamaSaveResult | undefined {
  if (!isRecord(value) || !Number.isSafeInteger(value['revision'])) return undefined
  const revision = value['revision'] as number
  const settings = decodeOllamaSettings(value['settings'])
  if (revision < 0 || settings === undefined) return undefined
  return { settings, revision }
}
