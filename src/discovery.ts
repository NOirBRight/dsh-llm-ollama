/**
 * Answering "which models can this Ollama Cloud endpoint serve?" for the
 * configuration surface's "fetch available models" action.
 *
 * The native `/api/tags` endpoint lists every available cloud model, and
 * `/api/show` discloses each model's context length and capabilities
 * (vision, thinking, tools) — metadata the OpenAI-compatible `/v1/models`
 * listing does not provide. This is why the adapter uses the native protocol
 * for discovery rather than the OpenAI-compatible surface.
 *
 * Nothing here is stored: the request carries a draft the user is still
 * editing, and the reply is candidate metadata the surface offers for
 * adoption. `settings.yaml` remains the only thing that decides what a route
 * serves.
 *
 * @module dsh-llm-ollama/discovery
 */

import { INVALID_CREDENTIAL_CODE, LlmError, normalizeApiKey } from '@deepseek-ai/dsh-llm'
import type { LlmDiscoveredModel, LlmModelDiscoveryRequest } from '@deepseek-ai/dsh-llm'
import { attributionHeaders } from '@deepseek-ai/dsh-llm'
import { OLLAMA_PUBLIC_BASE_URL } from './client-contract.ts'
import type { OllamaCatalogModelConfig } from './client-contract.ts'
import type { WireShowResponse, WireTagsResponse } from './types.ts'

/** Endpoint replies larger than this are refused. */
const MAX_RESPONSE_BYTES = 4 * 1024 * 1024

/** The public Ollama Cloud API base URL. */
export const PUBLIC_BASE_URL = OLLAMA_PUBLIC_BASE_URL

/**
 * Read a reply body, refusing one that outgrows the ceiling. A declared length
 * is checked first so an honest server is turned away without transferring
 * anything; the accumulated total is what actually enforces the bound.
 */
async function readBounded(response: Response, url: string): Promise<string> {
  const oversized = (): LlmError =>
    new LlmError(`${url} answered with more than ${MAX_RESPONSE_BYTES} bytes`, 'DISCOVERY_FAILED')
  const declared = Number(response.headers.get('content-length') ?? Number.NaN)
  if (Number.isFinite(declared) && declared > MAX_RESPONSE_BYTES) {
    await response.body?.cancel()
    throw oversized()
  }
  /* v8 ignore next -- fetch always exposes a body stream on a 2xx Response; the null guard is defensive. */
  if (response.body === null) return ''
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      total += value.byteLength
      if (total > MAX_RESPONSE_BYTES) throw oversized()
      chunks.push(value)
    }
  } finally {
    /* v8 ignore next 4 -- cancel() after a completed or abandoned read settles without rejecting; unobserved best-effort cleanup. */
    await reader.cancel().catch(() => {
      // Cancel after a drained read, or after this function walked away from
      // an oversized one, is cleanup; the reply is already decided either way.
    })
  }
  const body = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    body.set(chunk, offset)
    offset += chunk.byteLength
  }
  return new TextDecoder().decode(body)
}

/** Accept one probe key, or refuse it before the header is built. */
function usableProbeKey(raw: string): string {
  const checked = normalizeApiKey(raw)
  if (checked.ok) return checked.value
  throw new LlmError(
    checked.reason === 'empty'
      ? 'this provider\'s API key is blank; enter it in Plugin configuration, or clear it to probe unauthenticated'
      : 'this provider\'s API key contains characters no HTTP header can carry; paste the raw key only',
    INVALID_CREDENTIAL_CODE,
  )
}

/** Build the bearer headers for a discovery request. */
function authHeaders(apiKey: string | undefined): Record<string, string> {
  return {
    accept: 'application/json',
    ...apiKey === undefined ? {} : { authorization: `Bearer ${apiKey}` },
    ...attributionHeaders(),
  }
}

/** Two attempts make the idempotent tags probe tolerate one transient transport failure. */
const TAGS_NETWORK_ATTEMPTS = 2

