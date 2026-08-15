import { createServer } from 'node:http'
import type { IncomingMessage, Server, ServerResponse } from 'node:http'

/** One scripted behavior for the next request the mock server receives. */
export type Behavior =
  | { kind: 'ndjson'; lines: string[]; delayMs?: number }
  | { kind: 'json'; status: number; body: string }
  | { kind: 'close-early'; lines: string[] }

export interface MockServer {
  url: string
  /** Bodies of received requests, in order. */
  requests: unknown[]
  /** Header bags of received requests, in order (parallel to `requests`). */
  headers: IncomingMessage['headers'][]
  script: Behavior[]
  close(): Promise<void>
}

const servers: Server[] = []

/** Close every server opened since the last call; run from each spec's afterEach. */
export async function closeMockServers(): Promise<void> {
  await Promise.all(servers.splice(0).map(server => new Promise(resolve => server.close(resolve))))
}

/** A minimal complete text generation as NDJSON lines. */
export const textLines = [
  '{"model":"test","created_at":"2025-01-01T00:00:00Z","message":{"role":"assistant","content":"hello"},"done":false}',
  '{"model":"test","created_at":"2025-01-01T00:00:00Z","message":{"role":"assistant","content":""},"done":true,"done_reason":"stop","prompt_eval_count":3,"eval_count":1}',
]

/** A minimal tool-call generation as NDJSON lines. */
export const toolCallLines = [
  '{"model":"test","created_at":"2025-01-01T00:00:00Z","message":{"role":"assistant","content":"","tool_calls":[{"function":{"name":"get_weather","arguments":{"city":"NYC"}}}]},"done":false}',
  '{"model":"test","created_at":"2025-01-01T00:00:00Z","message":{"role":"assistant","content":""},"done":true,"done_reason":"stop","prompt_eval_count":5,"eval_count":2}',
]

/** Local Ollama API stand-in: replays scripted behaviors per request. */
export async function mockServer(script: Behavior[]): Promise<MockServer> {
  const requests: unknown[] = []
  const headers: IncomingMessage['headers'][] = []
  const server = createServer((request: IncomingMessage, response: ServerResponse) => {
    let body = ''
    request.on('data', (chunk: Buffer) => { body += chunk.toString('utf8') })
    request.on('end', () => {
      try { requests.push(JSON.parse(body)) } catch { requests.push(body) }
      headers.push(request.headers)
      const behavior = script.shift()
      if (!behavior) {
        response.writeHead(500).end('mock script exhausted')
        return
      }
      if (behavior.kind === 'json') {
        response.writeHead(behavior.status, { 'content-type': 'application/json' })
        response.end(behavior.body)
        return
      }
      response.writeHead(200, { 'content-type': 'application/x-ndjson' })
      const lines = behavior.lines
      const delayMs = behavior.kind === 'ndjson' ? behavior.delayMs : undefined
      const write = (index: number): void => {
        if (index >= lines.length) {
          response.end()
          return
        }
        response.write(`${lines[index]}\n`)
        if (delayMs !== undefined) {
          setTimeout(() =>{  write(index + 1) }, delayMs)
        } else {
          write(index + 1)
        }
      }
      write(0)
    })
  })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  if (address === null || typeof address === 'string') throw new Error('mock server address unavailable')
  servers.push(server)
  return {
    url: `http://127.0.0.1:${address.port}`,
    requests,
    headers,
    script,
    close: () => new Promise<void>(resolve => server.close(() =>{  resolve() })),
  }
}
