/**
 * `OllamaAdapter`: fetch + NDJSON against an Ollama Cloud `/api/chat` endpoint,
 * emitting harness `StreamChunk`s. The adapter is transport-only: connection
 * facts arrive through a thunk resolved once per operation and the bearer
 * token through a per-request resolver, so the registering plugin owns
 * validation, layering, and credential policy.
 *
 * @module dsh-llm-ollama/adapter
 */

import {
  attributionHeaders,
  contentHasImage,
  LlmAdapter,
  LlmError,
  ReasoningEffortId,
} from '@deepseek-ai/dsh-llm'
import type {
  GenerateOptions,
  LlmModelInfo,
  LlmProviderInfo,
  LlmResolvedModelInfo,
  ResolvedRetryPolicy,
  StreamChunk,
} from '@deepseek-ai/dsh-llm'
import type { CredentialRef } from '@deepseek-ai/dsh-credentials'
import type { AttachmentStore } from '@deepseek-ai/dsh-attachment'
import { idleWatchdog, timeoutOf } from '@deepseek-ai/dsh-timeout'
import { serializeRequest } from './serialize.ts'
import type { RequestDefaults } from './serialize.ts'
import { parseChatChunks } from './ndjson.ts'
import { translate } from './translate.ts'
import { discoverModels } from './discovery.ts'
import {
  OLLAMA_DEFAULT_CONTEXT_WINDOW,
  OLLAMA_DEFAULT_STREAM_IDLE_TIMEOUT_MS,
} from './client-contract.ts'
import type { OllamaCatalogModelConfig } from './client-contract.ts'
import type { WireChatChunk, WireError } from './types.ts'

/** One optional model entry advertised by the adapter. */
export type OllamaCatalogModel = OllamaCatalogModelConfig

/**
 * Validated connection facts for one operation. The plugin's
 * `resolveAdapterOptions` is the one explicit resolve step producing this
 * shape; the adapter trusts it and re-reads it per operation.
 */
export interface OllamaConnectionOptions {
  /** Endpoint base; `/chat` is appended. */
  baseURL: string
  /** Credential reference of this same resolution, resolved per request. */
  apiKeyEnv: CredentialRef
  /** Advisory models exposed to discovery consumers; requests remain unrestricted. */
  models: readonly OllamaCatalogModel[]
  /** Positive context capacity used when the selected model has no exact value. */
  defaultContextWindow: number
  /** Default per-request output cap; explicit request values win. */
  maxTokens: number | undefined
  /** Maximum provider idle time while one stream read is outstanding. */
  streamIdleTimeoutMs: number
  /** Per-attempt budget for Ollama Cloud Web Search/Fetch requests. */
  webRequestTimeoutMs: number
  /** Provider-owned model-request retry policy, already resolved. */
  retryPolicy: ResolvedRetryPolicy
}

/** Constructor options for {@link OllamaAdapter}: the operation-local resolution hooks the plugin owns. */
export interface OllamaAdapterOptions {
  /** Current validated connection facts; called once per operation. */
  options: () => OllamaConnectionOptions
  /**
   * Resolve the bearer token for the connection facts of one request. Throws
   * `LlmError` `MISSING_CREDENTIAL` when no key is available anywhere.
   */
  resolveApiKey: (connection: OllamaConnectionOptions) => Promise<string>
  /** Resolve the optional durable attachment service at request time. */
  resolveAttachments?: () => AttachmentStore | undefined
}

/** Default maximum idle interval while an adapter stream read is outstanding. */
export const DEFAULT_STREAM_IDLE_TIMEOUT_MS = OLLAMA_DEFAULT_STREAM_IDLE_TIMEOUT_MS
/** Default combined request/response context capacity. */
export const DEFAULT_CONTEXT_WINDOW = OLLAMA_DEFAULT_CONTEXT_WINDOW