/** Describe a transport failure without including request headers or credentials. */
function networkDetail(error: unknown): string {
  if (!(error instanceof Error)) return ''
  const cause = typeof error.cause === 'object' && error.cause !== null ? error.cause : undefined
  const code = cause !== undefined && 'code' in cause && typeof cause.code === 'string' ? cause.code : undefined
  const message = error.message.length === 0 ? '' : `: ${error.message}`
  return code === undefined ? message : `${message} (${code})`
}

/** Fetch the idempotent tags listing, retrying one transport-level failure. */
async function fetchTags(url: string, headers: Record<string, string>, signal: AbortSignal | undefined): Promise<Response> {
  let failure: unknown
  for (let attempt = 0; attempt < TAGS_NETWORK_ATTEMPTS; attempt += 1) {
    try {
      return await fetch(url, {
        method: 'GET',
        headers,
        ...signal === undefined ? {} : { signal },
      })
    } catch (error: unknown) {
      if (signal?.aborted) {
        throw new LlmError('model discovery aborted by caller', 'ABORTED', { cause: error })
      }
      failure = error
    }
  }
  throw new LlmError(`could not reach ${url}${networkDetail(failure)}`, 'DISCOVERY_FAILED', { cause: failure })
}

/**
 * Extract the context window from a `/api/show` response. Scans `model_info`
 * for any `*.context_length` key (e.g. `gemma3.context_length`,
 * `llama.context_length`), and also parses `parameters` for a `num_ctx`
 * line — preferring the `parameters` value when both are present, because a
 * Modelfile-level `PARAMETER num_ctx` overrides the base model's context
 * length ([issue #16188](https://github.com/ollama/ollama/issues/16188)).
 * @param show - the `/api/show` response.
 * @returns the context window in tokens, or `undefined` when neither source discloses one.
 */
export function extractContextWindow(show: WireShowResponse): number | undefined {
  // Prefer parameters num_ctx over model_info context_length.
  const paramCtx = parseNumCtx(show.parameters)
  if (paramCtx !== undefined) return paramCtx
  if (show.model_info !== undefined) {
    for (const [key, value] of Object.entries(show.model_info)) {
      if (key.endsWith('.context_length') && typeof value === 'number' && Number.isInteger(value) && value > 0) {
        return value
      }
    }
  }
  return undefined
}

/** Parse `num_ctx <value>` from a parameters string. */
function parseNumCtx(parameters: string | undefined): number | undefined {
  if (parameters === undefined) return undefined
  const match = parameters.match(/num_ctx\s+(\d+)/)
  if (match === null) return undefined
  const value = Number(match[1])
  return Number.isInteger(value) && value > 0 ? value : undefined
}

/** Capability strings reported by `/api/show` and `/api/tags`. */
const CAPABILITY_VISION = 'vision'
const CAPABILITY_THINKING = 'thinking'
const CAPABILITY_TOOLS = 'tools'

/** Per-model capability metadata extracted from discovery. */
export interface OllamaModelCapabilities {
  /** Whether the model accepts image input. */
  vision: boolean
  /** Whether the model supports thinking/reasoning. */
  thinking: boolean
  /** Whether the model supports tool/function calling. */
  tools: boolean
}

/** Discovery row retaining Ollama-native capability metadata for this package's client card. */
export type OllamaDiscoveredModel = LlmDiscoveredModel & OllamaCatalogModelConfig

/**
 * Extract native capability flags from one `/api/show` response.
 * @param capabilities - capability names returned by Ollama.
 * @returns explicit vision, thinking, and tools flags.
 */
export function extractCapabilities(capabilities: string[] | undefined): OllamaModelCapabilities {
  const set = new Set(capabilities ?? [])
  return {
    vision: set.has(CAPABILITY_VISION),
    thinking: set.has(CAPABILITY_THINKING),
    tools: set.has(CAPABILITY_TOOLS),
  }
}

