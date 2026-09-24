/**
 * Register the `ollama-cloud` route with chat delegated to pi-ai OpenAI Chat
 * Completions, while keeping Ollama-native discovery and Web Search/Fetch as
 * independent capabilities. Runtime settings come from the Loader entry;
 * only the provider card's base URL and model catalog are volatile.
 *
 * The browser uses one authenticated `/api` Fetch route for this plugin's
 * discovery, credential, and usage requests.
 * @module dsh-llm-ollama
 */

import type { Context, Volatile } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { clientRequestSchema } from '@deepseek-ai/dsh-client-connection'
import type { ConnectionRpcHandler, ConnectionRpcHandlerResult } from '@deepseek-ai/dsh-client-connection'
import type {} from '@deepseek-ai/dsh-settings'
import type {} from '@deepseek-ai/dsh-web'
import {
  assertUsableApiKey,
  INVALID_CREDENTIAL_CODE,
  isHarnessError,
  LlmError,
  resolveRetryPolicy,
  RetryPolicySchema,
} from '@deepseek-ai/dsh-llm'
import type { RetryPolicyConfig } from '@deepseek-ai/dsh-llm'
import { credentialRef } from '@deepseek-ai/dsh-credentials'
import { launchEnvironmentOf } from '@deepseek-ai/dsh-launch-environment'
import { MAX_TIMER_DELAY_MS } from '@deepseek-ai/dsh-timeout'
import { allowDshRuntime } from './compatibility.ts'
import {
  DEFAULT_CONTEXT_WINDOW,
  DEFAULT_STREAM_IDLE_TIMEOUT_MS,
  OllamaAdapter,
} from './adapter.ts'
import type { OllamaCatalogModel, OllamaConnectionOptions } from './adapter.ts'
import { PUBLIC_BASE_URL } from './discovery.ts'
import { discoverModels } from './discovery.ts'
import { OLLAMA_USAGE_UNSUPPORTED, readOllamaUsage } from './usage.ts'
import {
  DEFAULT_WEB_REQUEST_TIMEOUT_MS,
  OllamaWebFetchProvider,
  OllamaWebSearchProvider,
} from './web.ts'
import type { OllamaWebProviderOptions } from './web.ts'
import {
  decodeOllamaCredentialSetRequest,
  decodeOllamaDiscoveryRequest,
  decodeOllamaSettingsValidationRequest,
  DEFAULT_API_KEY_ENV,
  OLLAMA_CREDENTIAL_SET_ENDPOINT,
  OLLAMA_CREDENTIAL_STATUS_ENDPOINT,
  OLLAMA_DISCOVER_ENDPOINT,
  OLLAMA_PROVIDER,
  OLLAMA_RPC_METHOD,
  OLLAMA_SETTINGS_NAMESPACE,
  OLLAMA_SETTINGS_VALIDATE_ENDPOINT,
  OLLAMA_USAGE_ENDPOINT,
} from './client-contract.ts'

