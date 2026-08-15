/**
 * `OllamaAdapter`: fetch + NDJSON against an Ollama Cloud `/api/chat` endpoint,
 * emitting harness `StreamChunk`s. The adapter is transport-only: connection
 * facts arrive through a thunk resolved once per operation and the bearer
 * token through a per-request resolver, so the registering plugin owns
 * validation, layering, and credential policy.
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
/** One optional model entry advertised by the adapter. */
export type OllamaCatalogModel = OllamaCatalogModelConfig;
/**
 * Validated connection facts for one operation. The plugin's
 * `resolveAdapterOptions` is the one explicit resolve step producing this
 * shape; the adapter trusts it and re-reads it per operation.
 */
export interface OllamaConnectionOptions {
    /** Endpoint base; `/chat` is appended. */
    baseURL: string;
    /** Credential reference of this same resolution, resolved per request. */
    apiKeyEnv: CredentialRef;
    /** Advisory models exposed to discovery consumers; requests remain unrestricted. */
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
/** Constructor options for {@link OllamaAdapter}: the operation-local resolution hooks the plugin owns. */
export interface OllamaAdapterOptions {
    /** Current validated connection facts; called once per operation. */
    options: () => OllamaConnectionOptions;
    /**
     * Resolve the bearer token for the connection facts of one request. Throws
     * `LlmError` `MISSING_CREDENTIAL` when no key is available anywhere.
     */
    resolveApiKey: (connection: OllamaConnectionOptions) => Promise<string>;
    /** Resolve the optional durable attachment service at request time. */
    resolveAttachments?: () => AttachmentStore | undefined;
}
/** Default maximum idle interval while an adapter stream read is outstanding. */
export declare const DEFAULT_STREAM_IDLE_TIMEOUT_MS = 300000;
/** Default combined request/response context capacity. */
export declare const DEFAULT_CONTEXT_WINDOW = 4096;
/**
 * Test whether Ollama documents the model family as low/medium/high-only.
 * @param model - Ollama wire model id.
 * @returns true for GPT-OSS ids, including registry-prefixed ids.
 */
export declare function isGptOssModel(model: string): boolean;
/**
 * Map an HTTP status to a stable LlmError code.
 * @param status - status of a non-2xx provider response.
 * @param error - parsed provider error body, when available.
 * @returns the normalized harness error code.
 */
export declare function httpErrorCode(status: number, error?: WireError): string;
/**
 * The Ollama Cloud native chat adapter. One instance serves every model name
 * it was registered under (the harness model name IS the wire model name).
 *
 * One stable signal reaches both initial fetch and body reads. Caller aborts
 * map to `ABORTED`; the configured per-read idle watchdog maps to `TIMEOUT`.
 */
export declare class OllamaAdapter extends LlmAdapter {
    private readonly config;
    constructor(config: OllamaAdapterOptions);
    providerInfo(provider: string): LlmProviderInfo;
    providerRetryPolicy(_provider: string): ResolvedRetryPolicy;
    listModels(provider: string): Promise<readonly LlmModelInfo[]>;
    resolveModel(provider: string, model: string, _signal?: AbortSignal): Promise<LlmResolvedModelInfo>;
    stream(options: GenerateOptions): AsyncIterable<StreamChunk>;
    private request;
}
/** Re-export the discovery function for the plugin entry. */
export { discoverModels };
//# sourceMappingURL=adapter.d.ts.map