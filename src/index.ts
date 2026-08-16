/**
 * Register the `ollama-cloud` route with chat delegated to pi-ai OpenAI Chat
 * Completions, while keeping Ollama-native discovery and Web Search/Fetch as
 * independent capabilities. Connection facts resolve per operation from the
 * optional `llm-ollama` settings section and the credential seam, so saved
 * endpoint, catalog, and key changes reach the next operation.
 *
 * A loopback Connection channel serves `/api/tags` plus `/api/show` discovery
 * and atomically saves the card's native base URL and model catalog.
 * @module dsh-llm-ollama
 */

import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import type {} from '@deepseek-ai/dsh-client-connection'
import type {} from '@deepseek-ai/dsh-web'
import { assertUsableApiKey, LlmError, resolveRetryPolicy, RetryPolicySchema } from '@deepseek-ai/dsh-llm'
import type { RetryPolicyConfig } from '@deepseek-ai/dsh-llm'
import { credentialRef } from '@deepseek-ai/dsh-credentials'
import { launchEnvironmentOf } from '@deepseek-ai/dsh-launch-environment'
import { deepEqualJson, installSettingsSection, settingsNamespace } from '@deepseek-ai/dsh-settings'
import type { SettingsPathOp } from '@deepseek-ai/dsh-settings'
import { MAX_TIMER_DELAY_MS } from '@deepseek-ai/dsh-timeout'
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
  decodeOllamaDiscoveryRequest,
  decodeOllamaSaveRequest,
  decodeOllamaSettings,
  DEFAULT_API_KEY_ENV,
  OLLAMA_DISCOVER_ENDPOINT,
  OLLAMA_PROVIDER,
  OLLAMA_RPC_CHANNEL,
  OLLAMA_SAVE_ENDPOINT,
  OLLAMA_SETTINGS_NAMESPACE,
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
  OLLAMA_DISCOVER_ENDPOINT,
  OLLAMA_PROVIDER,
  OLLAMA_PUBLIC_BASE_URL,
  OLLAMA_RPC_CHANNEL,
  OLLAMA_SAVE_ENDPOINT,
  OLLAMA_SETTINGS_NAMESPACE,
  OLLAMA_USAGE_ENDPOINT,
  decodeOllamaCatalogModel,
  decodeOllamaDiscoveryRequest,
  decodeOllamaDiscoveryResult,
  decodeOllamaSaveRequest,
  decodeOllamaSaveResult,
  decodeOllamaSettings,
  decodeOllamaUsageReply,
} from './client-contract.ts'
export type {
  OllamaCatalogModelConfig,
  OllamaDiscoveryRequest,
  OllamaDiscoveryResult,
  OllamaSaveRequest,
  OllamaSaveResult,
  OllamaSettingsView,
  OllamaUsageModelCount,
  OllamaUsageReply,
  OllamaUsageView,
  OllamaUsageWindow,
} from './client-contract.ts'
export type * from './types.ts'

export const name = 'llm-ollama'
export const inject = ['llm']

const NS = settingsNamespace(OLLAMA_SETTINGS_NAMESPACE)

/**
 * Plugin config, validated by the same-named schemastery schema and doubling
 * as the `llm-ollama` settings-section shape. Every field is optional in yml:
 * a missing API key resolves through {@link Config.apiKeyEnv} at each request
 * (a request without any key fails with `MISSING_CREDENTIAL`, not at plugin
 * load), omitted models advertise none, and omitted capacities fall back to
 * the route defaults.
 */
export interface Config {
  /** Credential reference (environment-variable name) resolved per request; defaults to `OLLAMA_API_KEY`. */
  apiKeyEnv?: string
  /** Endpoint base; defaults to the public Ollama Cloud API. */
  baseURL?: string
  /** Advisory models shown by discovery consumers; defaults to none. */
  models?: OllamaCatalogModel[]
  /** Default per-request output cap; omitted leaves the request cap to the model profile. */
  maxTokens?: number
  /** Positive context capacity used when the selected model has no exact value (default 262144). */
  defaultContextWindow?: number
  /** Maximum provider idle time while one stream read is outstanding (default five minutes). */
  streamIdleTimeoutMs?: number
  /** Per-attempt budget for Ollama Cloud Web Search/Fetch requests (default 15 seconds). */
  webRequestTimeoutMs?: number
  /** Provider-owned model-request retry policy; omission uses normal defaults. */
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
  tools: z.boolean(),
})

export const Config: z<Config> = z.object({
  apiKeyEnv: z.string().role('credential-ref').default(DEFAULT_API_KEY_ENV),
  baseURL: z.string().default(PUBLIC_BASE_URL),
  models: z.array(catalogModel).default([]),
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
      ...model.tools === undefined ? {} : { tools: model.tools },
    }
  })
}

/**
 * The one explicit resolve step from raw config to validated connection facts.
 * @param config - raw plugin config or resolved settings snapshot.
 * @returns validated connection facts plus the credential reference.
 */
