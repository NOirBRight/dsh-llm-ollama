/** Browser-safe constants and JSON decoders shared by the Host and client plugin faces. */
/** Settings namespace owned by the Ollama Cloud plugin. */
export declare const OLLAMA_SETTINGS_NAMESPACE = "llm-ollama";
/** Provider route owned by the Ollama Cloud plugin. */
export declare const OLLAMA_PROVIDER = "ollama-cloud";
/** Credential reference used when the settings section names none. */
export declare const DEFAULT_API_KEY_ENV = "OLLAMA_API_KEY";
/** Public Ollama Cloud native API base URL. */
export declare const OLLAMA_PUBLIC_BASE_URL = "https://ollama.com/api";
/** Default context capacity for models without discovered metadata. */
export declare const OLLAMA_DEFAULT_CONTEXT_WINDOW = 262144;
/** Default maximum idle interval while a stream read is outstanding. */
export declare const OLLAMA_DEFAULT_STREAM_IDLE_TIMEOUT_MS = 300000;
/** Private Connection RPC channel used by this package's two runtime faces. */
export declare const OLLAMA_RPC_CHANNEL = "/ollama-cloud";
/** Rich model-discovery endpoint inside {@link OLLAMA_RPC_CHANNEL}. */
export declare const OLLAMA_DISCOVER_ENDPOINT = "models/discover";
/** Atomic settings-save endpoint inside {@link OLLAMA_RPC_CHANNEL}. */
export declare const OLLAMA_SAVE_ENDPOINT = "settings/save";
/** Cloud usage-snapshot endpoint inside {@link OLLAMA_RPC_CHANNEL}. */
export declare const OLLAMA_USAGE_ENDPOINT = "usage/read";
/** One model stored in the plugin's advisory catalog. */
export interface OllamaCatalogModelConfig {
    /** Wire model id accepted by the configured endpoint. */
    id: string;
    /** Selector label; omission uses {@link id}. */
    name?: string;
    /** Optional selector detail for similar model variants. */
    description?: string;
    /** Known combined request and response context capacity. */
    contextWindow?: number;
    /** Per-request output cap for this model. */
    maxTokens?: number;
    /** Whether the model accepts image input. */
    vision?: boolean;
    /** Whether the model supports native thinking; this does not identify accepted efforts. */
    thinking?: boolean;
    /** Chat-picker default when the conversation has not chosen a level. */
    defaultEffort?: string;
    /** Legacy capability flag. Ignored at runtime; still decoded. */
    tools?: boolean;
}
/** Settings fields presented by the package's Web configuration card. */
export interface OllamaSettingsView {
    /** Credential reference resolved by the Host. */
    apiKeyEnv: string;
    /** Native API base URL. */
    baseURL: string;
    /** Advisory model catalog. */
    models: OllamaCatalogModelConfig[];
    /** Optional provider-wide output cap. */
    maxTokens?: number;
    /** Context fallback for models without an exact capacity. */
    defaultContextWindow: number;
    /** Stream idle timeout in milliseconds. */
    streamIdleTimeoutMs: number;
}
/** Draft endpoint and one-shot credential sent to rich model discovery. */
export interface OllamaDiscoveryRequest {
    /** Unsaved native API base URL. */
    baseURL?: string;
    /** Unsaved credential used for this request only. */
    apiKey?: string;
}
/** Rich model-discovery result returned to the package's own client card. */
export interface OllamaDiscoveryResult {
    /** Models in provider order, including native capability flags. */
    models: OllamaCatalogModelConfig[];
}
/** Atomic editable-settings payload sent by the package's browser face. */
export interface OllamaSaveRequest {
    /** API URL currently shown by the editor. */
    baseURL: string;
    /** Complete advisory catalog currently shown by the editor. */
    models: OllamaCatalogModelConfig[];
    /** Settings descriptor revision from which the editor began. */
    expectedRevision: number;
}
/** Accepted settings snapshot returned after one atomic Host mutation. */
export interface OllamaSaveResult {
    /** Resolved settings after the mutation commits. */
    settings: OllamaSettingsView;
    /** New descriptor revision accepted by the Host. */
    revision: number;
}
/** One model's accounted requests inside a usage window. */
export interface OllamaUsageModelCount {
    /** Provider-side model label ("web search" names the search capability). */
    name: string;
    /** Requests accounted to this model in the window. */
    requestCount: number;
}
/** One metered quota window (session or weekly). */
export interface OllamaUsageWindow {
    /** Consumed fraction of the window; 0.891 renders as "89.1%". */
    usage: number;
    /** Per-model request counts in the window, provider order. */
    models: OllamaUsageModelCount[];
}
/** Secret-free cloud usage snapshot read for the configuration card. */
export interface OllamaUsageView {
    /** ISO-8601 time the Host read the snapshot. */
    fetchedAt: string;
    /** Rolling session window, when the endpoint reports one. */
    session?: OllamaUsageWindow;
    /** Rolling weekly window, when the endpoint reports one. */
    weekly?: OllamaUsageWindow;
}
/**
 * Usage answer crossing the plugin RPC: a snapshot, or the word that the
 * endpoint has no usage surface. "Unsupported" is a legitimate answer (a
 * self-hosted Ollama answers 404), not a failure, so it rides the success
 * branch instead of an error code.
 */
