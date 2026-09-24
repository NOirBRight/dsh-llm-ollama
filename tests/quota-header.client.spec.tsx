// @vitest-environment jsdom
// Collapsed header quota: usage loads without expansion, expansion never refires, failures stay truthful.
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ConfigFormSnapshot } from '@deepseek-ai/dsh-client-ui-settings/client'
import { OllamaPluginCard } from '../src/client/OllamaPluginCard.tsx'
import type { OllamaPluginCardProps } from '../src/client/OllamaPluginCard.tsx'
import { en, zh } from '../src/client/locales.ts'
import { clearProviderUsageCache, peekCachedUsage, rememberHeadlineQuota } from 'dsh-llm-providers-ui/usage-readers'
import type { OllamaSettingsView } from '../src/client-contract.ts'

afterEach(() => { cleanup(); clearProviderUsageCache() })

const settings: OllamaSettingsView = {
  baseURL: 'https://ollama.com/api',
  models: [],
}

const usageOk = {
  kind: 'ok' as const,
  usage: { fetchedAt: '2026-09-01T00:00:00.000Z', weekly: { usage: 0.2, models: [] } },
}

function props(overrides: Record<string, unknown> = {}): OllamaPluginCardProps {
  const current: ConfigFormSnapshot<OllamaSettingsView> = {
    status: 'ready', value: settings, base: settings, user: {}, revision: 1, writable: true, mode: 'host',
  }
  return {
    t: (key: keyof typeof en) => en[key],
    useOllamaSettings: (selector: (value: ConfigFormSnapshot<OllamaSettingsView>) => unknown) => selector(current),
    describeCredential: vi.fn(() => Promise.resolve({ configured: true, writable: true })),
    saveConfiguration: vi.fn(next => Promise.resolve({ settings: next, revision: 2 })),
    saveCredential: vi.fn(() => Promise.resolve()),
    discoverModels: vi.fn(() => Promise.resolve([])),
    fetchUsage: vi.fn(() => Promise.resolve(usageOk)),
    beginModelPicker: vi.fn(),
    completeModelPicker: vi.fn(),
    failModelPicker: vi.fn(),
    closeModelPicker: vi.fn(),
    ...overrides,
  } as unknown as OllamaPluginCardProps
}

function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(value => {
    resolve = value
  })
  return { promise, resolve }
}

