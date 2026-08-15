import { describe, expect, it } from 'vitest'
import { CallId, createMessage, createUserMessage, ReasoningEffortId } from '@deepseek-ai/dsh-llm'
import type { GenerateOptions } from '@deepseek-ai/dsh-llm'
import { serializeMessages, serializeRequest } from '../src/serialize.ts'

function request(overrides: Partial<GenerateOptions> = {}): GenerateOptions {
  return { provider: 'ollama-cloud', model: 'gpt-oss:20b', messages: [], ...overrides }
}

describe('serializeMessages', () => {
  it('maps user text to string content', async () => {
    const wire = await serializeMessages([
      createUserMessage({
        content: [{ type: 'text', text: 'hello ' }, { type: 'text', text: 'world' }],
        source: { kind: 'plugin', plugin: 'test' },
      }),
    ], undefined)
    expect(wire).toEqual([{ role: 'user', content: 'hello world' }])
  })

  it('maps system-role messages in history', async () => {
    const wire = await serializeMessages([
      createMessage({
        role: 'system', content: [{ type: 'text', text: 'be brief' }],
        source: { kind: 'plugin', plugin: 'test' },
      }),
    ], undefined)
    expect(wire).toEqual([{ role: 'system', content: 'be brief' }])
  })

  it('maps plain assistant text without thinking', async () => {
    const wire = await serializeMessages([
      createMessage({
        role: 'assistant',
        content: [
          { type: 'reasoning', text: 'thinking…' },
          { type: 'text', text: 'answer' },
        ],
        source: { kind: 'plugin', plugin: 'test' },
      }),
    ], undefined)
    // Tool-call-free turn: thinking is dropped (not needed for passback).
    expect(wire).toEqual([{ role: 'assistant', content: 'answer' }])
  })

  it('passes thinking back on tool-call turns', async () => {
    const wire = await serializeMessages([
      createMessage({
        role: 'assistant',
        content: [
          { type: 'reasoning', text: 'need weather' },
          { type: 'tool-call', id: CallId('call-1'), name: 'get_weather', arguments: '{"city":"NYC"}' },
        ],
        source: { kind: 'plugin', plugin: 'test' },
      }),
    ], undefined)
    expect(wire).toEqual([{
      role: 'assistant',
      content: '',
      thinking: 'need weather',
      tool_calls: [{ function: { name: 'get_weather', arguments: { city: 'NYC' } } }],
    }])
  })

  it('correlates tool results by tool_name from preceding tool-call', async () => {
    const wire = await serializeMessages([
      createMessage({
        role: 'assistant',
        content: [
          { type: 'tool-call', id: CallId('call-1'), name: 'get_weather', arguments: '{"city":"NYC"}' },
        ],
        source: { kind: 'plugin', plugin: 'test' },
      }),
      createUserMessage({
        content: [{ type: 'tool-result', toolCallId: CallId('call-1'), content: [{ type: 'text', text: '22°C' }] }],
        source: { kind: 'tool', callId: CallId('call-1') },
      }),
    ], undefined)
    expect(wire).toEqual([
      { role: 'assistant', content: '', tool_calls: [{ function: { name: 'get_weather', arguments: { city: 'NYC' } } }] },
      { role: 'tool', tool_name: 'get_weather', content: '22°C' },
    ])
  })

  it('throws INVALID_HISTORY for a tool result with no preceding tool-call', async () => {
    await expect(serializeMessages([
      createUserMessage({
        content: [{ type: 'tool-result', toolCallId: CallId('orphan'), content: [{ type: 'text', text: 'x' }] }],
        source: { kind: 'tool', callId: CallId('orphan') },
      }),
    ], undefined)).rejects.toMatchObject({ failure: { code: 'INVALID_HISTORY' } })
  })
})

describe('serializeRequest', () => {
  it('builds a minimal streaming request', async () => {
    const body = await serializeRequest(request({
      messages: [createUserMessage({ content: [{ type: 'text', text: 'hi' }], source: { kind: 'user' } })],
    }))
    expect(body).toEqual({
      model: 'gpt-oss:20b',
      messages: [{ role: 'user', content: 'hi' }],
      stream: true,
    })
  })

  it('prepends system prompt', async () => {
    const body = await serializeRequest(request({
      system: 'be brief',
      messages: [createUserMessage({ content: [{ type: 'text', text: 'hi' }], source: { kind: 'user' } })],
    }))
    expect(body.messages).toEqual([
      { role: 'system', content: 'be brief' },
      { role: 'user', content: 'hi' },
    ])
  })

  it('maps reasoningEffort to think field', async () => {
    const body = await serializeRequest(request({
      reasoningEffort: ReasoningEffortId('high'),
      messages: [],
    }))
    expect(body.think).toBe('high')
  })

  it('maps off effort to think: false', async () => {
    const body = await serializeRequest(request({
      reasoningEffort: ReasoningEffortId('off'),
      messages: [],
    }))
    expect(body.think).toBe(false)
  })

  it('omits think when no effort is specified', async () => {
    const body = await serializeRequest(request({ messages: [] }))
    expect(body.think).toBeUndefined()
  })

  it('forces think: false for session-title purpose', async () => {
    const body = await serializeRequest(request({
      purpose: 'session-title',
      messages: [],
    }))
    expect(body.think).toBe(false)
  })

  it('uses low thinking for session titles when the model cannot disable it', async () => {
    const body = await serializeRequest(
      request({ purpose: 'session-title', messages: [] }),
      { thinking: true, thinkingCanDisable: false },
    )
    expect(body.think).toBe('low')
  })

  it('rejects off when the model cannot disable thinking', async () => {
    await expect(serializeRequest(
      request({ reasoningEffort: ReasoningEffortId('off'), messages: [] }),
      { thinking: true, thinkingCanDisable: false },
    )).rejects.toMatchObject({ code: 'UNSUPPORTED_REASONING_EFFORT' })
  })

  it('omits think for non-thinking models', async () => {
    const body = await serializeRequest(
      request({ reasoningEffort: ReasoningEffortId('high'), messages: [] }),
      { thinking: false },
    )
    expect(body.think).toBeUndefined()
  })

  it('maps maxTokens to options.num_predict', async () => {
    const body = await serializeRequest(request({ maxTokens: 4096, messages: [] }))
    expect(body.options).toEqual({ num_predict: 4096 })
  })

  it('maps temperature and stop to options', async () => {
    const body = await serializeRequest(request({
      temperature: 0.7, stop: ['END'], messages: [],
    }))
    expect(body.options).toEqual({ temperature: 0.7, stop: ['END'] })
  })

  it('maps tools to the tools array', async () => {
    const body = await serializeRequest(request({
      tools: [{ name: 'get_weather', description: 'Get weather', parameters: { type: 'object' } }],
      messages: [],
    }))
    expect(body.tools).toEqual([{
      type: 'function',
      function: { name: 'get_weather', description: 'Get weather', parameters: { type: 'object' } },
    }])
  })
})