export {
  DEFAULT_CONTEXT_WINDOW,
  DEFAULT_STREAM_IDLE_TIMEOUT_MS,
  OllamaAdapter,
} from './adapter.ts'
export type { OllamaAdapterOptions, OllamaCatalogModel, OllamaConnectionOptions } from './adapter.ts'
export { PUBLIC_BASE_URL, discoverModels } from './discovery.ts'
export { extractContextWindow, extractCapabilities } from './discovery.ts'
export type { OllamaDiscoveredModel, OllamaModelCapabilities } from './discovery.ts'
export {
  DEFAULT_WEB_REQUEST_TIMEOUT_MS,
  OLLAMA_WEB_PROVIDER_ID,
  OllamaWebFetchProvider,
  OllamaWebSearchProvider,
} from './web.ts'
export type { OllamaWebProviderOptions } from './web.ts'
export {
  DEFAULT_USAGE_REQUEST_TIMEOUT_MS,
  OLLAMA_USAGE_FAILED,
  OLLAMA_USAGE_UNSUPPORTED,
  parseOllamaUsage,
  readOllamaUsage,
} from './usage.ts'
export type { OllamaUsageRequest } from './usage.ts'
export {
  DEFAULT_API_KEY_ENV,
  OLLAMA_CREDENTIAL_SET_ENDPOINT,
  OLLAMA_CREDENTIAL_STATUS_ENDPOINT,
  OLLAMA_DISCOVER_ENDPOINT,
  OLLAMA_PROVIDER,
  OLLAMA_PUBLIC_BASE_URL,
  OLLAMA_RPC_METHOD,
  OLLAMA_SETTINGS_NAMESPACE,
  OLLAMA_SETTINGS_VALIDATE_ENDPOINT,
  OLLAMA_USAGE_ENDPOINT,
  decodeOllamaCatalogModel,
  decodeOllamaCredentialSetRequest,
  decodeOllamaCredentialStatus,
  decodeOllamaDiscoveryRequest,
  decodeOllamaDiscoveryResult,
  decodeOllamaSettings,
  decodeOllamaSettingsValidationRequest,
  decodeOllamaUsageReply,
} from './client-contract.ts'
export type {
  OllamaCatalogModelConfig,
  OllamaCredentialSetRequest,
  OllamaCredentialStatus,
  OllamaDiscoveryRequest,
  OllamaDiscoveryResult,
  OllamaSaveResult,
  OllamaSettingsValidationRequest,
  OllamaSettingsView,
  OllamaUsageModelCount,
  OllamaUsageReply,
  OllamaUsageView,
  OllamaUsageWindow,
} from './client-contract.ts'
export type * from './types.ts'

export const name = 'llm-ollama'
export const inject = ['llm', 'webServer']

/** Preserve Ollama's historical normal retry count across host-line default changes. */
const DEFAULT_MAX_RETRIES = 2

const NS = OLLAMA_SETTINGS_NAMESPACE

/**
 * Failure codes meaning this account has no usable credential, wherever they
 * were raised: this route's own verdict, the missing-credential class a
 * credential provider answers with, and the auth class a provider adapter
 * classifies for a refused 401/403 session. Any other code is a failure of the
 * read, not a verdict on the credential.
 */
const CREDENTIAL_FAILURE_CODES: readonly string[] = [INVALID_CREDENTIAL_CODE, 'MISSING_CREDENTIAL', 'AUTH']

/**
 * Plugin config. Volatile fields are the fields the provider card edits live.
 */
export interface Config {
  /** Credential reference (environment-variable name); defaults to `OLLAMA_API_KEY`. */
  apiKeyEnv: string
  /** Endpoint base; defaults to the public Ollama Cloud API. */
  baseURL: Volatile<string>
  /** Advisory models shown by discovery consumers; defaults to none. */
  models: Volatile<OllamaCatalogModel[]>
  /** Default per-request output cap; omitted leaves the request cap to the model profile. */
  maxTokens?: number
  /** Positive context capacity used when the selected model has no exact value (default 262144). */
  defaultContextWindow: number
  /** Maximum provider idle time while one stream read is outstanding (default five minutes). */
  streamIdleTimeoutMs: number
  /** Per-attempt budget for Ollama Cloud Web Search/Fetch requests (default 15 seconds). */
  webRequestTimeoutMs: number
  /** Provider-owned model-request retry policy; omission uses normal defaults. */
  retryPolicy?: RetryPolicyConfig
}

interface ConfigValues {
  apiKeyEnv?: string
  baseURL?: string
  models?: readonly OllamaCatalogModel[]
  maxTokens?: number
  defaultContextWindow?: number
  streamIdleTimeoutMs?: number
  webRequestTimeoutMs?: number
  retryPolicy?: RetryPolicyConfig
}

const catalogModel: z<OllamaCatalogModel> = z.object({
  id: z.string().required(),
  name: z.string(),
  description: z.string(),
  contextWindow: z.number().step(1).min(1),
  maxTokens: z.number().step(1).min(1),
  vision: z.boolean(),
  thinking: z.boolean(),
  defaultEffort: z.string(),
  tools: z.boolean(),
})

