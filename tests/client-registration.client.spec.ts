// @vitest-environment jsdom

import { Context, Service } from '@deepseek-ai/cordis'
import { describe, expect, it, vi } from 'vitest'
import type { SettingsScope, SettingsScopeSnapshot } from '@deepseek-ai/dsh-client-ui-settings/client'
import type { OllamaSettingsView } from '../src/client-contract.ts'
import { apply, inject, MISSING_OWNER_GRACE_MS } from '../src/client/index.ts'
import { clearProviderUsageCache, peekCachedUsage, rememberHeadlineQuota } from 'dsh-llm-providers-ui/usage-readers'

const value: OllamaSettingsView = {
  apiKeyEnv: 'OLLAMA_API_KEY',
  baseURL: 'https://ollama.com/api',
  models: [],
  defaultContextWindow: 262_144,
  streamIdleTimeoutMs: 300_000,
}

function scope(): SettingsScope<OllamaSettingsView> {
  const snapshot: SettingsScopeSnapshot<OllamaSettingsView> = {
    status: 'ready',
    value,
    base: value,
    user: {},
    revision: 1,
    writable: true,
    mode: 'host',
  }
  return {
    getSnapshot: () => snapshot,
    subscribe: () => () => undefined,
    mutate: vi.fn(() => Promise.resolve()),
    set: vi.fn(() => Promise.resolve()),
    unset: vi.fn(() => Promise.resolve()),
  }
}

interface SlotEntry {
  options: Record<string, unknown>
  inject?: () => unknown
}

class FakeSlots extends Service {
  private readonly registered: SlotEntry[] = []

  constructor(ctx: Context) { super(ctx, 'slots') }

  inject(_name: string, register: () => () => void): void { this.ctx.effect(register) }

  register(options: Record<string, unknown> & { inject?: () => unknown }, _component: unknown): () => void {
    const entry = { options, inject: options.inject }
    this.registered.push(entry)
    return () => { this.registered.splice(this.registered.indexOf(entry), 1) }
  }

  entries(name: string): readonly SlotEntry[] {
    return this.registered.filter(entry => entry.options['name'] === name)
  }

  subscribe(_name: string, listener: () => void): () => void {
    this.listeners.push(listener)
    return () => { this.listeners.splice(this.listeners.indexOf(listener), 1) }
  }

  private readonly listeners: Array<() => void> = []

  /** Emit a slot change, as the owner's registration does. */
  notify(): void { for (const listener of [...this.listeners]) listener() }
}

async function bench(usageReply: unknown = { ok: true, value: { models: [] } }) {
  const ctx = new Context()
  await ctx.plugin(FakeSlots).await()
  const slots = ctx.get('slots') as FakeSlots
  ctx.provide('locale', {
    register: () => () => undefined,
    bind: () => (key: string) => key,
  } as never)
  ctx.provide('settingsScope', { bind: () => scope() } as never)
  ctx.provide('remote', { $on: () => () => undefined } as never)
  ctx.provide('connection', {
    api: {
      credentials: {
        describe: vi.fn(() => Promise.resolve({
          rpcId: 'credential',
          result: { ok: true, value: { credentials: {} } },
        })),
        set: vi.fn(() => Promise.resolve({ rpcId: 'credential', result: { ok: true, value: {} } })),
      },
    },
    rpc: {
      call: vi.fn((_channel: string, endpoint: string) =>
        Promise.resolve(endpoint === 'usage/read' ? usageReply : { ok: true, value: { models: [] } })),
    },
  } as never)
  return { ctx, slots }
}

