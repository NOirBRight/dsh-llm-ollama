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
export const OLLAMA_DEFAULT_CONTEXT_WINDOW = 4096
/** Default maximum idle interval while a stream read is outstanding. */
export const OLLAMA_DEFAULT_STREAM_IDLE_TIMEOUT_MS = 300_000
/** Private Connection RPC channel used by this package's two runtime faces. */
export const OLLAMA_RPC_CHANNEL = '/ollama-cloud'
/** Rich model-discovery endpoint inside {@link OLLAMA_RPC_CHANNEL}. */
export const OLLAMA_DISCOVER_ENDPOINT = 'models/discover'

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
  /** Whether the model supports thinking and reasoning levels. */
  thinking?: boolean
  /** Whether the model supports tool calls. */
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
  const tools = value['tools']
  if (name !== undefined && typeof name !== 'string') return undefined
  if (description !== undefined && typeof description !== 'string') return undefined
  if (!optionalPositiveInteger(contextWindow) || !optionalPositiveInteger(maxTokens)) return undefined
  if (vision !== undefined && typeof vision !== 'boolean') return undefined
  if (thinking !== undefined && typeof thinking !== 'boolean') return undefined
  if (tools !== undefined && typeof tools !== 'boolean') return undefined
  return {
    id: value['id'],
    ...name === undefined ? {} : { name },
    ...description === undefined ? {} : { description },
    ...contextWindow === undefined ? {} : { contextWindow },
    ...maxTokens === undefined ? {} : { maxTokens },
    ...vision === undefined ? {} : { vision },
    ...thinking === undefined ? {} : { thinking },
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