export const Config = z.object({
  apiKeyEnv: z.string().role('credential-ref').default(DEFAULT_API_KEY_ENV),
  baseURL: z.string().default(PUBLIC_BASE_URL).volatile(),
  models: z.array(catalogModel).default([]).volatile(),
  maxTokens: z.number().step(1).min(1).max(Number.MAX_SAFE_INTEGER),
  defaultContextWindow: z.number().step(1).min(1).default(DEFAULT_CONTEXT_WINDOW),
  streamIdleTimeoutMs: z.number().min(Number.MIN_VALUE).max(MAX_TIMER_DELAY_MS).default(DEFAULT_STREAM_IDLE_TIMEOUT_MS),
  webRequestTimeoutMs: z.number().step(1).min(1).max(MAX_TIMER_DELAY_MS).default(DEFAULT_WEB_REQUEST_TIMEOUT_MS),
  retryPolicy: RetryPolicySchema,
})

/** One resolution's complete request facts. */
export type ResolvedOllamaOptions = OllamaConnectionOptions

/** Resolve, validate, and detach the advisory model catalog. */
function resolveModels(models: readonly OllamaCatalogModel[] | undefined): OllamaCatalogModel[] {
  const seen = new Set<string>()
  return (models ?? []).map((model) => {
    if (model.id.length === 0) throw new Error('llm-ollama: catalog model ids must be non-empty')
    if (model.name !== undefined && model.name.length === 0) {
      throw new Error(`llm-ollama: catalog model "${model.id}" has an empty name`)
    }
    if (model.contextWindow !== undefined
      && (!Number.isInteger(model.contextWindow) || model.contextWindow <= 0)) {
      throw new Error(
        `llm-ollama: catalog model "${model.id}" contextWindow must be a positive integer`,
      )
    }
    if (model.maxTokens !== undefined
      && (!Number.isInteger(model.maxTokens) || model.maxTokens <= 0)) {
      throw new Error(
        `llm-ollama: catalog model "${model.id}" maxTokens must be a positive integer`,
      )
    }
    if (seen.has(model.id)) throw new Error(`llm-ollama: duplicate catalog model "${model.id}"`)
    seen.add(model.id)
    return {
      id: model.id,
      ...model.name === undefined ? {} : { name: model.name },
      ...model.description === undefined ? {} : { description: model.description },
      ...model.contextWindow === undefined ? {} : { contextWindow: model.contextWindow },
      ...model.maxTokens === undefined ? {} : { maxTokens: model.maxTokens },
      ...model.vision === undefined ? {} : { vision: model.vision },
      ...model.thinking === undefined ? {} : { thinking: model.thinking },
      ...model.defaultEffort === undefined ? {} : { defaultEffort: model.defaultEffort },
      ...model.tools === undefined ? {} : { tools: model.tools },
    }
  })
}

/**
 * The one explicit resolve step from raw config to validated connection facts.
 * @param config - raw plugin config or resolved settings snapshot.
 * @returns validated connection facts plus the credential reference.
 */
export function resolveAdapterOptions(config: ConfigValues): ResolvedOllamaOptions {
  if (config.defaultContextWindow !== undefined
    && (!Number.isInteger(config.defaultContextWindow) || config.defaultContextWindow <= 0)) {
    throw new Error('llm-ollama: defaultContextWindow must be a positive integer')
  }
  if (config.maxTokens !== undefined
    && (!Number.isSafeInteger(config.maxTokens) || config.maxTokens <= 0)) {
    throw new Error('llm-ollama: maxTokens must be a positive safe integer')
  }
  const streamIdleTimeoutMs = config.streamIdleTimeoutMs ?? DEFAULT_STREAM_IDLE_TIMEOUT_MS
  if (!Number.isFinite(streamIdleTimeoutMs)
    || streamIdleTimeoutMs <= 0
    || streamIdleTimeoutMs > MAX_TIMER_DELAY_MS) {
    throw new Error(
      `llm-ollama: streamIdleTimeoutMs must be a positive finite number no greater than ${MAX_TIMER_DELAY_MS}`,
    )
  }
  const webRequestTimeoutMs = config.webRequestTimeoutMs ?? DEFAULT_WEB_REQUEST_TIMEOUT_MS
  if (!Number.isSafeInteger(webRequestTimeoutMs)
    || webRequestTimeoutMs <= 0
    || webRequestTimeoutMs > MAX_TIMER_DELAY_MS) {
    throw new Error(
      `llm-ollama: webRequestTimeoutMs must be a positive safe integer no greater than ${MAX_TIMER_DELAY_MS}`,
    )
  }
  return {
    apiKeyEnv: credentialRef(config.apiKeyEnv ?? DEFAULT_API_KEY_ENV),
    baseURL: config.baseURL ?? PUBLIC_BASE_URL,
    models: resolveModels(config.models),
    defaultContextWindow: config.defaultContextWindow ?? DEFAULT_CONTEXT_WINDOW,
    maxTokens: config.maxTokens,
    streamIdleTimeoutMs,
    webRequestTimeoutMs,
    retryPolicy: resolveRetryPolicy(
      config.retryPolicy ?? { mode: 'normal', maxRetries: DEFAULT_MAX_RETRIES },
      'llm-ollama: retryPolicy',
    ),
  }
}

