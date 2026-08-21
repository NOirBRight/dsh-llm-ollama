/**
 * Ollama Cloud chat adapter for the Harness LLM seam. The public adapter and
 * provider route stay Ollama-specific, while the chat wire implementation is
 * delegated to pi-ai's OpenAI Chat Completions support. Ollama-native APIs
 * remain in use for discovery and Web Search/Fetch outside this class.
 *
 * @module dsh-llm-ollama/adapter
 */
import { LlmAdapter } from '@deepseek-ai/dsh-llm';
import type { GenerateOptions, LlmModelInfo, LlmProviderInfo, LlmResolvedModelInfo, ResolvedRetryPolicy, StreamChunk } from '@deepseek-ai/dsh-llm';
import type { CredentialRef } from '@deepseek-ai/dsh-credentials';
import type { AttachmentStore } from '@deepseek-ai/dsh-attachment';
import { discoverModels } from './discovery.ts';
import type { OllamaCatalogModelConfig } from './client-contract.ts';
import type { WireError } from './types.ts';
export { isGptOssModel } from './reasoning.ts';
/** One optional model entry advertised by the adapter. */
export type OllamaCatalogModel = OllamaCatalogModelConfig;
/**
 * Validated connection facts for one operation. The plugin's
 * resolveAdapterOptions is the one explicit resolve step producing this
 * shape; the adapter trusts it and re-reads it per operation.
 */
export interface OllamaConnectionOptions {
    /** Native Ollama endpoint base; discovery and Web providers use it as-is. */
    baseURL: string;
    /** Credential reference of this same resolution, resolved per request. */
    apiKeyEnv: CredentialRef;
    /** Models exposed to discovery consumers and accepted for chat requests. */
    models: readonly OllamaCatalogModel[];
    /** Positive context capacity used when the selected model has no exact value. */
    defaultContextWindow: number;
    /** Default per-request output cap; explicit request values win. */
    maxTokens: number | undefined;
    /** Maximum provider idle time while one stream read is outstanding. */
    streamIdleTimeoutMs: number;
    /** Per-attempt budget for Ollama Cloud Web Search/Fetch requests. */
    webRequestTimeoutMs: number;
    /** Provider-owned model-request retry policy, already resolved. */
    retryPolicy: ResolvedRetryPolicy;
}
/** Constructor options for OllamaAdapter: the operation-local resolution hooks the plugin owns. */
export interface OllamaAdapterOptions {
    /** Current validated connection facts; called once per operation. */
    options: () => OllamaConnectionOptions;
    /**
     * Resolve the bearer token for the connection facts of one request. Throws
     * LlmError MISSING_CREDENTIAL when no key is available anywhere.
     */
    resolveApiKey: (connection: OllamaConnectionOptions) => Promise<string>;
    /** Resolve the optional durable attachment service at request time. */
    resolveAttachments?: () => AttachmentStore | undefined;
}
/** Default maximum idle interval while an adapter stream read is outstanding. */
export declare const DEFAULT_STREAM_IDLE_TIMEOUT_MS = 300000;
/** Default combined request/response context capacity. */
export declare const DEFAULT_CONTEXT_WINDOW = 262144;
/**
 * Map an HTTP status to a stable LlmError code for source-compatible callers.
 * @param status - status of a non-2xx provider response.
 * @param error - parsed provider error body, when available.
 * @returns the normalized harness error code.
 */
export declare function httpErrorCode(status: number, error?: WireError): string;
/**
 * Classify documented transient Ollama failures that can arrive without an HTTP status.
 * @param chunk - One delegated DSH stream chunk.
 * @returns The original chunk, or a copy with a retryable server code.
 */
export declare function classifyOllamaTransientError(chunk: StreamChunk): StreamChunk;
/** The Ollama Cloud chat adapter backed by pi-ai OpenAI Chat Completions. */
export declare class OllamaAdapter extends LlmAdapter {
    private readonly config;
    private readonly auth;
    private snapshot;
    constructor(config: OllamaAdapterOptions);
    /** Rebuild the delegated adapter only when the plugin publishes a new options snapshot. */
    private current;
    providerInfo(provider: string): LlmProviderInfo;
    providerRetryPolicy(provider: string): ResolvedRetryPolicy | undefined;
    listModels(provider: string): Promise<readonly LlmModelInfo[]>;
    resolveModel(provider: string, model: string, signal?: AbortSignal): Promise<LlmResolvedModelInfo>;
    stream(options: GenerateOptions): AsyncIterable<StreamChunk>;
}
/** Re-export the discovery function for the plugin entry. */
export { discoverModels };
//# sourceMappingURL=adapter.d.ts.map