/**
 * Ollama Cloud chat adapter for the Harness LLM seam. The public adapter and
 * provider route stay Ollama-specific, while the chat wire implementation is
 * delegated to pi-ai's OpenAI Chat Completions support. Ollama-native APIs
 * remain in use for discovery and Web Search/Fetch outside this class.
 *
 * @module dsh-llm-ollama/adapter
 */

import { LlmAdapter } from '@deepseek-ai/dsh-llm'
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
import { PiAiAdapter } from '@deepseek-ai/dsh-llm-pi-ai'
import type { ResolvedPiAiProviderProfile } from '@deepseek-ai/dsh-llm-pi-ai'
import { discoverModels } from './discovery.ts'
import {
  OLLAMA_DEFAULT_CONTEXT_WINDOW,
  OLLAMA_DEFAULT_STREAM_IDLE_TIMEOUT_MS,
  OLLAMA_PROVIDER,
} from './client-contract.ts'
import type { OllamaCatalogModelConfig } from './client-contract.ts'
import { createOllamaPiAiProfile } from './pi-ai-profile.ts'
import { createOllamaPiAiAuth } from './pi-ai-auth.ts'
import { applyOllamaReasoningMetadata } from './reasoning.ts'
import type { WireError } from './types.ts'

export { isGptOssModel } from './reasoning.ts'

/** One optional model entry advertised by the adapter. */
export type OllamaCatalogModel = OllamaCatalogModelConfig

/**
 * Validated connection facts for one operation. The plugin's
 * resolveAdapterOptions is the one explicit resolve step producing this
 * shape; the adapter trusts it and re-reads it per operation.
 */
export interface OllamaConnectionOptions {
  /** Native Ollama endpoint base; discovery and Web providers use it as-is. */
  baseURL: string
  /** Credential reference of this same resolution, resolved per request. */
  apiKeyEnv: CredentialRef
  /** Models exposed to discovery consumers and accepted for chat requests. */
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

/** Constructor options for OllamaAdapter: the operation-local resolution hooks the plugin owns. */
export interface OllamaAdapterOptions {
  /** Current validated connection facts; called once per operation. */
  options: () => OllamaConnectionOptions
  /**
   * Resolve the bearer token for the connection facts of one request. Throws
   * LlmError MISSING_CREDENTIAL when no key is available anywhere.
   */
  resolveApiKey: (connection: OllamaConnectionOptions) => Promise<string>
  /** Resolve the optional durable attachment service at request time. */
  resolveAttachments?: () => AttachmentStore | undefined
}

/** Default maximum idle interval while an adapter stream read is outstanding. */
export const DEFAULT_STREAM_IDLE_TIMEOUT_MS = OLLAMA_DEFAULT_STREAM_IDLE_TIMEOUT_MS
/** Default combined request/response context capacity. */
export const DEFAULT_CONTEXT_WINDOW = OLLAMA_DEFAULT_CONTEXT_WINDOW

/**
 * Map an HTTP status to a stable LlmError code for source-compatible callers.
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
  return 'HTTP_' + status
}

/**
 * Classify documented transient Ollama failures that can arrive without an HTTP status.
 * @param chunk - One delegated DSH stream chunk.
 * @returns The original chunk, or a copy with a retryable server code.
 */
export function classifyOllamaTransientError(chunk: StreamChunk): StreamChunk {
  if (chunk.type !== 'finish' || chunk.reason.kind !== 'error' || chunk.reason.failure.code !== 'PI_AI_ERROR') {
    return chunk
  }
  if (!/model failed to generate a response|error was encountered while running the model|cloud model cannot be reached|server is overloaded/iu.test(chunk.reason.failure.message)) {
    return chunk
  }
  return {
    ...chunk,
    reason: {
      ...chunk.reason,
      failure: { ...chunk.reason.failure, code: 'SERVER' },
    },
  }
}

const SANDBOX_MODE_RANK: Record<string, number> = {
  'read-only': 0,
  'workspace-write': 1,
  'danger-full-access': 2,
}

/**
 * Remove sandbox escalation choices that cannot be strictly wider than the
 * current DSH policy. Core still validates every retained request; this only
 * prevents the model from selecting an impossible optional enum value.
 * Scans both options.system and context-injection text inside options.messages.
 */
export function narrowOllamaEscalationSchemas(options: GenerateOptions): GenerateOptions {
  const mode = sandboxModeOf(options)
  const currentRank = mode === undefined ? undefined : SANDBOX_MODE_RANK[mode]
  if (currentRank === undefined || options.tools === undefined) return options
  let changed = false
  const tools = options.tools.map((tool) => {
    const parameters = tool.parameters
    const properties = isRecord(parameters.properties) ? parameters.properties : undefined
    const permission = properties === undefined || !isRecord(properties.sandbox_permissions)
      ? undefined
      : properties.sandbox_permissions
    if (permission === undefined || !Array.isArray(permission.enum)) return tool
    const wider = permission.enum.filter((candidate): candidate is string => {
      return typeof candidate === 'string' && (SANDBOX_MODE_RANK[candidate] ?? -1) > currentRank
    })
    if (wider.length === permission.enum.length) return tool
    changed = true
    const nextProperties = { ...properties }
    if (wider.length === 0) {
      delete nextProperties.sandbox_permissions
      delete nextProperties.justification
    } else {
      nextProperties.sandbox_permissions = { ...permission, enum: wider }
    }
    const required = Array.isArray(parameters.required)
      ? parameters.required.filter(name => name !== 'sandbox_permissions' && name !== 'justification')
      : undefined
    return {
      ...tool,
      parameters: {
        ...parameters,
        properties: nextProperties,
        ...(required === undefined ? {} : { required }),
      },
    }
  })
  return changed ? { ...options, tools } : options
}

function sandboxModeOf(options: GenerateOptions): string | undefined {
  for (let index = options.messages.length - 1; index >= 0; index -= 1) {
    const message = options.messages[index]
    if (!isRecord(message)) continue
    const found = sandboxModeIn((message as { content?: unknown }).content)
    if (found !== undefined) return found
  }
  return sandboxModeIn(options.system)
}

function sandboxModeIn(value: unknown): string | undefined {
  if (typeof value === 'string') {
    return /Current DSH file policy:\s*(read-only|workspace-write|danger-full-access)\./u.exec(value)?.[1]
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = sandboxModeIn(item)
      if (found !== undefined) return found
    }
    return undefined
  }
  if (!isRecord(value)) return undefined
  return sandboxModeIn((value as { text?: unknown }).text) ?? sandboxModeIn((value as { content?: unknown }).content)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

/** The Ollama Cloud chat adapter backed by pi-ai OpenAI Chat Completions. */
export class OllamaAdapter extends LlmAdapter {
  private readonly auth = createOllamaPiAiAuth()
  private snapshot: { options: OllamaConnectionOptions, adapter: PiAiAdapter } | undefined