function discoveryFailure(message: string, baseURL?: string) {
  return {
    ok: false as const,
    error: {
      code: 'model-discovery-failed' as const,
      message,
      details: {
        settingsNs: OLLAMA_SETTINGS_NAMESPACE,
        ...baseURL === undefined ? {} : { baseURL },
      },
    },
  }
}

/**
 * Refuse one Host endpoint. The code defaults to `internal` and callers pass a
 * provider's own code when the failure class is known to the browser.
 */
function settingsFailure(message: string, code = 'internal') {
  return {
    ok: false as const,
    error: {
      code,
      message,
      details: {},
    },
  }
}

/**
 * Fold one usage-read failure: "unsupported" is a legitimate answer, the rest
 * are errors. An LlmError keeps its own code, so a credential the Host cannot
 * use reaches the browser as INVALID_CREDENTIAL and the shared quota cache
 * drops the entry instead of retaining the previous account's numbers.
 */
function usageFailure(error: unknown) {
  if (!(error instanceof LlmError)) return settingsFailure('Ollama Cloud usage read failed')
  if (error.code === OLLAMA_USAGE_UNSUPPORTED) {
    return { ok: true as const, value: { status: 'unsupported' as const } }
  }
  return settingsFailure(
    error.message.length > 0 ? error.message : 'Ollama Cloud usage read failed',
    error.code,
  )
}

