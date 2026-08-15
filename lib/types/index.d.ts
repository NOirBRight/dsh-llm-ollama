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
 * The plugin also registers a loopback Connection channel for model discovery
 * through `/api/tags` + `/api/show` and for atomically saving the card's base
 * URL and model catalog as one revision-fenced settings mutation.
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
export { OLLAMA_WEB_PROVIDER_ID, OllamaWebFetchProvider, OllamaWebSearchProvider } from './web.ts';
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
    /** Default per-request output cap; omitted sends no `num_predict` (provider default = unlimited). */
    maxTokens?: number;
    /** Positive context capacity used when the selected model has no exact value (default 4096). */
    defaultContextWindow?: number;
    /** Maximum provider idle time while one stream read is outstanding (default five minutes). */
    streamIdleTimeoutMs?: number;
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