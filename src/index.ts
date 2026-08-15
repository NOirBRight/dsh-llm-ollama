/**
 * Register an {@link OllamaAdapter} for the `ollama-cloud` provider route on
 * `ctx.llm`, with connection facts resolved per request instead of frozen at
 * load: the plugin layers its `cordis.yml` entry config under the optional
 * `llm-ollama` user-settings section (`ctx.settings`) and resolves the API
 * key through the optional credential seam (`ctx.credentials`), so a changed
 * base URL, catalog, or key reaches the very next request without restarting
 * anything, while an in-flight stream keeps the facts it started with. The
 * one registration-captured fact — the retry policy — re-registers the route
 * in place when it changes.
 *
 * The plugin also registers a model discovery handler that interrogates
 * `/api/tags` + `/api/show` for the configuration surface's "fetch available
 * models" action, returning context windows and capability metadata the
 * OpenAI-compatible `/v1/models` listing does not provide.
 * @module dsh-llm-ollama
 */

import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import type {} from '@deepseek-ai/dsh-client-connection'
import { assertUsableApiKey, LlmError, resolveRetryPolicy, RetryPolicySchema } from '@deepseek-ai/dsh-llm'
import type { RetryPolicyConfig } from '@deepseek-ai/dsh-llm'
import { credentialRef } from '@deepseek-ai/dsh-credentials'
import { launchEnvironmentOf } from '@deepseek-ai/dsh-launch-environment'
import { deepEqualJson, installSettingsSection, settingsNamespace } from '@deepseek-ai/dsh-settings'
import { MAX_TIMER_DELAY_MS } from '@deepseek-ai/dsh-timeout'
import {
  DEFAULT_CONTEXT_WINDOW,
  DEFAULT_STREAM_IDLE_TIMEOUT_MS,
  OllamaAdapter,
} from './adapter.ts'
import type { OllamaCatalogModel, OllamaConnectionOptions } from './adapter.ts'
import { PUBLIC_BASE_URL } from './discovery.ts'
import { discoverModels } from './discovery.ts'
import {
  decodeOllamaDiscoveryRequest,
  DEFAULT_API_KEY_ENV,
  OLLAMA_DISCOVER_ENDPOINT,
  OLLAMA_PROVIDER,
  OLLAMA_RPC_CHANNEL,
  OLLAMA_SETTINGS_NAMESPACE,
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
  DEFAULT_API_KEY_ENV,
  OLLAMA_DISCOVER_ENDPOINT,
  OLLAMA_PROVIDER,
  OLLAMA_PUBLIC_BASE_URL,
  OLLAMA_RPC_CHANNEL,
  OLLAMA_SETTINGS_NAMESPACE,
  decodeOllamaCatalogModel,
  decodeOllamaDiscoveryRequest,
  decodeOllamaDiscoveryResult,
  decodeOllamaSettings,
} from './client-contract.ts'
export type {
  OllamaCatalogModelConfig,
  OllamaDiscoveryRequest,
  OllamaDiscoveryResult,
  OllamaSettingsView,
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
  /** Default per-request output cap; omitted sends no `num_predict` (provider default = unlimited). */
  maxTokens?: number
  /** Positive context capacity used when the selected model has no exact value (default 4096). */
  defaultContextWindow?: number
  /** Maximum provider idle time while one stream read is outstanding (default five minutes). */
  streamIdleTimeoutMs?: number
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
  return {
    apiKeyEnv: credentialRef(config.apiKeyEnv ?? DEFAULT_API_KEY_ENV),
    baseURL: config.baseURL ?? PUBLIC_BASE_URL,
    models: resolveModels(config.models),
    defaultContextWindow: config.defaultContextWindow ?? DEFAULT_CONTEXT_WINDOW,
    maxTokens: config.maxTokens,
    streamIdleTimeoutMs,
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
      + ` service (the web Models page writes it), or export ${ref} in the launching environment`,
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

  // The standard discovery RPC intentionally exposes only portable capacities.
  // This private channel preserves Ollama's vision/thinking/tools flags for the
  // package's own card and uses Connection's loopback configuration fence.
  ctx.inject(['connection'], (connectionCtx) => {
    connectionCtx.connection.rpc.handle(
      OLLAMA_RPC_CHANNEL,
      async (endpoint, payload, signal) => {
        if (endpoint !== OLLAMA_DISCOVER_ENDPOINT) {
          return discoveryFailure(`unknown Ollama Cloud endpoint: ${endpoint}`)
        }
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
