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

/** Default per-attempt budget for one Ollama Cloud web request. */
export const DEFAULT_WEB_REQUEST_TIMEOUT_MS = 15_000

/** Error code for a provider-side request budget expiry. */
export const OLLAMA_WEB_TIMEOUT = 'OLLAMA_WEB_TIMEOUT'

/** Error code for a retryable transport failure before an HTTP response arrives. */
export const OLLAMA_WEB_TRANSPORT = 'OLLAMA_WEB_TRANSPORT'

/** Per-operation facts shared by both web providers. */
export interface OllamaWebProviderOptions {
  /** Current endpoint base (`/web_search` or `/web_fetch` is appended). */
  readonly baseURL: () => string
  /** Resolve the current API key, or undefined when none is stored. */
  readonly resolveApiKey: () => Promise<string | undefined>
  /** Per-attempt request budget; defaults to 15 seconds. */
  readonly requestTimeoutMs?: number
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

interface RequestAttempt {
  readonly signal: AbortSignal
  readonly timedOut: () => boolean
  readonly clear: () => void
}

/** Combine caller cancellation with one provider-side attempt budget. */
function requestAttempt(signal: AbortSignal | undefined, timeoutMs: number): RequestAttempt {
  const controller = new AbortController()
  let timedOut = false
  const timer = setTimeout(() => {
    timedOut = true
    controller.abort(new Error(`ollama-cloud web request timed out after ${timeoutMs}ms`))
  }, timeoutMs)
  timer.unref()
  const onCallerAbort = (): void => { controller.abort(signal?.reason) }
  if (signal?.aborted) onCallerAbort()
  else signal?.addEventListener('abort', onCallerAbort, { once: true })
  return {
    signal: controller.signal,
    timedOut: () => timedOut,
    clear: () => {
      clearTimeout(timer)
      signal?.removeEventListener('abort', onCallerAbort)
    },
  }
}

/** Whether a fetch rejection names the redirect policy rather than a transient transport failure. */
function isRedirectFailure(error: unknown): boolean {
  let current: unknown = error
  while (current instanceof Error) {
    if (/redirect/i.test(current.message)) return true
    current = current.cause
  }
  return false
}

/** POST one credentialed JSON attempt that refuses redirects, and decode the reply. */
async function postJsonAttempt(
  options: OllamaWebProviderOptions,
  url: string,
  apiKey: string,
  payload: Record<string, unknown>,
  callerSignal: AbortSignal | undefined,
): Promise<{ status: number, body: unknown }> {
  const timeoutMs = options.requestTimeoutMs ?? DEFAULT_WEB_REQUEST_TIMEOUT_MS
  const attempt = requestAttempt(callerSignal, timeoutMs)
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
      signal: attempt.signal,
    })
  } catch (error: unknown) {
    if (callerSignal?.aborted) {
      throw new WebError('ollama-cloud web request aborted by caller', 'ABORTED', { cause: error })
    }
    if (attempt.timedOut()) {
      throw new WebError(`ollama-cloud web request timed out after ${timeoutMs}ms`, OLLAMA_WEB_TIMEOUT, { cause: error })
    }
    if (isRedirectFailure(error)) {
      throw new WebError(`${url} attempted a redirect`, 'WEB_PROVIDER_ERROR', { cause: error })
    }
    const detail = error instanceof Error && error.message.length > 0 ? `: ${error.message}` : ''
    throw new WebError(`could not reach ${url}${detail}`, OLLAMA_WEB_TRANSPORT, { cause: error })
  } finally {
    attempt.clear()
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

/** POST one operation, retrying only a transient pre-response failure once. */
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
  try {
    return await postJsonAttempt(options, url, apiKey, payload, signal)
  } catch (error: unknown) {
    const retryable = error instanceof WebError
      && (error.code === OLLAMA_WEB_TIMEOUT || error.code === OLLAMA_WEB_TRANSPORT)
    if (!retryable || signal?.aborted) throw error
  }
  return postJsonAttempt(options, url, apiKey, payload, signal)
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
