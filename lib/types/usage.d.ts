/**
 * Reading the account's Ollama Cloud quota for the configuration card.
 *
 * Ollama exposes the settings page's "Cloud usage" panel as
 * `GET <base>/usage` (the native API base already ends in `/api`). The
 * reply carries the session and weekly windows as consumed fractions plus
 * per-model request counts; nothing secret. The credential travels only on
 * this Host-to-Ollama hop — the browser receives the parsed snapshot.
 *
 * A self-hosted endpoint answers 404, which the card renders as "unsupported"
 * rather than as a failure: usage is advisory information, never a blocker.
 *
 * @module dsh-llm-ollama/usage
 */
import type { OllamaUsageView } from './client-contract.ts';
/** Per-read budget for one usage request. */
export declare const DEFAULT_USAGE_REQUEST_TIMEOUT_MS = 15000;
/** Error code for an endpoint without a usage surface (e.g. self-hosted). */
export declare const OLLAMA_USAGE_UNSUPPORTED = "OLLAMA_USAGE_UNSUPPORTED";
/** Error code for a failed or unreadable usage read. */
export declare const OLLAMA_USAGE_FAILED = "OLLAMA_USAGE_FAILED";
/** One usage read: draft endpoint and one-shot credential, like discovery. */
export interface OllamaUsageRequest {
    /** Unsaved native API base URL; defaults to the stored settings value's caller. */
    baseURL?: string;
    /** Unsaved credential used for this request only. */
    apiKey?: string;
    /** Caller cancellation. */
    signal?: AbortSignal;
}
/**
 * Convert the provider reply into the secret-free snapshot the card renders.
 * @param value - opaque JSON returned by the usage endpoint.
 * @param url - endpoint read, for error messages.
 * @returns session and weekly windows with per-model request counts.
 */
export declare function parseOllamaUsage(value: unknown, url: string): OllamaUsageView;
/**
 * Read the account's current cloud usage without issuing a model request.
 * The draft's one-shot key wins; otherwise the route's stored credential is
 * asked for, mirroring model discovery. Self-hosted endpoints typically
 * answer 404, surfaced as {@link OLLAMA_USAGE_UNSUPPORTED}.
 * @param request - the endpoint and one-shot credential to use.
 * @param storedApiKey - the credential the named route already stored, asked
 *   for only when the draft carries none.
 * @returns the parsed snapshot, safe to forward to the browser.
 * @throws LlmError when the endpoint refuses, fails, or answers malformed JSON.
 */
export declare function readOllamaUsage(request: OllamaUsageRequest, storedApiKey?: () => Promise<string | undefined>): Promise<OllamaUsageView>;
//# sourceMappingURL=usage.d.ts.map