export type OllamaUsageReply = {
    status: 'ok';
    usage: OllamaUsageView;
} | {
    status: 'unsupported';
};
/**
 * Narrow one model crossing the settings or plugin-RPC JSON boundary.
 * @param value - untrusted JSON value.
 * @returns the validated model, or undefined when any field is invalid.
 */
export declare function decodeOllamaCatalogModel(value: unknown): OllamaCatalogModelConfig | undefined;
/**
 * Narrow the redacted, schema-resolved settings section before it enters React state.
 * @param value - untrusted settings response value.
 * @returns the validated settings view, or undefined when the response is invalid.
 */
export declare function decodeOllamaSettings(value: unknown): OllamaSettingsView | undefined;
/**
 * Narrow the rich discovery request received by the Host plugin.
 * @param value - untrusted RPC request payload.
 * @returns the validated request, or undefined when the payload is invalid.
 */
export declare function decodeOllamaDiscoveryRequest(value: unknown): OllamaDiscoveryRequest | undefined;
/**
 * Narrow the rich discovery result received by the browser plugin.
 * @param value - untrusted RPC result value.
 * @returns the validated result, or undefined when any model is invalid.
 */
export declare function decodeOllamaDiscoveryResult(value: unknown): OllamaDiscoveryResult | undefined;
/**
 * Narrow one usage snapshot.
 * @param value - untrusted JSON value.
 * @returns the validated snapshot, or undefined when it is malformed.
 */
export declare function decodeOllamaUsageView(value: unknown): OllamaUsageView | undefined;
/**
 * Narrow the usage reply returned by the Host usage endpoint.
 * @param value - untrusted RPC result value.
 * @returns the validated reply, or undefined when it is malformed.
 */
export declare function decodeOllamaUsageReply(value: unknown): OllamaUsageReply | undefined;
/**
 * Narrow one atomic settings-save request crossing the plugin RPC.
 * @param value - untrusted RPC payload.
 * @returns the validated request, or undefined when any field is invalid.
 */
export declare function decodeOllamaSaveRequest(value: unknown): OllamaSaveRequest | undefined;
/**
 * Narrow the accepted settings snapshot returned by the Host save endpoint.
 * @param value - untrusted RPC result value.
 * @returns the validated result, or undefined when it is malformed.
 */
export declare function decodeOllamaSaveResult(value: unknown): OllamaSaveResult | undefined;
//# sourceMappingURL=client-contract.d.ts.map