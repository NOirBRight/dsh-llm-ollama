// @vitest-environment jsdom

import { Context, Service } from '@deepseek-ai/cordis'
import { describe, expect, it, vi } from 'vitest'
import type { ConfigForm, ConfigFormSnapshot } from '@deepseek-ai/dsh-client-ui-settings/client'
import type { OllamaSettingsView } from '../src/client-contract.ts'
import {
  OLLAMA_CREDENTIAL_SET_ENDPOINT,
  OLLAMA_CREDENTIAL_STATUS_ENDPOINT,
  OLLAMA_RPC_METHOD,
  OLLAMA_SETTINGS_VALIDATE_ENDPOINT,
} from '../src/client-contract.ts'
import { apply, inject, MISSING_OWNER_GRACE_MS } from '../src/client/index.ts'
import { clearProviderUsageCache, peekCachedUsage, rememberHeadlineQuota } from 'dsh-llm-providers-ui/usage-readers'

const value: OllamaSettingsView = {
  baseURL: 'https://ollama.com/api',
  models: [],
}

function createSettingsForm(initial = value) {
  let snapshot: ConfigFormSnapshot<OllamaSettingsView> = {
    status: 'ready',
    value: initial,
    base: initial,
    user: {},
    revision: 1,
    writable: true,
    mode: 'host',
  }
  const mutate = vi.fn(async (
    operations: readonly { op: string; path: readonly (string | number)[]; value?: unknown }[],
    expectedRevision: number,
  ) => {
    if (snapshot.value === undefined || snapshot.revision !== expectedRevision) return false
    const next = structuredClone(snapshot.value) as OllamaSettingsView
    for (const operation of operations) {
      const field = operation.path[0]
      if (operation.op === 'set' && typeof field === 'string') {
        ;(next as unknown as Record<string, unknown>)[field] = structuredClone(operation.value)
      }
    }
    snapshot = { ...snapshot, value: next, revision: expectedRevision + 1 }
    return true
  })
  const form = {
    getSnapshot: () => snapshot,
    subscribe: () => () => undefined,
    mutate,
  } as unknown as ConfigForm<OllamaSettingsView>
  return { form, mutate }
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

async function bench(
  usageReply: unknown = { ok: true, value: { models: [] } },
  call = vi.fn((_channel: string, _method: string, request: { endpoint: string }) =>
    Promise.resolve(request.endpoint === 'usage/read' ? usageReply : { ok: true, value: { models: [] } })),
) {
  const ctx = new Context()
  await ctx.plugin(FakeSlots).await()
  const slots = ctx.get('slots') as FakeSlots
  ctx.provide('locale', {
    register: () => () => undefined,
    bind: () => (key: string) => key,
  } as never)
  const settingsForm = createSettingsForm()
  ctx.provide('configForms', { get: () => settingsForm.form } as never)
  ctx.provide('remote', { $on: () => () => undefined } as never)
  ctx.provide('connection', { rpc: { call } } as never)
  ctx.provide('webServer', { register: () => () => {} } as never)
  return { ctx, slots, settingsForm }
}

describe('Ollama client plugin registration', () => {
  it('declares only the client services it consumes', () => {
    expect(inject).toEqual(['slots', 'locale', 'connection', 'configForms'])
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
  it('saves editable settings through the revision-fenced ConfigForm', async () => {
    const call = vi.fn(async (_channel: string, _method: string, request: { endpoint: string }) =>
      request.endpoint === OLLAMA_SETTINGS_VALIDATE_ENDPOINT
        ? { ok: true, value: {} }
        : { ok: true, value: { configured: false, writable: true } })
    const { ctx, slots, settingsForm } = await bench(undefined, call)
    const fiber = ctx.plugin({ inject: [...inject], apply })
    await fiber.await()
    const face = slots.entries('settings.provider.item')[0]?.inject?.() as {
      saveConfiguration(settings: OllamaSettingsView): Promise<{ settings: OllamaSettingsView; revision: number }>
    }
    const next = { baseURL: 'https://example.test/api', models: [{ id: 'gemma3', vision: true }] }

    await expect(face.saveConfiguration(next)).resolves.toEqual({ settings: next, revision: 2 })
    expect(call).toHaveBeenCalledWith('/api', OLLAMA_RPC_METHOD, {
      endpoint: OLLAMA_SETTINGS_VALIDATE_ENDPOINT,
      payload: { ...next, expectedRevision: 1 },
    }, undefined)
    expect(settingsForm.mutate).toHaveBeenCalledWith([
      { op: 'set', path: ['baseURL'], value: next.baseURL },
      { op: 'set', path: ['models'], value: next.models },
    ], 1)
    await fiber.dispose()
  })

  it('purges persisted quota when credentials are stored without a provider directory', async () => {
    rememberHeadlineQuota('llm-ollama', 'Ollama Cloud', { label: 'S', remainingPercent: 90 })
    const call = vi.fn(async (_channel: string, _method: string, request: { endpoint: string }) =>
      request.endpoint === OLLAMA_CREDENTIAL_SET_ENDPOINT
        ? { ok: true, value: { configured: true, writable: true } }
        : { ok: true, value: { configured: false, writable: true } })
    const { ctx, slots } = await bench(undefined, call)
    const fiber = ctx.plugin({ inject: [...inject], apply })
    await fiber.await()
    const face = slots.entries('settings.provider.item')[0]?.inject?.() as {
      saveCredential(apiKey: string): Promise<void>
    }
    await face.saveCredential('new-key')
    expect(call).toHaveBeenCalledWith('/api', OLLAMA_RPC_METHOD, {
      endpoint: OLLAMA_CREDENTIAL_SET_ENDPOINT,
      payload: { value: 'new-key' },
    }, undefined)
    expect(peekCachedUsage('llm-ollama')).toBeUndefined()
    clearProviderUsageCache()
    await fiber.dispose()
  })
  it('keeps a saved account when an older credential read finishes later', async () => {
    let resolveStatus: (value: unknown) => void
    const olderStatus = new Promise<unknown>(resolve => { resolveStatus = resolve })
    const call = vi.fn((_channel: string, _method: string, request: { endpoint: string; payload: unknown }) => {
      if (request.endpoint === OLLAMA_CREDENTIAL_STATUS_ENDPOINT) return olderStatus
      if (request.endpoint === OLLAMA_CREDENTIAL_SET_ENDPOINT) {
        return Promise.resolve({ ok: true, value: { configured: true, writable: true } })
      }
      return Promise.resolve({ ok: true, value: {} })
    })
    const { ctx, slots } = await bench(undefined, call)
    let entry: { account(): { state: string } } | undefined
    ctx.provide('providerDirectory', {
      register: (next: typeof entry) => { entry = next; return () => undefined },
      update: vi.fn(),
      invalidateUsage: vi.fn(),
    } as never)
    const fiber = ctx.plugin({ inject: [...inject], apply })
    await fiber.await()
    await vi.waitFor(() => {
      expect(call).toHaveBeenCalledWith('/api', OLLAMA_RPC_METHOD, {
        endpoint: OLLAMA_CREDENTIAL_STATUS_ENDPOINT,
        payload: {},
      }, undefined)
    })
    const face = slots.entries('settings.provider.item')[0]?.inject?.() as {
      saveCredential(value: string): Promise<void>
    }
    await face.saveCredential('new-key')
    expect(entry?.account().state).toBe('configured')
    resolveStatus({ ok: true, value: { configured: false, writable: true } })
    await vi.waitFor(() => { expect(entry?.account().state).toBe('configured') })
    await fiber.dispose()
    await ctx.fiber.dispose()
  })

})