const STREAM_IDLE_TIMEOUT_CODE = 'LLM_STREAM_IDLE_TIMEOUT'
const OFF_EFFORT = ReasoningEffortId('off')
const LOW_EFFORT = ReasoningEffortId('low')
const MEDIUM_EFFORT = ReasoningEffortId('medium')
const HIGH_EFFORT = ReasoningEffortId('high')
const MAX_EFFORT = ReasoningEffortId('max')
const ALL_REASONING_EFFORTS = [
  { id: OFF_EFFORT, name: 'Off' },
  { id: LOW_EFFORT, name: 'Low' },
  { id: MEDIUM_EFFORT, name: 'Medium' },
  { id: HIGH_EFFORT, name: 'High' },
  { id: MAX_EFFORT, name: 'Max' },
] as const
const GPT_OSS_REASONING_EFFORTS = [
  { id: LOW_EFFORT, name: 'Low' },
  { id: MEDIUM_EFFORT, name: 'Medium' },
  { id: HIGH_EFFORT, name: 'High' },
] as const

/**
 * Test whether Ollama documents the model family as low/medium/high-only.
 * @param model - Ollama wire model id.
 * @returns true for GPT-OSS ids, including registry-prefixed ids.
 */
export function isGptOssModel(model: string): boolean {
  return /(?:^|\/)gpt-oss(?::|$)/iu.test(model)
}

function modelInfo(provider: string, model: OllamaCatalogModel): LlmModelInfo {
  const inputModalities = model.vision === true ? ['text', 'image'] as const : ['text'] as const
  return {
    provider,
    id: model.id,
    name: model.name ?? model.id,
    ...model.description === undefined ? {} : { description: model.description },
    inputModalities,
  }
}

/**
 * Map an HTTP status to a stable LlmError code.
 * @param status - status of a non-2xx provider response.
 * @param error - parsed provider error body, when available.
 * @returns the normalized harness error code.
 */
export function httpErrorCode(status: number, error?: WireError): string {
  if (status === 401 || status === 403) return 'AUTH'
  if (status === 429) return 'RATE_LIMIT'
  if (status === 400) return 'INVALID_REQUEST'
  if (status >= 500) return 'SERVER'
  void error
  return `HTTP_${status}`
}

/**
 * The Ollama Cloud native chat adapter. One instance serves every model name
 * it was registered under (the harness model name IS the wire model name).
 *
 * One stable signal reaches both initial fetch and body reads. Caller aborts
 * map to `ABORTED`; the configured per-read idle watchdog maps to `TIMEOUT`.
 */
export class OllamaAdapter extends LlmAdapter {
  constructor(private readonly config: OllamaAdapterOptions) {
    super()
  }

  override providerInfo(provider: string): LlmProviderInfo {
    return { id: provider, name: 'Ollama Cloud' }
  }

  override providerRetryPolicy(_provider: string): ResolvedRetryPolicy {
    return this.config.options().retryPolicy
  }

  override listModels(provider: string): Promise<readonly LlmModelInfo[]> {
    return Promise.resolve(this.config.options().models.map(model => modelInfo(provider, model)))
  }

  override resolveModel(
    provider: string,
    model: string,
    _signal?: AbortSignal,
  ): Promise<LlmResolvedModelInfo> {
    const connection = this.config.options()
    const configured = connection.models.find(entry => entry.id === model)
    const contextWindow = configured?.contextWindow ?? connection.defaultContextWindow
    const inputModalities = configured?.vision === true
      ? ['text', 'image'] as const
      : ['text'] as const
    const defaultMaxTokens = configured?.maxTokens ?? connection.maxTokens
    return Promise.resolve({
      ...configured === undefined
        ? { provider, id: model, name: model, inputModalities }
        : modelInfo(provider, configured),
      context: { contextWindow },
      ...defaultMaxTokens !== undefined ? { defaultMaxTokens } : {},
      ...configured?.thinking === true
        ? {
          reasoning: {
            efforts: isGptOssModel(configured.id) ? GPT_OSS_REASONING_EFFORTS : ALL_REASONING_EFFORTS,
            defaultEffort: HIGH_EFFORT,
          },
        }
        : {},
    })
  }

