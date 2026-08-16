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

import { INVALID_CREDENTIAL_CODE, LlmError, normalizeApiKey } from '@deepseek-ai/dsh-llm'
import { attributionHeaders } from '@deepseek-ai/dsh-llm'
import { OLLAMA_PUBLIC_BASE_URL } from './client-contract.ts'
import type {
  OllamaUsageModelCount,
  OllamaUsageView,
  OllamaUsageWindow,
} from './client-contract.ts'

/** Public Ollama Cloud API base URL. */
const PUBLIC_BASE_URL = OLLAMA_PUBLIC_BASE_URL

/** Per-read budget for one usage request. */
export const DEFAULT_USAGE_REQUEST_TIMEOUT_MS = 15_000

/** Error code for an endpoint without a usage surface (e.g. self-hosted). */
export const OLLAMA_USAGE_UNSUPPORTED = 'OLLAMA_USAGE_UNSUPPORTED'

/** Error code for a failed or unreadable usage read. */
export const OLLAMA_USAGE_FAILED = 'OLLAMA_USAGE_FAILED'

/** Replies larger than this are refused; a healthy usage reply is a few KiB. */
const MAX_USAGE_BYTES = 1024 * 1024

/** One usage read: draft endpoint and one-shot credential, like discovery. */
export interface OllamaUsageRequest {
  /** Unsaved native API base URL; defaults to the stored settings value's caller. */
  baseURL?: string
  /** Unsaved credential used for this request only. */
  apiKey?: string
  /** Caller cancellation. */
  signal?: AbortSignal
}

/** Wire shape of the `/usage` reply body. */
interface WireUsageResponse {
  limits?: unknown
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** Check a probe key before it is placed in a header. */
function usableProbeKey(raw: string): string {
  const checked = normalizeApiKey(raw)
  if (checked.ok) return checked.value
  throw new LlmError(
    checked.reason === 'empty'
      ? 'this provider\'s API key is blank; enter it in Plugin configuration first'
      : 'this provider\'s API key contains characters no HTTP header can carry; paste the raw key only',
    INVALID_CREDENTIAL_CODE,
  )
}

/**
 * Convert one wire window. A window without a finite non-negative fraction is
 * dropped; per-model entries keep only well-formed rows so one odd entry
 * cannot sink the whole panel.
 */
function parseWindow(value: unknown): OllamaUsageWindow | undefined {
  if (!isRecord(value)) return undefined
  const usage = value['usage']
  if (typeof usage !== 'number' || !Number.isFinite(usage) || usage < 0) return undefined
  const models: OllamaUsageModelCount[] = []
  if (Array.isArray(value['models'])) {
    for (const entry of value['models'] as unknown[]) {
      if (!isRecord(entry) || typeof entry['name'] !== 'string' || entry['name'].length === 0) continue
      const requestCount = entry['request_count']
      if (typeof requestCount !== 'number' || !Number.isSafeInteger(requestCount) || requestCount < 0) continue
      models.push({ name: entry['name'], requestCount })
    }
  }
  return { usage, models }
}

/**
 * Convert the provider reply into the secret-free snapshot the card renders.
 * @param value - opaque JSON returned by the usage endpoint.
 * @param url - endpoint read, for error messages.
 * @returns session and weekly windows with per-model request counts.
 */
export function parseOllamaUsage(value: unknown, url: string): OllamaUsageView {
  const limits = isRecord(value) ? (value as WireUsageResponse).limits : undefined
  const session = isRecord(limits) ? parseWindow((limits as Record<string, unknown>)['session']) : undefined
  const weekly = isRecord(limits) ? parseWindow((limits as Record<string, unknown>)['weekly']) : undefined
  if (session === undefined && weekly === undefined) {
    throw new LlmError(`${url} returned a malformed usage response`, OLLAMA_USAGE_FAILED)
  }
  return {
    fetchedAt: new Date().toISOString(),
    ...session === undefined ? {} : { session },
    ...weekly === undefined ? {} : { weekly },
  }
}

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
export async function readOllamaUsage(
  request: OllamaUsageRequest,
  storedApiKey?: () => Promise<string | undefined>,
): Promise<OllamaUsageView> {
  const baseURL = (request.baseURL ?? PUBLIC_BASE_URL).replace(/\/+$/, '')
  const supplied = request.apiKey ?? await storedApiKey?.()
  const apiKey = supplied === undefined || supplied.trim().length === 0
    ? undefined
    : usableProbeKey(supplied)
  const url = `${baseURL}/usage`
  const timeout = AbortSignal.timeout(DEFAULT_USAGE_REQUEST_TIMEOUT_MS)
  const signal = request.signal === undefined ? timeout : AbortSignal.any([request.signal, timeout])

  let response: Response
  try {
    response = await fetch(url, {
      method: 'GET',
      headers: {
        accept: 'application/json',
        ...apiKey === undefined ? {} : { authorization: `Bearer ${apiKey}` },
        ...attributionHeaders(),
      },
      // The request carries the credential; a redirect would forward it.
      redirect: 'error',
      signal,
    })
  } catch (error: unknown) {
    if (request.signal?.aborted) {
      throw new LlmError('Ollama Cloud usage read aborted by caller', 'ABORTED', { cause: error })
    }
    const detail = error instanceof Error && error.message.length > 0 ? `: ${error.message}` : ''
    throw new LlmError(`could not reach ${url}${detail}`, OLLAMA_USAGE_FAILED, { cause: error })
  }
  if (response.status === 404) {
    await response.body?.cancel()
    throw new LlmError('this Ollama endpoint does not report cloud usage', OLLAMA_USAGE_UNSUPPORTED)
  }
  if (!response.ok) {
    await response.body?.cancel()
    throw new LlmError(
      `${url} answered ${response.status}${response.status === 401 || response.status === 403 ? '; check the API key' : ''}`,
      response.status === 401 || response.status === 403 ? INVALID_CREDENTIAL_CODE : OLLAMA_USAGE_FAILED,
    )
  }
  const declared = Number(response.headers.get('content-length') ?? Number.NaN)
  if (Number.isFinite(declared) && declared > MAX_USAGE_BYTES) {
    await response.body?.cancel()
    throw new LlmError(`${url} answered with more than ${MAX_USAGE_BYTES} bytes`, OLLAMA_USAGE_FAILED)
  }
  let text: string
  try {
    text = await response.text()
  } catch (error: unknown) {
    throw new LlmError(`${url} could not be read`, OLLAMA_USAGE_FAILED, { cause: error })
  }
  if (text.length > MAX_USAGE_BYTES) {
    throw new LlmError(`${url} answered with more than ${MAX_USAGE_BYTES} bytes`, OLLAMA_USAGE_FAILED)
  }
  let body: unknown
  try {
    body = JSON.parse(text)
  } catch (error: unknown) {
    throw new LlmError(`${url} did not answer with JSON`, OLLAMA_USAGE_FAILED, { cause: error })
  }
  return parseOllamaUsage(body, url)
}