  constructor(private readonly config: OllamaAdapterOptions) {
    super()
  }

  /** Rebuild the delegated adapter only when the plugin publishes a new options snapshot. */
  private current(): PiAiAdapter {
    const options = this.config.options()
    if (this.snapshot?.options === options) return this.snapshot.adapter
    const profile = createOllamaPiAiProfile(options)
    const profiles = new Map<string, ResolvedPiAiProviderProfile>([[OLLAMA_PROVIDER, profile]])
    const adapterOptions = {
      profiles: () => profiles,
      resolveApiKey: () => this.config.resolveApiKey(options),
      auth: this.auth,
      ...this.config.resolveAttachments === undefined
        ? {}
        : { resolveAttachments: this.config.resolveAttachments },
    }
    const adapter = new PiAiAdapter(adapterOptions)
    this.snapshot = { options, adapter }
    return adapter
  }

  override providerInfo(provider: string): LlmProviderInfo {
    return this.current().providerInfo(provider)
  }

  override providerRetryPolicy(provider: string): ResolvedRetryPolicy | undefined {
    return this.current().providerRetryPolicy(provider)
  }

  override listModels(provider: string): Promise<readonly LlmModelInfo[]> {
    return this.current().listModels(provider)
  }

  override async resolveModel(
    provider: string,
    model: string,
    signal?: AbortSignal,
  ): Promise<LlmResolvedModelInfo> {
    const info = await this.current().resolveModel(provider, model, signal)
    const catalog = this.config.options().models.find(entry => entry.id === model)
    return applyOllamaReasoningMetadata(info, model, catalog?.defaultEffort)
  }

  override async * stream(options: GenerateOptions): AsyncIterable<StreamChunk> {
    for await (const chunk of this.current().stream(narrowOllamaEscalationSchemas(options))) {
      yield classifyOllamaTransientError(chunk)
    }
  }

  /** Own the method so rc.2 Host can call it even when this class extends an older LlmAdapter. */
  async prepareCall(provider: string, model: string, signal?: AbortSignal) {
    const delegate = this.current()
    const inner = typeof (delegate as { prepareCall?: unknown }).prepareCall === 'function'
      ? await (delegate as unknown as { prepareCall: (provider: string, model: string, signal?: AbortSignal) => Promise<{
        model: LlmResolvedModelInfo
        stream: (options: GenerateOptions) => AsyncIterable<StreamChunk>
      }> }).prepareCall(provider, model, signal)
      : {
        model: await this.resolveModel(provider, model, signal),
        stream: (options: GenerateOptions) => delegate.stream(options),
      }
    return {
      model: inner.model,
      stream: async function* (options: GenerateOptions) {
        for await (const chunk of inner.stream(narrowOllamaEscalationSchemas(options)) as AsyncIterable<StreamChunk>) {
          yield classifyOllamaTransientError(chunk)
        }
      },
    }
  }

  /**
   * Declare neutral request-image pricing when a newer Host calls an adapter built against an older peer instance.
   * The method omits `override` so the same source compiles against pre-alpha peer types.
   * @param _provider - provider route.
   * @param _model - model id.
   * @returns `undefined` so the Host uses heuristic image pricing.
   */
  imageRequestPricing(_provider: string, _model: string): undefined {
    return undefined
  }
}

/** Re-export the discovery function for the plugin entry. */
export { discoverModels }