/**
 * Interrogate one Ollama Cloud endpoint for the models it advertises.
 * Calls `GET /api/tags` to list models, then `POST /api/show` per model to
 * extract context length and capabilities.
 * @param request - the endpoint and one-shot credential to use.
 * @param storedApiKey - the credential the named route already stored, asked
 *   for only when the draft carries none.
 * @returns advertised models with context windows and native capability flags in endpoint order.
 * @throws LlmError when the endpoint refuses or fails the request, or the reply is not a model listing.
 */
export async function discoverModels(
  request: LlmModelDiscoveryRequest,
  storedApiKey?: () => Promise<string | undefined>,
): Promise<readonly OllamaDiscoveredModel[]> {
  const baseURL = (request.baseURL ?? PUBLIC_BASE_URL).replace(/\/+$/, '')
  const supplied = request.apiKey ?? await storedApiKey?.()
  const apiKey = supplied === undefined ? undefined : usableProbeKey(supplied)

  // List models via /api/tags.
  const tagsUrl = `${baseURL}/tags`
  const tagsResponse = await fetchTags(tagsUrl, authHeaders(apiKey), request.signal)
  if (!tagsResponse.ok) {
    throw new LlmError(
      `${tagsUrl} answered ${tagsResponse.status}${tagsResponse.status === 401 || tagsResponse.status === 403 ? '; check the API key' : ''}`,
      'DISCOVERY_FAILED',
    )
  }
  let tagsText: string
  try {
    tagsText = await readBounded(tagsResponse, tagsUrl)
  } catch (error: unknown) {
    if (request.signal?.aborted) {
      throw new LlmError('model discovery aborted by caller', 'ABORTED', { cause: error })
    }
    throw error
  }
  let tagsBody: WireTagsResponse
  try {
    tagsBody = JSON.parse(tagsText) as WireTagsResponse
  } catch (error: unknown) {
    throw new LlmError(`${tagsUrl} did not answer with JSON`, 'DISCOVERY_FAILED', { cause: error })
  }
  if (!Array.isArray(tagsBody.models)) {
    throw new LlmError(
      `${tagsUrl} response has no "models" array`,
      'DISCOVERY_FAILED',
    )
  }

  // For each model, call /api/show to get context length and capabilities.
  const models: OllamaDiscoveredModel[] = []
  for (const tag of tagsBody.models) {
    const id = tag.model ?? tag.name
    if (typeof id !== 'string' || id.length === 0) continue
    const showUrl = `${baseURL}/show`
    let showResponse: Response
    try {
      showResponse = await fetch(showUrl, {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...authHeaders(apiKey) },
        body: JSON.stringify({ model: id }),
        ...request.signal === undefined ? {} : { signal: request.signal },
      })
    } catch (error: unknown) {
      if (request.signal?.aborted) {
        throw new LlmError('model discovery aborted by caller', 'ABORTED', { cause: error })
      }
      // A single model's show failure should not deny the user the rest.
      models.push({ id, ...tag.name !== undefined && tag.name !== id ? { name: tag.name } : {} })
      continue
    }
    if (!showResponse.ok) {
      // Skip show for models that fail it; the tags listing still has the id.
      models.push({ id, ...tag.name !== undefined && tag.name !== id ? { name: tag.name } : {} })
      continue
    }
    let showText: string
    try {
      showText = await readBounded(showResponse, showUrl)
    } catch {
      models.push({ id, ...tag.name !== undefined && tag.name !== id ? { name: tag.name } : {} })
      continue
    }
    let showBody: WireShowResponse
    try {
      showBody = JSON.parse(showText) as WireShowResponse
    } catch {
      models.push({ id, ...tag.name !== undefined && tag.name !== id ? { name: tag.name } : {} })
      continue
    }
    const contextWindow = extractContextWindow(showBody)
    const capabilities = extractCapabilities(showBody.capabilities)
    models.push({
      id,
      ...tag.name !== undefined && tag.name !== id ? { name: tag.name } : {},
      ...contextWindow === undefined ? {} : { contextWindow },
      ...capabilities,
    })
  }
  return models
}