describe('Ollama client plugin registration', () => {
  it('declares only the client services it consumes', () => {
    expect(inject).toEqual(['slots', 'locale', 'connection'])
  })

  it('registers the card and frame picker, then removes both with the plugin fiber', async () => {
    const { ctx, slots } = await bench()
    const fiber = ctx.plugin({ inject: [...inject], apply })
    await fiber.await()

    expect(slots.entries('settings.section')).toHaveLength(0) // owned by dsh-llm-providers-ui
    const entries = slots.entries('settings.provider.item')
    expect(entries).toHaveLength(1)
    expect(entries[0]?.options).toMatchObject({ key: 'llm-ollama' })
    const face = (entries[0] as { inject?: () => unknown }).inject?.() as { hooks: Record<string, unknown> }
    expect(Object.keys(face.hooks)).toEqual(['ollamaSettings'])
    const overlays = slots.entries('shell.overlay')
    expect(overlays).toHaveLength(1)
    expect(overlays[0]?.options).toMatchObject({ id: 'ollama-cloud-model-picker', order: 100 })

    await fiber.dispose()

    expect(slots.entries('settings.provider.item')).toHaveLength(0)
    expect(slots.entries('settings.section')).toHaveLength(0)
    expect(slots.entries('shell.overlay')).toHaveLength(0)
  })

  it('defers the missing owner warning past the grace period', async () => {
    vi.useFakeTimers()
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    try {
      const { ctx, slots } = await bench()
      const fiber = ctx.plugin({ inject: [...inject], apply })
      await fiber.await()

      await vi.advanceTimersByTimeAsync(MISSING_OWNER_GRACE_MS - 1)
      expect(warn).not.toHaveBeenCalled()
      await vi.advanceTimersByTimeAsync(1)
      expect(warn).toHaveBeenCalledTimes(1)
      await fiber.dispose()

      const late = await bench()
      const lateFiber = late.ctx.plugin({ inject: [...inject], apply })
      await lateFiber.await()
      late.slots.register({ name: 'settings.section', id: 'other' }, undefined)
      late.slots.notify()
      await vi.advanceTimersByTimeAsync(MISSING_OWNER_GRACE_MS - 1)
      expect(warn).toHaveBeenCalledTimes(1)
      late.slots.register({ name: 'settings.section', id: 'providers' }, undefined)
      late.slots.notify()
      await vi.advanceTimersByTimeAsync(MISSING_OWNER_GRACE_MS)
      expect(warn).toHaveBeenCalledTimes(1)
      await lateFiber.dispose()
    } finally {
      warn.mockRestore()
      vi.useRealTimers()
    }
  })

  it('decodes a monthly-only usage reply into the card view', async () => {
    const usage = {
      fetchedAt: '2026-09-01T00:00:00.000Z',
      monthly: { usage: 0.25, models: [{ name: 'qwen3-coder', requestCount: 4 }] },
    }
    const { ctx, slots } = await bench({ ok: true, value: { status: 'ok', usage } })
    const fiber = ctx.plugin({ inject: [...inject], apply })
    await fiber.await()
    const face = (slots.entries('settings.provider.item')[0] as {
      inject?: () => { fetchUsage: (request: { baseURL?: string }) => Promise<unknown> }
    }).inject?.()

    await expect(face?.fetchUsage({ baseURL: 'https://ollama.com/api' }))
      .resolves.toEqual({ kind: 'ok', usage })
    await fiber.dispose()
  })

  it('purges persisted quota when credentials are stored without a provider directory', async () => {
    rememberHeadlineQuota('llm-ollama', 'Ollama Cloud', { label: 'S', remainingPercent: 90 })
    const ctx = new Context()
    await ctx.plugin(FakeSlots).await()
    const slots = ctx.get('slots') as FakeSlots
    ctx.provide('locale', {
      register: () => () => undefined,
      bind: () => (key: string) => key,
    } as never)
    ctx.provide('settingsScope', { bind: () => scope() } as never)
    ctx.provide('remote', { $on: () => () => undefined } as never)
    ctx.provide('connection', {
      rpc: {
        call: vi.fn(async (_channel: string, endpoint: string) => endpoint === 'credential/set'
          ? { ok: true, value: { configured: true, writable: true } }
          : { ok: true, value: { models: [] } }),
      },
    } as never)
    const fiber = ctx.plugin({ inject: [...inject], apply })
    await fiber.await()
    const face = (slots.entries('settings.provider.item')[0] as { inject?: () => { saveCredential: (apiKey: string) => Promise<unknown> } }).inject?.()
    await face?.saveCredential('new-key')
    expect(peekCachedUsage('llm-ollama')).toBeUndefined()
    clearProviderUsageCache()
    await fiber.dispose()
  })
})