export function resolveAdapterOptions(config: Config): ResolvedOllamaOptions {
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
    retryPolicy: resolveRetryPolicy(config.retryPolicy, 'llm-ollama: retryPolicy'),
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

function settingsFailure(message: string) {
  return {
    ok: false as const,
    error: {
      code: 'internal' as const,
      message,
      details: {},
    },
  }
}

/** Fold one usage-read failure: "unsupported" is a legitimate answer, the rest are errors. */
function usageFailure(error: unknown) {
  if (error instanceof LlmError && error.code === OLLAMA_USAGE_UNSUPPORTED) {
    return { ok: true as const, value: { status: 'unsupported' as const } }
  }
  const message = error instanceof LlmError && error.message.length > 0
    ? error.message
    : 'Ollama Cloud usage read failed'
  return settingsFailure(message)
}

export function apply(ctx: Context, config: Config): void {
  let current: () => Config = () => config
  let lastRaw: Config | undefined
  let lastGood: ResolvedOllamaOptions | undefined
  const options = (): ResolvedOllamaOptions => {
    const raw = current()
    if (raw === lastRaw && lastGood !== undefined) return lastGood
    try {
      const next = resolveAdapterOptions(raw)
      lastRaw = raw
      lastGood = next
      return next
    } catch (error) {
      if (lastGood === undefined) throw error
      lastRaw = raw
      ctx.logger.error('llm-ollama: keeping the last good configuration after an invalid settings section')
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
  const registration = ctx.llm.registerAdapter([OLLAMA_PROVIDER], adapter)
  let registeredPolicy = options().retryPolicy
  const ensureRegistrationFacts = (): void => {
    const policy = options().retryPolicy
    if (deepEqualJson(policy, registeredPolicy)) return
    registration.replace([OLLAMA_PROVIDER])
    registeredPolicy = policy
  }

  // Register model discovery for the configuration surface's "fetch models" action.
  const storedApiKey = async (): Promise<string | undefined> => {
    const connection = options()
    const ref = connection.apiKeyEnv
    const credentials = ctx.get('credentials')
    if (credentials !== undefined) {
      const hit = await credentials.resolve(ref)
      return hit?.value
    }
    return launchEnvironmentOf(ctx).get(ref)?.value
  }
  ctx.llm.registerModelDiscovery(NS, request => discoverModels(request, storedApiKey))

  // Offer Ollama's web search/fetch to the web seam when the deployment mounts
  // it. Selection stays deployment policy: the base bundle pins the DeepSeek
  // provider, and a profile switches by pinning `searchProvider`/`fetchProvider`
  // to `ollama-cloud` in its cordis patch.
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

  // The package channel preserves Ollama's provider-specific discovery flags
  // and keeps multi-field editor saves atomic behind Connection's loopback fence.
  ctx.inject(['connection'], (connectionCtx) => {
    connectionCtx.connection.rpc.handle(
      OLLAMA_RPC_CHANNEL,
      async (endpoint, payload, signal) => {
        if (endpoint === OLLAMA_DISCOVER_ENDPOINT) {
          const request = decodeOllamaDiscoveryRequest(payload)
          if (request === undefined) return discoveryFailure('invalid Ollama Cloud discovery request')
          try {
            const models = await discoverModels({ ...request, signal }, storedApiKey)
            return { ok: true as const, value: { models } }
          } catch (error: unknown) {
            const message = error instanceof LlmError
              ? error.message
              : 'Ollama Cloud model discovery failed'
            return discoveryFailure(message, request.baseURL)
          }
        }
        if (endpoint === OLLAMA_SAVE_ENDPOINT) {
          const request = decodeOllamaSaveRequest(payload)
          if (request === undefined) return settingsFailure('invalid Ollama Cloud settings request')
          const settings = ctx.get('settings')
          if (settings === undefined) return settingsFailure('Ollama Cloud settings are unavailable')
          try {
            const before = settings.describe().find(descriptor => descriptor.ns === NS)
            if (before === undefined) return settingsFailure('Ollama Cloud settings are unavailable')
            const current = decodeOllamaSettings(before.value)
            if (current === undefined) return settingsFailure('Ollama Cloud settings are invalid')
            const ops: SettingsPathOp[] = []
            if (!deepEqualJson(current.baseURL, request.baseURL)) {
              ops.push({ op: 'set', path: ['baseURL'], value: request.baseURL })
            }
            if (!deepEqualJson(current.models, request.models)) {
              ops.push({ op: 'set', path: ['models'], value: request.models })
            }
            if (ops.length > 0) await settings.mutate(NS, ops, request.expectedRevision)
            const accepted = settings.describe().find(descriptor => descriptor.ns === NS)
            const acceptedSettings = decodeOllamaSettings(accepted?.value)
            if (accepted === undefined || acceptedSettings === undefined) {
              return settingsFailure('Ollama Cloud settings could not be reloaded')
            }
            return { ok: true as const, value: { settings: acceptedSettings, revision: accepted.revision } }
          } catch (error: unknown) {
            const message = error instanceof Error && error.message.length > 0
              ? error.message
              : 'Ollama Cloud settings save failed'
            return settingsFailure(message)
          }
        }
        if (endpoint === OLLAMA_USAGE_ENDPOINT) {
          const request = decodeOllamaDiscoveryRequest(payload)
          if (request === undefined) return settingsFailure('invalid Ollama Cloud usage request')
          try {
            const usage = await readOllamaUsage({ ...request, signal }, storedApiKey)
            return { ok: true as const, value: { status: 'ok' as const, usage } }
          } catch (error: unknown) {
            return usageFailure(error)
          }
        }
        return settingsFailure(`unknown Ollama Cloud endpoint: ${endpoint}`)
      },
      { authority: 'loopback' },
    )
  })

  installSettingsSection(ctx, NS, Config, config, {
    setSource: (source) => {
      current = source
    },
    onChange: ensureRegistrationFacts,
  })
}
