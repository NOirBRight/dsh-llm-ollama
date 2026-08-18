import { afterEach, describe, expect, it } from 'vitest'
import {
  OLLAMA_USAGE_FAILED,
  OLLAMA_USAGE_UNSUPPORTED,
  parseOllamaUsage,
  readOllamaUsage,
} from '../src/usage.ts'
import { INVALID_CREDENTIAL_CODE } from '@deepseek-ai/dsh-llm'
import { closeMockServers, mockServer } from './mock-server.ts'

afterEach(async () => { await closeMockServers() })

/** The real ollama.com/api/usage reply shape, trimmed. */
const cloudReply = JSON.stringify({
  activity: { cost: '0.00000', models: [] },
  limits: {
    session: {
      usage: 0.188,
      models: [
        { name: 'deepseek-v4-flash:0731', request_count: 784 },
        { name: 'glm-5.2', request_count: 57 },
      ],
    },
    weekly: {
      usage: 0.891,
      resets_at: '2026-08-20T11:35:00Z',
      models: [
        { name: 'glm-5.2', request_count: 4133 },
        { name: 'web search', request_count: 264 },
      ],
    },
  },
})

describe('readOllamaUsage', () => {
  it('reads session and weekly windows with per-model counts', async () => {
    const server = await mockServer([{ kind: 'json', status: 200, body: cloudReply }])

    const usage = await readOllamaUsage({ baseURL: server.url, apiKey: 'one-shot-key' })

    expect(usage.session?.usage).toBe(0.188)
    expect(usage.session?.models).toEqual([
      { name: 'deepseek-v4-flash:0731', requestCount: 784 },
      { name: 'glm-5.2', requestCount: 57 },
    ])
    expect(usage.weekly?.usage).toBe(0.891)
    expect(usage.weekly?.resetsAt).toBe('2026-08-20T11:35:00.000Z')
    expect(usage.weekly?.models).toEqual([
      { name: 'glm-5.2', requestCount: 4133 },
      { name: 'web search', requestCount: 264 },
    ])
    expect(typeof usage.fetchedAt).toBe('string')
    expect(server.headers[0]?.authorization).toBe('Bearer one-shot-key')
  })

  it('falls back to the stored credential only when the draft carries none', async () => {
    const server = await mockServer([
      { kind: 'json', status: 200, body: cloudReply },
      { kind: 'json', status: 200, body: cloudReply },
    ])
    const storedApiKey = async () => 'stored-key'

    await readOllamaUsage({ baseURL: server.url, apiKey: 'draft-key' }, storedApiKey)
    await readOllamaUsage({ baseURL: server.url }, storedApiKey)

    expect(server.headers[0]?.authorization).toBe('Bearer draft-key')
    expect(server.headers[1]?.authorization).toBe('Bearer stored-key')
  })

  it('reads unauthenticated when no key exists anywhere', async () => {
    const server = await mockServer([{ kind: 'json', status: 200, body: cloudReply }])

    await readOllamaUsage({ baseURL: server.url })

    expect(server.headers[0]?.authorization).toBeUndefined()
  })

  it('marks a 404 as an endpoint without a usage surface', async () => {
    const server = await mockServer([{ kind: 'json', status: 404, body: '{"error":"not found"}' }])

    const failure = await readOllamaUsage({ baseURL: server.url }).catch((error: unknown) => error)

    expect(failure).toBeInstanceOf(Error)
    expect((failure as { code?: string }).code).toBe(OLLAMA_USAGE_UNSUPPORTED)
  })

  it('marks a 401 as a credential failure naming the key', async () => {
    const server = await mockServer([{ kind: 'json', status: 401, body: '{"error":"invalid credentials"}' }])

    const failure = await readOllamaUsage({ baseURL: server.url, apiKey: 'bad' })
      .catch((error: unknown) => error) as Error & { code?: string }

    expect(failure.code).toBe(INVALID_CREDENTIAL_CODE)
    expect(failure.message).toContain('check the API key')
  })

  it('refuses a malformed reply', async () => {
    const server = await mockServer([{ kind: 'json', status: 200, body: '{"limits":{}}' }])

    const failure = await readOllamaUsage({ baseURL: server.url }).catch((error: unknown) => error)

    expect((failure as { code?: string }).code).toBe(OLLAMA_USAGE_FAILED)
  })
})

describe('parseOllamaUsage', () => {
  it('keeps only well-formed per-model rows', () => {
    const now = Date.parse('2026-08-19T10:35:00.000Z')
    const usage = parseOllamaUsage({
      limits: {
        weekly: {
          usage: 0.5,
          reset_after_seconds: 3600,
          models: [
            { name: 'glm-5.2', request_count: 10 },
            { name: '', request_count: 3 },
            { name: 'broken', request_count: -1 },
            'garbage',
          ],
        },
      },
    }, 'https://ollama.com/api/usage', now)

    expect(usage.weekly?.models).toEqual([{ name: 'glm-5.2', requestCount: 10 }])
    expect(usage.weekly?.resetsAt).toBe('2026-08-19T11:35:00.000Z')
    expect(usage.session).toBeUndefined()
  })

  it('refuses a reply with no readable window', () => {
    expect(() => parseOllamaUsage({ activity: {} }, 'https://ollama.com/api/usage')).toThrowError(/malformed/)
  })
})
