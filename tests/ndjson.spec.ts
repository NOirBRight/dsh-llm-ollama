import { describe, expect, it } from 'vitest'
import { LlmError } from '@deepseek-ai/dsh-llm'
import { parseNdjson, parseChatChunks } from '../src/ndjson.ts'

/** Build a ReadableStream from string chunks. */
function streamOf(...chunks: string[]): ReadableStream<BufferSource> {
  const encoder = new TextEncoder()
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk))
      controller.close()
    },
  })
}

describe('parseNdjson', () => {
  it('yields each non-empty line', async () => {
    const lines: string[] = []
    for await (const line of parseNdjson(streamOf('{"a":1}\n{"b":2}\n'))) {
      lines.push(line)
    }
    expect(lines).toEqual(['{"a":1}', '{"b":2}'])
  })

  it('handles a stream split mid-line across reads', async () => {
    const lines: string[] = []
    for await (const line of parseNdjson(streamOf('{"a"', ':1}\n{"b"', ':2}\n'))) {
      lines.push(line)
    }
    expect(lines).toEqual(['{"a":1}', '{"b":2}'])
  })

  it('handles CRLF line endings', async () => {
    const lines: string[] = []
    for await (const line of parseNdjson(streamOf('{"a":1}\r\n{"b":2}\r\n'))) {
      lines.push(line)
    }
    expect(lines).toEqual(['{"a":1}', '{"b":2}'])
  })

  it('skips empty lines', async () => {
    const lines: string[] = []
    for await (const line of parseNdjson(streamOf('{"a":1}\n\n{"b":2}\n'))) {
      lines.push(line)
    }
    expect(lines).toEqual(['{"a":1}', '{"b":2}'])
  })

  it('flushes a trailing line without a final newline', async () => {
    const lines: string[] = []
    for await (const line of parseNdjson(streamOf('{"a":1}\n{"b":2}'))) {
      lines.push(line)
    }
    expect(lines).toEqual(['{"a":1}', '{"b":2}'])
  })

  it('handles UTF-8 split across reads', async () => {
    // "héllo" — the é is two UTF-8 bytes (0xC3 0xA9), split across reads.
    const lines: string[] = []
    const encoder = new TextEncoder()
    const full = encoder.encode('{"msg":"héllo"}\n')
    const split1 = full.slice(0, 10)
    const split2 = full.slice(10)
    const stream = new ReadableStream<BufferSource>({
      start(controller) {
        controller.enqueue(split1)
        controller.enqueue(split2)
        controller.close()
      },
    })
    for await (const line of parseNdjson(stream)) {
      lines.push(line)
    }
    expect(lines).toEqual(['{"msg":"héllo"}'])
  })
})

describe('parseChatChunks', () => {
  it('yields chunks and stops after done: true', async () => {
    const chunks: { done: boolean; content?: string }[] = []
    for await (const chunk of parseChatChunks<{ done: boolean; content?: string }>(
      streamOf('{"done":false,"content":"hi"}\n{"done":true}\n'),
    )) {
      chunks.push(chunk)
    }
    expect(chunks).toEqual([
      { done: false, content: 'hi' },
      { done: true },
    ])
  })

  it('throws STREAM_CLOSED when no done chunk arrives', async () => {
    const stream = streamOf('{"done":false,"content":"hi"}\n')
    await expect(async () => {
      for await (const _ of parseChatChunks(stream)) { /* drain */ }
    }).rejects.toThrow(LlmError)
  })

  it('throws MALFORMED_RESPONSE for invalid JSON', async () => {
    const stream = streamOf('not json\n{"done":true}\n')
    await expect(async () => {
      for await (const _ of parseChatChunks(stream)) { /* drain */ }
    }).rejects.toThrow(LlmError)
  })
})
