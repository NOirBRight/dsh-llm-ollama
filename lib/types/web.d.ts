/**
 * Ollama Cloud web capability providers: `/api/web_search` and
 * `/api/web_fetch` behind the `ctx.web` seam. Both reuse the LLM route's
 * credential reference and base URL, resolved per operation so a settings
 * change reaches the very next call. Redirects fail closed because every
 * request carries the credential (`redirect: 'error'`, matching the other
 * credentialed web providers).
 * @module dsh-llm-ollama/web
 */
import type { WebFetchProvider, WebFetchRequest, WebFetchResult, WebSearchProvider, WebSearchRequest, WebSearchResult } from '@deepseek-ai/dsh-web';
/** Stable id both providers register under (one backend serves both capabilities). */
export declare const OLLAMA_WEB_PROVIDER_ID = "ollama-cloud";
/** Per-operation facts shared by both web providers. */
export interface OllamaWebProviderOptions {
    /** Current endpoint base (`/web_search` or `/web_fetch` is appended). */
    readonly baseURL: () => string;
    /** Resolve the current API key, or undefined when none is stored. */
    readonly resolveApiKey: () => Promise<string | undefined>;
}
/** The Ollama Cloud search provider; HTTP redirects fail as `WEB_PROVIDER_ERROR`. */
export declare class OllamaWebSearchProvider implements WebSearchProvider {
    private readonly options;
    readonly id = "ollama-cloud";
    constructor(options: OllamaWebProviderOptions);
    available(): boolean;
    search(request: WebSearchRequest, signal?: AbortSignal): Promise<WebSearchResult>;
}
/** The Ollama Cloud fetch provider; HTTP redirects fail as `WEB_PROVIDER_ERROR`. */
export declare class OllamaWebFetchProvider implements WebFetchProvider {
    private readonly options;
    readonly id = "ollama-cloud";
    constructor(options: OllamaWebProviderOptions);
    available(): boolean;
    fetch(request: WebFetchRequest, signal?: AbortSignal): Promise<WebFetchResult>;
}
//# sourceMappingURL=web.d.ts.map