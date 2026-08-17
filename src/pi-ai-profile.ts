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
import type { Model, Provider } from '@earendil-works/pi-ai'
import type { ResolvedPiAiProviderProfile } from '@deepseek-ai/dsh-llm-pi-ai'
import { OLLAMA_PROVIDER } from './client-contract.ts'
import type { OllamaCatalogModel, OllamaConnectionOptions } from './adapter.ts'
import { ollamaThinkingLevelMap } from './reasoning.ts'

/** Safe output capability used when Ollama does not disclose one. */
export const OLLAMA_DEFAULT_MODEL_MAX_TOKENS = 32_768

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
    contextWindow: model.contextWindow ?? connection.defaultContextWindow,
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

/** Harness-authenticated provider auth; the actual key is supplied per request by PiAiAdapter. */
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
    api: openAICompletionsApi(),
  })
  return {
    provider: OLLAMA_PROVIDER,
    displayName: 'Ollama Cloud',
    apiKeyEnv: connection.apiKeyEnv,
    baseURL,
    defaultContextWindow: connection.defaultContextWindow,
    defaultMaxTokens: OLLAMA_DEFAULT_MODEL_MAX_TOKENS,
    defaultInput: ['text'],
    streamIdleTimeoutMs: connection.streamIdleTimeoutMs,
    retryPolicy: connection.retryPolicy,
    piProvider,
    configuredMaxTokens,
  }
}
