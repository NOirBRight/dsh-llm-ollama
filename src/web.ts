/**
 * Ollama Cloud web capability providers: `/api/web_search` and
 * `/api/web_fetch` behind the `ctx.web` seam. Both reuse the LLM route's
 * credential reference and base URL, resolved per operation so a settings
 * change reaches the very next call. Redirects fail closed because every
 * request carries the credential (`redirect: 'error'`, matching the other
 * credentialed web providers).
 * @module dsh-llm-ollama/web
 */

import { WebError } from '@deepseek-ai/dsh-web'
import type {
  WebFetchProvider,
  WebFetchRequest,
  WebFetchResult,
  WebSearchProvider,
  WebSearchRequest,
  WebSearchResult,
  WebSearchSource,
} from '@deepseek-ai/dsh-web'
import { attributionHeaders } from '@deepseek-ai/dsh-llm'

/** Stable id both providers register under (one backend serves both capabilities). */
export const OLLAMA_WEB_PROVIDER_ID = 'ollama-cloud'

/** Ollama's `/api/web_search` accepts at most ten results per call. */
const MAX_SEARCH_RESULTS = 10

/** Per-operation facts shared by both web providers. */
export interface OllamaWebProviderOptions {
  /** Current endpoint base (`/web_search` or `/web_fetch` is appended). */
  readonly baseURL: () => string
  /** Resolve the current API key, or undefined when none is stored. */
  readonly resolveApiKey: () => Promise<string | undefined>
}

/** `/api/web_search` response item. */
interface WireWebSearchResult {
  title?: unknown
  url?: unknown
  content?: unknown
}

/** `/api/web_search` response body. */
interface WireWebSearchResponse {
  results?: unknown
}

/** `/api/web_fetch` response body. */
interface WireWebFetchResponse {
  title?: unknown
  content?: unknown
  links?: unknown
}

/** Decode one search response, dropping entries without a usable URL. */
function decodeSearchResponse(body: WireWebSearchResponse): WebSearchResult {
  if (!Array.isArray(body.results)) {
    throw new WebError('ollama-cloud web search answered without a "results" array', 'OLLAMA_WEB_BAD_REPLY')
  }
  const sources: WebSearchSource[] = []
  for (const entry of body.results as WireWebSearchResult[]) {
    if (typeof entry !== 'object' || entry === null || typeof entry.url !== 'string' || entry.url.length === 0) {
      continue
    }
    sources.push({
      url: entry.url,
      ...typeof entry.title === 'string' && entry.title.length > 0 ? { title: entry.title } : {},
      ...typeof entry.content === 'string' && entry.content.length > 0 ? { snippet: entry.content } : {},
    })
  }
  return { sources, truncated: false }
}

/** Decode one fetch response; extracted page content is plain text/markdown, not HTML. */
function decodeFetchResponse(body: WireWebFetchResponse): string {
  if (typeof body.content !== 'string') {
    throw new WebError('ollama-cloud web fetch answered without text "content"', 'OLLAMA_WEB_BAD_REPLY')
  }
  return body.content
}

/** POST one credentialed JSON request that refuses redirects, and decode the reply. */
async function postJson(
  options: OllamaWebProviderOptions,
  suffix: string,
  payload: Record<string, unknown>,
  signal: AbortSignal | undefined,
): Promise<{ status: number, body: unknown }> {
  const baseURL = options.baseURL().replace(/\/+$/, '')
  const url = `${baseURL}${suffix}`
  const apiKey = await options.resolveApiKey()
  if (apiKey === undefined) {
    throw new WebError(
      'ollama-cloud web capabilities need an API key; store one through Plugin configuration',
      'OLLAMA_WEB_MISSING_CREDENTIAL',
    )
  }
  let response: Response
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json',
        authorization: `Bearer ${apiKey}`,
        ...attributionHeaders(),
      },
      body: JSON.stringify(payload),
      redirect: 'error',
      ...signal === undefined ? {} : { signal },
    })
  } catch (error: unknown) {
    if (signal?.aborted) {
      throw new WebError('ollama-cloud web request aborted by caller', 'ABORTED', { cause: error })
    }
    const detail = error instanceof Error && error.message.length > 0 ? `: ${error.message}` : ''
    throw new WebError(`could not reach ${url}${detail}`, 'WEB_PROVIDER_ERROR', { cause: error })
  }
  if (!response.ok) {
    await response.body?.cancel()
    throw new WebError(
      `${url} answered ${response.status}${response.status === 401 || response.status === 403 ? '; check the API key' : ''}`,
      'WEB_PROVIDER_ERROR',
    )
  }
  let body: unknown
  try {
    body = await response.json()
  } catch (error: unknown) {
    throw new WebError(`${url} did not answer with JSON`, 'OLLAMA_WEB_BAD_REPLY', { cause: error })
  }
  return { status: response.status, body }
}

/** The Ollama Cloud search provider; HTTP redirects fail as `WEB_PROVIDER_ERROR`. */
export class OllamaWebSearchProvider implements WebSearchProvider {
  readonly id = OLLAMA_WEB_PROVIDER_ID

  constructor(private readonly options: OllamaWebProviderOptions) {}

  available(): boolean {
    return URL.canParse(this.options.baseURL())
  }

  async search(request: WebSearchRequest, signal?: AbortSignal): Promise<WebSearchResult> {
    // One snapshot per operation: the key and the endpoint must come from the
    // same settings section even when a save lands mid-resolution.
    const { body } = await postJson(this.options, '/web_search', {
      query: request.query,
      ...request.maxResults === undefined
        ? {}
        : { max_results: Math.min(request.maxResults, MAX_SEARCH_RESULTS) },
    }, signal)
    return decodeSearchResponse(body as WireWebSearchResponse)
  }
}

/** The Ollama Cloud fetch provider; HTTP redirects fail as `WEB_PROVIDER_ERROR`. */
export class OllamaWebFetchProvider implements WebFetchProvider {
  readonly id = OLLAMA_WEB_PROVIDER_ID

  constructor(private readonly options: OllamaWebProviderOptions) {}

  available(): boolean {
    return URL.canParse(this.options.baseURL())
  }

  async fetch(request: WebFetchRequest, signal?: AbortSignal): Promise<WebFetchResult> {
    const { status, body } = await postJson(this.options, '/web_fetch', { url: request.url }, signal)
    return {
      url: request.url,
      statusCode: status,
      body: { kind: 'text', content: decodeFetchResponse(body as WireWebFetchResponse) },
      truncated: false,
    }
  }
}