  async * stream(options: GenerateOptions): AsyncIterable<StreamChunk> {
    const connection = this.config.options()
    const apiKey = await this.config.resolveApiKey(connection)
    const consumer = new AbortController()
    const upstream = options.signal === undefined
      ? consumer.signal
      : AbortSignal.any([options.signal, consumer.signal])
    using watchdog = idleWatchdog(upstream, connection.streamIdleTimeoutMs, STREAM_IDLE_TIMEOUT_CODE)
    const iterator = this.request(
      options,
      watchdog.signal,
      connection,
      apiKey,
      () => { watchdog.pulse() },
    )[Symbol.asyncIterator]()
    let exhausted = false
    try {
      while (true) {
        const result = await watchdog.next(iterator)
        if (result.done) {
          exhausted = true
          return
        }
        yield result.value
      }
    } catch (error: unknown) {
      if (timeoutOf(watchdog.signal, STREAM_IDLE_TIMEOUT_CODE) !== undefined) {
        throw new LlmError(
          `Ollama stream idle timeout after ${connection.streamIdleTimeoutMs}ms`,
          'TIMEOUT',
          { cause: error },
        )
      }
      if (options.signal?.aborted) {
        throw new LlmError('Ollama request aborted by caller', 'ABORTED', { cause: error })
      }
      if (error instanceof LlmError) throw error
      throw new LlmError(`Ollama API stream from ${connection.baseURL} failed`, 'TRANSPORT', { cause: error })
    } finally {
      consumer.abort('Ollama stream consumer stopped')
      if (!exhausted && iterator.return !== undefined) {
        try {
          await iterator.return()
        } catch (_abortedTransportTeardown) {
          // The consumer controller already owns termination; a return-time abort cannot add a second outcome.
        }
      }
    }
  }

  private async * request(
    options: GenerateOptions,
    signal: AbortSignal,
    connection: OllamaConnectionOptions,
    apiKey: string,
    onChunk: () => void,
  ): AsyncIterable<StreamChunk> {
    // Vision gating: reject images on text-only models before serialization.
    const configured = connection.models.find(entry => entry.id === options.model)
    const containsImage = options.messages.some(message => contentHasImage(message.content))
    if (containsImage && configured?.vision !== true) {
      throw new LlmError(
        `Ollama model "${options.model}" does not support image input`,
        'UNSUPPORTED_CONTENT',
      )
    }
    const attachments = containsImage ? this.config.resolveAttachments?.() : undefined
    if (containsImage && attachments === undefined) {
      throw new LlmError('Ollama image input requires the durable attachment service', 'UNSUPPORTED_CONTENT')
    }

    const defaults: RequestDefaults = {
      thinking: configured?.thinking,
      thinkingCanDisable: configured?.thinking === true && !isGptOssModel(configured.id),
    }
    const body = await serializeRequest(options, defaults, attachments)
    const payload = JSON.stringify(body)
    const headers = {
      'authorization': `Bearer ${apiKey}`,
      'content-type': 'application/json',
      'accept': 'application/x-ndjson',
      ...attributionHeaders(),
    }

    let response: Response
    try {
      response = await fetch(`${connection.baseURL}/chat`, {
        method: 'POST',
        headers,
        body: payload,
        signal,
      })
    } catch (error: unknown) {
      if (signal.aborted) throw error
      throw new LlmError(
        `Ollama API request to ${connection.baseURL} failed`,
        'TRANSPORT',
        { cause: error },
      )
    }

    if (!response.ok) {
      let message = `Ollama API error (HTTP ${response.status})`
      let providerError: WireError | undefined
      try {
        providerError = await response.json() as WireError
        if (providerError.error) message = providerError.error
      } catch {
        // Only swallow error-body parsing: the HTTP status still identifies the failure.
      }
      throw new LlmError(message, httpErrorCode(response.status, providerError), {
        status: response.status,
      })
    }
    if (!response.body) {
      throw new LlmError('Ollama API returned no response body', 'EMPTY_RESPONSE')
    }

    // Wrap the chunk stream to pulse the watchdog on each chunk.
    const chunks = parseChatChunks<WireChatChunk>(response.body)
    const pulsed = async function* (): AsyncIterable<WireChatChunk> {
      for await (const chunk of chunks) {
        onChunk()
        yield chunk
      }
    }
    yield* translate(pulsed())
  }
}

/** Re-export the discovery function for the plugin entry. */
export { discoverModels }
