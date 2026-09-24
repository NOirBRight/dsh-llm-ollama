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
import type { Context, Volatile } from '@deepseek-ai/cordis';
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
export { DEFAULT_USAGE_REQUEST_TIMEOUT_MS, OLLAMA_USAGE_FAILED, OLLAMA_USAGE_UNSUPPORTED, parseOllamaUsage, readOllamaUsage, } from './usage.ts';
export type { OllamaUsageRequest } from './usage.ts';
export { DEFAULT_API_KEY_ENV, OLLAMA_CREDENTIAL_SET_ENDPOINT, OLLAMA_CREDENTIAL_STATUS_ENDPOINT, OLLAMA_DISCOVER_ENDPOINT, OLLAMA_PROVIDER, OLLAMA_PUBLIC_BASE_URL, OLLAMA_RPC_METHOD, OLLAMA_SETTINGS_NAMESPACE, OLLAMA_SETTINGS_VALIDATE_ENDPOINT, OLLAMA_USAGE_ENDPOINT, decodeOllamaCatalogModel, decodeOllamaCredentialSetRequest, decodeOllamaCredentialStatus, decodeOllamaDiscoveryRequest, decodeOllamaDiscoveryResult, decodeOllamaSettings, decodeOllamaSettingsValidationRequest, decodeOllamaUsageReply, } from './client-contract.ts';
export type { OllamaCatalogModelConfig, OllamaCredentialSetRequest, OllamaCredentialStatus, OllamaDiscoveryRequest, OllamaDiscoveryResult, OllamaSaveResult, OllamaSettingsValidationRequest, OllamaSettingsView, OllamaUsageModelCount, OllamaUsageReply, OllamaUsageView, OllamaUsageWindow, } from './client-contract.ts';
export type * from './types.ts';
export declare const name = "llm-ollama";
export declare const inject: string[];
/**
 * Plugin config. Volatile fields are the fields the provider card edits live.
 */
export interface Config {
    /** Credential reference (environment-variable name); defaults to `OLLAMA_API_KEY`. */
    apiKeyEnv: string;
    /** Endpoint base; defaults to the public Ollama Cloud API. */
    baseURL: Volatile<string>;
    /** Advisory models shown by discovery consumers; defaults to none. */
    models: Volatile<OllamaCatalogModel[]>;
    /** Default per-request output cap; omitted leaves the request cap to the model profile. */
    maxTokens?: number;
    /** Positive context capacity used when the selected model has no exact value (default 262144). */
    defaultContextWindow: number;
    /** Maximum provider idle time while one stream read is outstanding (default five minutes). */
    streamIdleTimeoutMs: number;
    /** Per-attempt budget for Ollama Cloud Web Search/Fetch requests (default 15 seconds). */
    webRequestTimeoutMs: number;
    /** Provider-owned model-request retry policy; omission uses normal defaults. */
    retryPolicy?: RetryPolicyConfig;
}
interface ConfigValues {
    apiKeyEnv?: string;
    baseURL?: string;
    models?: readonly OllamaCatalogModel[];
    maxTokens?: number;
    defaultContextWindow?: number;
    streamIdleTimeoutMs?: number;
    webRequestTimeoutMs?: number;
    retryPolicy?: RetryPolicyConfig;
}
export declare const Config: z<Schemastery.ObjectS<NoInfer<{
    apiKeyEnv: z<string, string, "defined">;
    baseURL: z<string, string, "volatile-defined">;
    models: z<NoInfer<import("./client-contract.ts").OllamaCatalogModelConfig[]>, NoInfer<import("./client-contract.ts").OllamaCatalogModelConfig[]>, "volatile-defined">;
    maxTokens: z<number, number, "plain">;
    defaultContextWindow: z<number, number, "defined">;
    streamIdleTimeoutMs: z<number, number, "defined">;
    webRequestTimeoutMs: z<number, number, "defined">;
    retryPolicy: z<RetryPolicyConfig>;
}>>, Schemastery.ObjectT<NoInfer<{
    apiKeyEnv: z<string, string, "defined">;
    baseURL: z<string, string, "volatile-defined">;
    models: z<NoInfer<import("./client-contract.ts").OllamaCatalogModelConfig[]>, NoInfer<import("./client-contract.ts").OllamaCatalogModelConfig[]>, "volatile-defined">;
    maxTokens: z<number, number, "plain">;
    defaultContextWindow: z<number, number, "defined">;
    streamIdleTimeoutMs: z<number, number, "defined">;
    webRequestTimeoutMs: z<number, number, "defined">;
    retryPolicy: z<RetryPolicyConfig>;
}>>, "plain">;
/** One resolution's complete request facts. */
export type ResolvedOllamaOptions = OllamaConnectionOptions;
/**
 * The one explicit resolve step from raw config to validated connection facts.
 * @param config - raw plugin config or resolved settings snapshot.
 * @returns validated connection facts plus the credential reference.
 */
export declare function resolveAdapterOptions(config: ConfigValues): ResolvedOllamaOptions;
export declare function apply(ctx: Context, config: Config): void;
//# sourceMappingURL=index.d.ts.map