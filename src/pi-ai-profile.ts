/**
 * Translate the plugin's Ollama-native connection facts into the pi-ai profile
 * used for OpenAI Chat Completions. The user-facing base URL remains the
 * native /api endpoint because discovery and Web capabilities use it; only
 * this profile switches chat to /v1.
 *
 * @module dsh-llm-ollama/pi-ai-profile
 */

import { createProvider } from '@earendil-works/pi-ai'
import { openAICompletionsApi } from '@earendil-works/pi-ai/api/openai-completions.lazy'
import type { Api, AssistantMessageEventStream, Context as PiContext, Model, Provider, StreamOptions } from '@earendil-works/pi-ai'
import type { ResolvedPiAiProviderProfile } from '@deepseek-ai/dsh-llm-pi-ai'
import {
  OLLAMA_PROVIDER,
  parseOllamaPickerId,
} from './client-contract.ts'
import type { OllamaCatalogModel, OllamaConnectionOptions } from './adapter.ts'
import { ollamaThinkingLevelMap } from './reasoning.ts'

/** Safe output capability used when Ollama does not disclose one. */
export const OLLAMA_DEFAULT_MODEL_MAX_TOKENS = 32_768

/** Mirrors the RC1 official 20MiB request image bound; rc8 hosts ignore this extra field at runtime. */
const DEFAULT_MAX_REQUEST_IMAGE_BYTES = 20 * 1024 * 1024

const NO_COST = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }

/** Map the user-facing native Ollama base URL to the OpenAI-compatible chat base. */
export function openAICompatibleBaseURL(baseURL: string): string {
  const normalized = baseURL.replace(/\/+$/, '')
  if (normalized.endsWith('/v1')) return normalized
  if (normalized.endsWith('/api')) return normalized.slice(0, -4) + '/v1'
  return normalized + '/v1'
}

/** Build one pi-ai model descriptor for OpenAI Chat Completions. */
function toPiAiModel(
  model: OllamaCatalogModel,
  connection: OllamaConnectionOptions,
  baseUrl: string,
): Model<'openai-completions'> {
  const parsed = parseOllamaPickerId(model.id)
  const levels = ollamaThinkingLevelMap(model)
  return {
    id: model.id,
    name: model.name ?? model.id,
    api: 'openai-completions',
    provider: OLLAMA_PROVIDER,
    baseUrl,
    reasoning: model.thinking === true,
    ...levels === undefined ? {} : { thinkingLevelMap: levels },
    input: model.vision === true ? ['text', 'image'] : ['text'],
    cost: NO_COST,
    contextWindow: model.contextWindow ?? parsed.contextTokens ?? connection.defaultContextWindow,
    maxTokens: model.maxTokens ?? OLLAMA_DEFAULT_MODEL_MAX_TOKENS,
    compat: {
      supportsStore: false,
      supportsDeveloperRole: false,
      supportsReasoningEffort: true,
      supportsUsageInStreaming: true,
      maxTokensField: 'max_tokens',
      thinkingFormat: 'openai',
    },
  }
}

function withOllamaWire(
  streamFn: (model: Model<Api>, context: PiContext, options?: StreamOptions) => AssistantMessageEventStream,
): (model: Model<Api>, context: PiContext, options?: StreamOptions) => AssistantMessageEventStream {
  return (model, context, options) => {
    const parsed = parseOllamaPickerId(model.id)
    const next = parsed.wireId === model.id ? model : { ...model, id: parsed.wireId }
    return streamFn(next, context, options)
  }
}

function ollamaCompletionsApi() {
  const base = openAICompletionsApi()
  return {
    stream: withOllamaWire(base.stream),
    streamSimple: withOllamaWire(base.streamSimple),
  }
}

function ollamaAuth(): Provider['auth'] {
  return {
    apiKey: {
      name: 'Ollama Cloud API key',
      resolve: ({ credential }) => Promise.resolve({
        auth: credential?.key === undefined ? {} : { apiKey: credential.key },
        source: 'Ollama Cloud',
      }),
    },
  }
}

/** Resolve the complete pi-ai profile for one Ollama options snapshot. */
export function createOllamaPiAiProfile(
  connection: OllamaConnectionOptions,
): ResolvedPiAiProviderProfile {
  const baseURL = openAICompatibleBaseURL(connection.baseURL)
  const models = connection.models.map(model => toPiAiModel(model, connection, baseURL))
  const configuredMaxTokens = new Map<string, number>()
  const piProvider = createProvider({
    id: OLLAMA_PROVIDER,
    name: 'Ollama Cloud',
    baseUrl: baseURL,
    auth: ollamaAuth(),
    models,
    api: ollamaCompletionsApi(),
  })
  const profile = {
    provider: OLLAMA_PROVIDER,
    displayName: 'Ollama Cloud',
    apiKeyEnv: connection.apiKeyEnv,
    baseURL,
    defaultContextWindow: connection.defaultContextWindow,
    defaultMaxTokens: OLLAMA_DEFAULT_MODEL_MAX_TOKENS,
    defaultInput: ['text' as const],
    streamIdleTimeoutMs: connection.streamIdleTimeoutMs,
    maxRequestImageBytes: DEFAULT_MAX_REQUEST_IMAGE_BYTES,
    /** Required by the rc.2 resolved-profile contract for deterministic request images. */
    requestImagePixelBudget: 2048 * 2048,
    requestImageMaxBytes: 1024 * 1024,
    retryPolicy: connection.retryPolicy,
    piProvider,
    configuredMaxTokens,
  }
  return profile
}
