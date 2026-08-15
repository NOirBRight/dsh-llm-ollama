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
import type { Context } from '@deepseek-ai/cordis';
import z from '@deepseek-ai/schemastery';
import type { RetryPolicyConfig } from '@deepseek-ai/dsh-llm';
import type { OllamaCatalogModel, OllamaConnectionOptions } from './adapter.ts';
export { DEFAULT_CONTEXT_WINDOW, DEFAULT_STREAM_IDLE_TIMEOUT_MS, OllamaAdapter, } from './adapter.ts';
export type { OllamaAdapterOptions, OllamaCatalogModel, OllamaConnectionOptions } from './adapter.ts';
export { PUBLIC_BASE_URL, discoverModels } from './discovery.ts';
export { extractContextWindow, extractCapabilities } from './discovery.ts';
export type { OllamaDiscoveredModel, OllamaModelCapabilities } from './discovery.ts';
export { DEFAULT_WEB_REQUEST_TIMEOUT_MS, OLLAMA_WEB_PROVIDER_ID, OllamaWebFetchProvider, OllamaWebSearchProvider, } from './web.ts';
export type { OllamaWebProviderOptions } from './web.ts';
export { DEFAULT_API_KEY_ENV, OLLAMA_DISCOVER_ENDPOINT, OLLAMA_PROVIDER, OLLAMA_PUBLIC_BASE_URL, OLLAMA_RPC_CHANNEL, OLLAMA_SAVE_ENDPOINT, OLLAMA_SETTINGS_NAMESPACE, decodeOllamaCatalogModel, decodeOllamaDiscoveryRequest, decodeOllamaDiscoveryResult, decodeOllamaSaveRequest, decodeOllamaSaveResult, decodeOllamaSettings, } from './client-contract.ts';
export type { OllamaCatalogModelConfig, OllamaDiscoveryRequest, OllamaDiscoveryResult, OllamaSaveRequest, OllamaSaveResult, OllamaSettingsView, } from './client-contract.ts';
export type * from './types.ts';
export declare const name = "llm-ollama";
export declare const inject: string[];
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
    apiKeyEnv?: string;
    /** Endpoint base; defaults to the public Ollama Cloud API. */
    baseURL?: string;
    /** Advisory models shown by discovery consumers; defaults to none. */
    models?: OllamaCatalogModel[];
    /** Default per-request output cap; omitted leaves the request cap to the model profile. */
    maxTokens?: number;
    /** Positive context capacity used when the selected model has no exact value (default 262144). */
    defaultContextWindow?: number;
    /** Maximum provider idle time while one stream read is outstanding (default five minutes). */
    streamIdleTimeoutMs?: number;
    /** Per-attempt budget for Ollama Cloud Web Search/Fetch requests (default 15 seconds). */
    webRequestTimeoutMs?: number;
    /** Provider-owned model-request retry policy; omission uses normal defaults. */
    retryPolicy?: RetryPolicyConfig;
}
export declare const Config: z<Config>;
/** One resolution's complete request facts. */
export type ResolvedOllamaOptions = OllamaConnectionOptions;
/**
 * The one explicit resolve step from raw config to validated connection facts.
 * @param config - raw plugin config or resolved settings snapshot.
 * @returns validated connection facts plus the credential reference.
 */
export declare function resolveAdapterOptions(config: Config): ResolvedOllamaOptions;
export declare function apply(ctx: Context, config: Config): void;
//# sourceMappingURL=index.d.ts.map