describe('OllamaPluginCard collapsed quota', () => {
  it('shows header quota while collapsed and does not reload on expansion', async () => {
    const fetchUsage = vi.fn(() => Promise.resolve(usageOk))
    render(<OllamaPluginCard {...props({ fetchUsage })} />)

    const meter = await screen.findByRole('meter', { name: en.usageWeekly })
    expect(meter.getAttribute('aria-valuenow')).toBe('80')
    expect(fetchUsage).toHaveBeenCalledTimes(1)

    fireEvent.click(screen.getByRole('button', { name: en.expand + ': ' + en.title }))
    await screen.findByRole('button', { name: en.usageRefresh })
    expect(screen.getAllByRole('meter', { name: en.usageWeekly }).length).toBeGreaterThanOrEqual(2)
    expect(fetchUsage).toHaveBeenCalledTimes(1)
  })

  it('labels a monthly-only quota with the same neutral window name in the header and the cache', async () => {
    const fetchUsage = vi.fn(() => Promise.resolve({
      kind: 'ok' as const,
      usage: { fetchedAt: '2026-09-01T00:00:00.000Z', monthly: { usage: 0.25, models: [] } },
    }))
    render(<OllamaPluginCard {...props({ t: (key: keyof typeof en) => zh[key], fetchUsage })} />)

    const meter = await screen.findByRole('meter', { name: zh.usageMonthly })
    expect(meter.getAttribute('aria-valuenow')).toBe('75')
    expect(screen.queryByRole('meter', { name: zh.usageWeekly })).toBeNull()
    expect(screen.queryByRole('meter', { name: zh.usageSession })).toBeNull()
    // The collapsed headline reuses the window name as its short label.
    expect(peekCachedUsage('llm-ollama')?.windows).toEqual([
      expect.objectContaining({ label: zh.usageMonthly, shortLabel: zh.usageMonthly }),
    ])
  })

  it('reports a usage read failure truthfully with a collapsed unavailable dash', async () => {
    const fetchUsage = vi.fn(() => Promise.reject(new Error('quota read failed')))
    render(<OllamaPluginCard {...props({ fetchUsage })} />)

    await waitFor(() => { expect(fetchUsage).toHaveBeenCalledTimes(1) })
    // Truthful unavailable state: dash mini, never a fabricated percent.
    await waitFor(() => { expect(document.querySelector('[data-provider-quota-mini] [data-provider-quota-missing]')).not.toBeNull() })
    expect(screen.queryByRole('meter')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: en.expand + ': ' + en.title }))
    await screen.findByText('quota read failed')
    expect(fetchUsage).toHaveBeenCalledTimes(1)
  })

  it('ignores seeded cache when the endpoint reports unsupported', async () => {
    rememberHeadlineQuota('llm-ollama', 'Ollama Cloud', { remainingPercent: 80, label: 'seeded' })
    const fetchUsage = vi.fn(() => Promise.resolve({ kind: 'unsupported' as const }))
    render(<OllamaPluginCard {...props({ fetchUsage })} />)

    await waitFor(() => { expect(document.querySelector('[data-provider-quota-mini] [data-provider-quota-missing]')).not.toBeNull() })
    expect(screen.queryByRole('meter')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: en.expand + ': ' + en.title }))
    await screen.findByText(en.usageUnsupported)
  })

  it('shows seeded cache while credential is still unknown', async () => {
    rememberHeadlineQuota('llm-ollama', 'Ollama Cloud', { remainingPercent: 64, label: 'seeded' })
    const describeCredential = vi.fn(() => new Promise<never>(() => {}))
    const useOllamaSettings = (selector: (value: unknown) => unknown): unknown =>
      selector({ status: 'loading', value: undefined, base: undefined, user: {}, revision: 0, writable: true, mode: 'host' })
    render(<OllamaPluginCard {...props({ describeCredential, useOllamaSettings })} />)

    const meter = await screen.findByRole('meter', { name: 'seeded' })
    expect(meter.getAttribute('aria-valuenow')).toBe('64')
  })

  it('drops a superseded read so old-account usage cannot resurrect', async () => {
    const usageA = { kind: 'ok' as const, usage: { fetchedAt: '2026-09-01T00:00:00.000Z', weekly: { usage: 0.8, models: [] } } }
    const usageB = { kind: 'ok' as const, usage: { fetchedAt: '2026-09-01T00:00:00.000Z', weekly: { usage: 0.1, models: [] } } }
    const first = deferred<typeof usageA>()
    const second = deferred<typeof usageB>()
    const fetchUsage = vi.fn().mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise)
    const saveConfiguration = vi.fn((next: unknown) => Promise.resolve({ settings: next, revision: 2 }))
    render(<OllamaPluginCard {...props({ fetchUsage, saveConfiguration })} />)
    await waitFor(() => { expect(fetchUsage).toHaveBeenCalledTimes(1) })
    fireEvent.click(screen.getByRole('button', { name: en.expand + ': ' + en.title }))
    fireEvent.change(screen.getByLabelText(en.apiKey), { target: { value: 'new-key' } })
    fireEvent.click(screen.getByRole('button', { name: en.save }))
    await waitFor(() => { expect(fetchUsage).toHaveBeenCalledTimes(2) })
    second.resolve(usageB)
    await waitFor(() => { expect(screen.getAllByRole('meter', { name: en.usageWeekly }).map(meter => meter.getAttribute('aria-valuenow'))).toEqual(['90', '90']) })
    first.resolve(usageA)
    await new Promise(resolve => setTimeout(resolve, 50))
    expect(screen.getAllByRole('meter', { name: en.usageWeekly }).every(meter => meter.getAttribute('aria-valuenow') === '90')).toBe(true)
  })

  it('shows a dash after a refresh fails following a success, never stale live quota', async () => {
    let mode: 'ok' | 'fail' = 'ok'
    const fetchUsage = vi.fn(() => mode === 'ok' ? Promise.resolve(usageOk) : Promise.reject(new Error('refresh boom')))
    render(<OllamaPluginCard {...props({ fetchUsage })} />)
    expect((await screen.findByRole('meter', { name: en.usageWeekly })).getAttribute('aria-valuenow')).toBe('80')
    fireEvent.click(screen.getByRole('button', { name: en.expand + ': ' + en.title }))
    await screen.findByRole('button', { name: en.usageRefresh })
    mode = 'fail'
    fireEvent.click(screen.getByRole('button', { name: en.usageRefresh }))
    await waitFor(() => { expect(document.querySelector('[data-provider-quota-mini] [data-provider-quota-missing]')).not.toBeNull() })
    expect(document.querySelector('[data-provider-quota-mini] [data-provider-quota-meter]')).toBeNull()
  })

  it('drops a stale credential read after save-new-key without hiding quota', async () => {
    let resolveCredential!: (value: unknown) => void
    const credentialGate = new Promise<unknown>(value => {
      resolveCredential = value
    })
    const describeCredential = vi.fn()
      .mockReturnValueOnce(credentialGate)
      .mockResolvedValue({ configured: true, writable: true })
    const saveConfiguration = vi.fn((next: unknown) => Promise.resolve({ settings: next, revision: 2 }))
    render(<OllamaPluginCard {...props({ describeCredential, saveConfiguration })} />)
    await waitFor(() => { expect(describeCredential).toHaveBeenCalledTimes(1) })
    fireEvent.click(screen.getByRole('button', { name: en.expand + ': ' + en.title }))
    fireEvent.change(screen.getByLabelText(en.apiKey), { target: { value: 'new-key' } })
    fireEvent.click(screen.getByRole('button', { name: en.save }))
    await waitFor(() => { expect(describeCredential).toHaveBeenCalledTimes(2) })
    await screen.findByText(en.saved)
    await waitFor(() => { expect(screen.getAllByRole('meter', { name: en.usageWeekly }).map(meter => meter.getAttribute('aria-valuenow'))).toEqual(['80', '80']) })
    resolveCredential({ configured: false, writable: true })
    await new Promise(resolve => setTimeout(resolve, 50))
    expect(screen.getAllByRole('meter', { name: en.usageWeekly }).every(meter => meter.getAttribute('aria-valuenow') === '80')).toBe(true)
  })

  it('drops an old read resolving mid-save before the fresh read starts', async () => {
    const usageA = { kind: 'ok' as const, usage: { fetchedAt: '2026-09-01T00:00:00.000Z', weekly: { usage: 0.8, models: [] } } }
    const first = deferred<typeof usageA>()
    const fetchUsage = vi.fn().mockReturnValueOnce(first.promise).mockImplementation(() => Promise.resolve(usageOk))
    let resolveSave!: (value: unknown) => void
    const saveGate = new Promise<unknown>(value => {
      resolveSave = value
    })
    const saveConfiguration = vi.fn((next: unknown) => saveGate.then(() => ({ settings: next, revision: 2 })))
    render(<OllamaPluginCard {...props({ fetchUsage, saveConfiguration })} />)
    await waitFor(() => { expect(fetchUsage).toHaveBeenCalledTimes(1) })
    fireEvent.click(screen.getByRole('button', { name: en.expand + ': ' + en.title }))
    fireEvent.change(screen.getByLabelText(en.apiKey), { target: { value: 'new-key' } })
    fireEvent.click(screen.getByRole('button', { name: en.save }))
    await waitFor(() => { expect(saveConfiguration).toHaveBeenCalledTimes(1) })
    first.resolve(usageA)
    await new Promise(resolve => setTimeout(resolve, 50))
    expect(peekCachedUsage('llm-ollama')).toBeUndefined()
    expect(screen.queryByRole('meter')).toBeNull()
    resolveSave(undefined)
    await waitFor(() => { expect(screen.getAllByRole('meter', { name: en.usageWeekly }).map(meter => meter.getAttribute('aria-valuenow'))).toEqual(['80', '80']) })
  })

  it('drops a late read after unmount without caching it', async () => {
    expect(peekCachedUsage('llm-ollama')).toBeUndefined()
    const gate = deferred<typeof usageOk>()
    const fetchUsage = vi.fn(() => gate.promise)
    const view = render(<OllamaPluginCard {...props({ fetchUsage })} />)
    await waitFor(() => { expect(fetchUsage).toHaveBeenCalledTimes(1) })
    view.unmount()
    gate.resolve(usageOk)
    await new Promise(resolve => setTimeout(resolve, 50))
    expect(peekCachedUsage('llm-ollama')).toBeUndefined()
  })

  it('labels unknown credential as loading instead of not-configured', async () => {
    const describeCredential = vi.fn(() => new Promise<never>(() => {}))
    render(<OllamaPluginCard {...props({ describeCredential })} />)
    await waitFor(() => { expect(describeCredential).toHaveBeenCalledTimes(1) })
    expect(document.querySelector('[data-provider-header-status]')?.textContent).toBe(en.loading)
    expect(document.querySelector('[data-provider-header-status]')?.textContent).not.toBe(en.summaryOff)
  })

  it('suppresses the model count while the snapshot has not loaded', async () => {
    const describeCredential = vi.fn(() => new Promise<never>(() => {}))
    const useOllamaSettings = (selector: (value: unknown) => unknown): unknown =>
      selector({ status: 'loading', value: undefined, base: undefined, user: {}, revision: 0, writable: true, mode: 'host' })
    render(<OllamaPluginCard {...props({ describeCredential, useOllamaSettings })} />)
    await waitFor(() => { expect(describeCredential).not.toHaveBeenCalled() })
    expect(document.querySelector('[data-provider-header-summary]')?.textContent).toBe('')
    expect(document.querySelector('[data-provider-header-status]')?.textContent).toBe(en.loading)
  })

  it('hides seeded cache once credential is known false', async () => {
    rememberHeadlineQuota('llm-ollama', 'Ollama Cloud', { remainingPercent: 64, label: 'seeded' })
    const describeCredential = vi.fn(() => Promise.resolve({ configured: false, writable: true }))
    render(<OllamaPluginCard {...props({ describeCredential })} />)

    await waitFor(() => { expect(describeCredential).toHaveBeenCalledTimes(1) })
    await waitFor(() => { expect(screen.queryByRole('meter')).toBeNull() })
    expect(document.querySelector('[data-provider-quota]')).toBeNull()
  })

})
