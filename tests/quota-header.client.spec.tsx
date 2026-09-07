// @vitest-environment jsdom
// Collapsed header quota: usage loads without expansion, expansion never refires, failures stay truthful.
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { SettingsScopeSnapshot } from '@deepseek-ai/dsh-client-ui-settings/client'
import { OllamaPluginCard } from '../src/client/OllamaPluginCard.tsx'
import type { OllamaPluginCardProps } from '../src/client/OllamaPluginCard.tsx'
import { en } from '../src/client/locales.ts'
import type { OllamaSettingsView } from '../src/client-contract.ts'

afterEach(() => { cleanup() })

const settings: OllamaSettingsView = {
  apiKeyEnv: 'OLLAMA_API_KEY',
  baseURL: 'https://ollama.com/api',
  models: [],
  defaultContextWindow: 4096,
  streamIdleTimeoutMs: 300_000,
}

const usageOk = {
  kind: 'ok' as const,
  usage: { fetchedAt: '2026-09-01T00:00:00.000Z', weekly: { usage: 0.2, models: [] } },
}

function props(overrides: Record<string, unknown> = {}): OllamaPluginCardProps {
  const current: SettingsScopeSnapshot<OllamaSettingsView> = {
    status: 'ready', value: settings, base: settings, user: {}, revision: 1, writable: true, mode: 'host',
  }
  return {
    t: (key: keyof typeof en) => en[key],
    useOllamaSettings: (selector: (value: SettingsScopeSnapshot<OllamaSettingsView>) => unknown) => selector(current),
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

  it('reports a usage read failure truthfully with a collapsed unavailable dash', async () => {
    const fetchUsage = vi.fn(() => Promise.reject(new Error('quota read failed')))
    render(<OllamaPluginCard {...props({ fetchUsage })} />)

    await waitFor(() => { expect(fetchUsage).toHaveBeenCalledTimes(1) })
    // Truthful unavailable state: dash mini, never a fabricated percent.
    expect(document.querySelector('[data-provider-quota-mini] [data-provider-quota-missing]')).not.toBeNull()
    expect(screen.queryByRole('meter')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: en.expand + ': ' + en.title }))
    await screen.findByText('quota read failed')
    expect(fetchUsage).toHaveBeenCalledTimes(1)
  })
})
