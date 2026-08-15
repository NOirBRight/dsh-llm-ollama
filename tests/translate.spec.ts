import { describe, expect, it } from 'vitest'
import { BlockAssembler, EMPTY_RESPONSE_CODE, LlmError } from '@deepseek-ai/dsh-llm'
import type { StreamChunk } from '@deepseek-ai/dsh-llm'
import { mapFinishReason, mapUsage, translate } from '../src/translate.ts'
import type { WireChatChunk } from '../src/types.ts'

/** A minimal assistant chat chunk. */
function chunk(overrides: Partial<WireChatChunk>): WireChatChunk {
  return {
    model: 'test',
    created_at: '2025-01-01T00:00:00Z',
    message: { role: 'assistant', ...overrides.message },
    done: false,
    ...overrides,
  }
}

async function* feed(...chunks: WireChatChunk[]): AsyncGenerator<WireChatChunk> {
  for (const c of chunks) yield c
}

async function collect(stream: AsyncIterable<StreamChunk>): Promise<StreamChunk[]> {
  const out: StreamChunk[] = []
  for await (const c of stream) out.push(c)
  return out
}

describe('mapFinishReason', () => {
  it('maps stop without tool calls to stop', () => {
    expect(mapFinishReason('stop', false)).toEqual({ kind: 'stop' })
  })

  it('maps stop with tool calls to tool-calls', () => {
    expect(mapFinishReason('stop', true)).toEqual({ kind: 'tool-calls' })
  })

  it('maps length to max-tokens', () => {
    expect(mapFinishReason('length', false)).toEqual({ kind: 'max-tokens' })
  })

  it('maps unknown reasons to error', () => {
    expect(mapFinishReason('unload', false)).toEqual({
      kind: 'error',
      failure: { message: 'model stopped: unload', code: 'UNLOAD' },
    })
  })
})

describe('mapUsage', () => {
  it('maps prompt_eval_count and eval_count', () => {
    expect(mapUsage(chunk({ prompt_eval_count: 10, eval_count: 5 })))
      .toEqual({ inputTokens: 10, outputTokens: 5 })
  })

  it('defaults to zero when absent', () => {
    expect(mapUsage(chunk({}))).toEqual({ inputTokens: 0, outputTokens: 0 })
  })
})

describe('translate: text', () => {
  it('streams a text block and defers finish to done', async () => {
    const chunks = await collect(translate(feed(
      chunk({ message: { role: 'assistant', content: 'Hel' } }),
      chunk({ message: { role: 'assistant', content: 'lo' } }),
      chunk({ message: { role: 'assistant', content: '' }, done: true, done_reason: 'stop', prompt_eval_count: 5, eval_count: 2 }),
    )))
    expect(chunks).toEqual([
      { type: 'block-start', index: 0, blockType: 'text' },
      { type: 'text-delta', index: 0, text: 'Hel' },
      { type: 'text-delta', index: 0, text: 'lo' },
      { type: 'block-end', index: 0, block: { type: 'text', text: 'Hello' } },
      { type: 'usage', usage: { inputTokens: 5, outputTokens: 2 } },
      { type: 'finish', reason: { kind: 'stop' } },
    ])
  })

  it('assembles into the message BlockAssembler expects', async () => {
    const assembler = new BlockAssembler()
    for await (const c of translate(feed(
      chunk({ message: { role: 'assistant', content: 'hi' } }),
      chunk({ message: { role: 'assistant', content: '' }, done: true, done_reason: 'stop' }),
    ))) {
      assembler.push(c)
    }
    expect(assembler.message().content).toEqual([{ type: 'text', text: 'hi' }])
    expect(assembler.finish).toEqual({ kind: 'stop' })
  })
})

describe('translate: reasoning', () => {
  it('streams reasoning then text as separate blocks', async () => {
    const chunks = await collect(translate(feed(
      chunk({ message: { role: 'assistant', thinking: 'think' } }),
      chunk({ message: { role: 'assistant', thinking: 'ing' } }),
      chunk({ message: { role: 'assistant', content: 'answer' } }),
      chunk({ message: { role: 'assistant', content: '' }, done: true, done_reason: 'stop' }),
    )))
    expect(chunks).toEqual([
      { type: 'block-start', index: 0, blockType: 'reasoning' },
      { type: 'reasoning-delta', index: 0, text: 'think' },
      { type: 'reasoning-delta', index: 0, text: 'ing' },
      { type: 'block-start', index: 1, blockType: 'text' },
      { type: 'text-delta', index: 1, text: 'answer' },
      { type: 'block-end', index: 0, block: { type: 'reasoning', text: 'thinking' } },
      { type: 'block-end', index: 1, block: { type: 'text', text: 'answer' } },
      { type: 'usage', usage: { inputTokens: 0, outputTokens: 0 } },
      { type: 'finish', reason: { kind: 'stop' } },
    ])
  })
})

describe('translate: tool calls', () => {
  it('streams complete tool calls and maps stop to tool-calls', async () => {
    const chunks = await collect(translate(feed(
      chunk({
        message: {
          role: 'assistant',
          tool_calls: [{ function: { name: 'get_weather', arguments: { city: 'NYC' } } }],
        },
      }),
      chunk({ message: { role: 'assistant', content: '' }, done: true, done_reason: 'stop' }),
    )))
    // Expect a block-start, tool-call-delta, block-end, usage, finish.
    expect(chunks[0]).toEqual({ type: 'block-start', index: 0, blockType: 'tool-call' })
    expect(chunks[1]).toMatchObject({ type: 'tool-call-delta', index: 0, name: 'get_weather' })
    const delta = chunks[1] as Extract<StreamChunk, { type: 'tool-call-delta' }>
    expect(delta.argumentsDelta).toBe(JSON.stringify({ city: 'NYC' }))
    expect(chunks[2]).toEqual({
      type: 'block-end',
      index: 0,
      block: { type: 'tool-call', id: delta.id, name: 'get_weather', arguments: JSON.stringify({ city: 'NYC' }) },
    })
    expect(chunks[4]).toEqual({ type: 'finish', reason: { kind: 'tool-calls' }, replayState: { callIds: [{ callId: delta.id, toolName: 'get_weather' }] } })
  })
})

describe('translate: edge cases', () => {
  it('maps a stop with no content to EMPTY_RESPONSE error', async () => {
    const chunks = await collect(translate(feed(
      chunk({ message: { role: 'assistant', content: '' }, done: true, done_reason: 'stop' }),
    )))
    const finish = chunks[chunks.length - 1] as Extract<StreamChunk, { type: 'finish' }>
    expect(finish.reason).toEqual({
      kind: 'error',
      failure: { message: 'model returned a completed response with no content', code: EMPTY_RESPONSE_CODE },
    })
  })

  it('maps length to max-tokens', async () => {
    const chunks = await collect(translate(feed(
      chunk({ message: { role: 'assistant', content: 'hi' } }),
      chunk({ message: { role: 'assistant', content: '' }, done: true, done_reason: 'length' }),
    )))
    const finish = chunks[chunks.length - 1] as Extract<StreamChunk, { type: 'finish' }>
    expect(finish.reason).toEqual({ kind: 'max-tokens' })
  })

  it('throws STREAM_CLOSED when no done chunk arrives', async () => {
    await expect(async () => {
      for await (const _ of translate(feed(chunk({ message: { role: 'assistant', content: 'hi' } })))) { /* drain */ }
    }).rejects.toThrow(LlmError)
  })
})