export function apply(ctx: Context, config: Config): void {
  if (!allowDshRuntime(ctx.logger, 'dsh-llm-ollama', ['@deepseek-ai/dsh-llm'])) return

  let lastBaseURL: string | undefined
  let lastModels: readonly OllamaCatalogModel[] | undefined
  let lastGood: ResolvedOllamaOptions | undefined
  const options = (): ResolvedOllamaOptions => {
    const baseURL = config.baseURL.get()
    const models = config.models.get()
    if (baseURL === lastBaseURL && models === lastModels && lastGood !== undefined) return lastGood
    const { baseURL: _baseURL, models: _models, ...rest } = config
    const values: ConfigValues = { ...rest, baseURL, models }
    try {
      const next = resolveAdapterOptions(values)
      lastBaseURL = baseURL
      lastModels = models
      lastGood = next
      return next
    } catch (error) {
      if (lastGood === undefined) throw error
      lastBaseURL = baseURL
      lastModels = models
      ctx.logger.error('llm-ollama: keeping the last good configuration after an invalid settings update')
      ctx.logger.error(error)
      return lastGood
    }
  }
  options()

  const resolveApiKey = async (connection: ResolvedOllamaOptions): Promise<string> => {
    const ref = connection.apiKeyEnv
    const credentials = ctx.get('credentials')
    if (credentials !== undefined) {
      const hit = await credentials.resolve(ref)
      if (hit !== undefined) return assertUsableApiKey(hit.value, 'llm-ollama', ref)
    } else {
      const ambient = launchEnvironmentOf(ctx).get(ref)
      if (ambient !== undefined && ambient.value.length > 0) {
        return assertUsableApiKey(ambient.value, 'llm-ollama', ref)
      }
    }
    throw new LlmError(
      `llm-ollama: no API key for provider route "${OLLAMA_PROVIDER}"; store ${ref} through the credentials`
      + ` service (Plugin configuration writes it), or export ${ref} in the launching environment`,
      'MISSING_CREDENTIAL',
    )
  }

  const adapter = new OllamaAdapter({
    options,
    resolveApiKey,
    resolveAttachments: () => ctx.get('attachments'),
  })
  ctx.llm.registerConfigurableProviders([
    { provider: OLLAMA_PROVIDER, displayName: 'Ollama Cloud', settingsNs: NS, settingsPath: [] },
  ])
  ctx.llm.registerAdapter([OLLAMA_PROVIDER], adapter)

  const storedApiKey = async (): Promise<string | undefined> => {
    const ref = options().apiKeyEnv
    const credentials = ctx.get('credentials')
    if (credentials !== undefined) {
      const hit = await credentials.resolve(ref)
      return hit?.value
    }
    return launchEnvironmentOf(ctx).get(ref)?.value
  }
  ctx.llm.registerModelDiscovery(NS, (request, signal) => discoverModels(request, storedApiKey, signal))

  ctx.effect(() => {
    const web = ctx.get('web')
    if (web === undefined) return () => {}
    const shared: OllamaWebProviderOptions = {
      baseURL: () => options().baseURL,
      resolveApiKey: storedApiKey,
      requestTimeoutMs: options().webRequestTimeoutMs,
    }
    const disposeSearch = web.registerSearchProvider(new OllamaWebSearchProvider(shared))
    const disposeFetch = web.registerFetchProvider(new OllamaWebFetchProvider(shared))
    return () => { disposeSearch(); disposeFetch() }
  }, 'llm-ollama: web providers')

  ctx.inject(['connection', 'webServer'], (connectionCtx) => {
    const usageApiKey = async (): Promise<string | undefined> => {
      try {
        return await storedApiKey()
      } catch (error: unknown) {
        if (!isHarnessError(error) || !CREDENTIAL_FAILURE_CODES.includes(error.code)) throw error
        throw new LlmError(
          error.message.length > 0 ? error.message : 'Ollama Cloud credential lookup failed',
          INVALID_CREDENTIAL_CODE,
          { cause: error },
        )
      }
    }
    const handler: ConnectionRpcHandler = async (endpoint, payload, signal) => {
      if (endpoint === OLLAMA_CREDENTIAL_STATUS_ENDPOINT) {
        if (payload !== undefined
          && (typeof payload !== 'object' || payload === null || Array.isArray(payload)
            || Object.keys(payload).length > 0)) {
          return settingsFailure('invalid Ollama Cloud credential request')
        }
        const credentials = ctx.get('credentials')
        if (credentials === undefined) return settingsFailure('Ollama Cloud credentials are unavailable')
        const info = await credentials.describe(options().apiKeyEnv)
        return { ok: true as const, value: { configured: info.configured, writable: info.writable } }
      }
      if (endpoint === OLLAMA_CREDENTIAL_SET_ENDPOINT) {
        const request = decodeOllamaCredentialSetRequest(payload)
        const credentials = ctx.get('credentials')
        if (request === undefined || credentials === undefined) return settingsFailure('invalid Ollama Cloud credential request')
        try {
          const ref = options().apiKeyEnv
          await credentials.set(ref, assertUsableApiKey(request.value, 'llm-ollama', ref))
          const info = await credentials.describe(ref)
          return { ok: true as const, value: { configured: info.configured, writable: info.writable } }
        } catch (error: unknown) {
          return settingsFailure(error instanceof Error ? error.message : 'Ollama Cloud credential save failed')
        }
      }
      if (endpoint === OLLAMA_DISCOVER_ENDPOINT) {
        const request = decodeOllamaDiscoveryRequest(payload)
        if (request === undefined) return discoveryFailure('invalid Ollama Cloud discovery request')
        try {
          const models = await discoverModels(request, storedApiKey, signal)
          return { ok: true as const, value: { models } }
        } catch (error: unknown) {
          const message = error instanceof LlmError
            ? error.message
            : 'Ollama Cloud model discovery failed'
          return discoveryFailure(message, request.baseURL)
        }
      }
      if (endpoint === OLLAMA_SETTINGS_VALIDATE_ENDPOINT) {
        const request = decodeOllamaSettingsValidationRequest(payload)
        if (request === undefined) return settingsFailure('invalid Ollama Cloud settings request')
        const descriptor = ctx.get('settings')?.describe({ redactSecrets: true }).find(item => item.ns === NS)
        if (descriptor === undefined) return settingsFailure('Ollama Cloud settings are unavailable')
        if (descriptor.revision !== request.expectedRevision) {
          return settingsFailure(
            `settings namespace "${NS}" changed since it was read (expected revision ${request.expectedRevision}, now ${descriptor.revision})`,
            'SETTINGS_CONFLICT',
          )
        }
        try {
          const { baseURL: _baseURL, models: _models, ...rest } = config
          resolveAdapterOptions({ ...rest, baseURL: request.baseURL, models: request.models })
          return { ok: true as const, value: {} }
        } catch (error: unknown) {
          return settingsFailure(
            error instanceof Error && error.message.length > 0 ? error.message : 'invalid Ollama Cloud settings request',
          )
        }
      }
      if (endpoint === OLLAMA_USAGE_ENDPOINT) {
        const request = decodeOllamaDiscoveryRequest(payload)
        if (request === undefined) return settingsFailure('invalid Ollama Cloud usage request')
        try {
          const usage = await readOllamaUsage({ ...request, signal }, usageApiKey)
          return { ok: true as const, value: { status: 'ok' as const, usage } }
        } catch (error: unknown) {
          return usageFailure(error)
        }
      }
      return settingsFailure(`unknown Ollama Cloud endpoint: ${endpoint}`)
    }
    connectionCtx.effect(() => connectionCtx.connection.fetch.register({
      path: '/api/plugin-rpc/ollama-cloud',
      methods: ['POST'],
      requestBody: 'buffered',
      fetch: async (request) => {
        if (request.headers.get('content-type')?.split(';', 1)[0]?.trim().toLowerCase() !== 'application/json') {
          return new Response('unsupported media type', { status: 415 })
        }
        let body: unknown
        try {
          body = await request.json()
        } catch {
          return new Response('invalid JSON', { status: 400 })
        }
        const parsed = clientRequestSchema.safeParse(body)
        if (!parsed.success || parsed.data.method !== OLLAMA_RPC_METHOD) {
          return new Response('invalid plugin RPC request', { status: 400 })
        }
        const wrapper = parsed.data.payload
        if (typeof wrapper !== 'object' || wrapper === null || Array.isArray(wrapper)) {
          return new Response('invalid plugin RPC payload', { status: 400 })
        }
        const envelope = wrapper as Record<string, unknown>
        if (typeof envelope['endpoint'] !== 'string') {
          return new Response('invalid plugin RPC payload', { status: 400 })
        }
        let result: ConnectionRpcHandlerResult
        try {
          result = await handler(
            envelope['endpoint'],
            envelope['payload'],
            request.signal,
            connectionCtx.connection.operator,
          )
        } catch {
          return new Response('internal server error', { status: 500 })
        }
        const rpcResult = result.ok
          ? { ok: true as const, value: result.value }
          : { ok: false as const, error: result.error }
        const response = { type: 'server-response' as const, rpcId: parsed.data.rpcId, result: rpcResult }
        if (!result.ok || result.attachments === undefined || result.attachments.length === 0) {
          return Response.json(response)
        }
        const parts = new FormData()
        const attachments = result.attachments.map((attachment, index) => {
          const part = `bytes-${index}`
          parts.set(part, new Blob([new Uint8Array(attachment.bytes)]))
          return { path: attachment.path, codec: 'bytes', part }
        })
        parts.set('metadata', JSON.stringify({ ...response, attachments }))
        return new Response(parts)
      },
    }), 'llm-ollama: authenticated plugin RPC')
  })
  ctx.inject(['settings'], (settingsCtx) => {
    settingsCtx.effect(
      () => settingsCtx.settings.configure({ auto: false }, ctx.fiber),
      'llm-ollama: settings page policy',
    )
  })
}
