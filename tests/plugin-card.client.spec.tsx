// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ConfigFormSnapshot } from '@deepseek-ai/dsh-client-ui-settings/client'
import { ProviderDetail, providerDetailCopy } from 'dsh-llm-providers-ui/provider-detail'
import { OllamaPluginCard } from '../src/client/OllamaPluginCard.tsx'
import type { OllamaPluginCardProps } from '../src/client/OllamaPluginCard.tsx'
import { en } from '../src/client/locales.ts'
import type { OllamaCatalogModelConfig, OllamaSettingsView } from '../src/client-contract.ts'

afterEach(() => { cleanup() })

const settings: OllamaSettingsView = {
  baseURL: 'https://ollama.com/api',
  models: [],
}

function snapshot(overrides: Partial<ConfigFormSnapshot<OllamaSettingsView>> = {}): ConfigFormSnapshot<OllamaSettingsView> {
  return {
    status: 'ready',
    value: settings,
    base: settings,
    user: {},
    revision: 1,
    writable: true,
    mode: 'host',
    ...overrides,
  }
}

function props(overrides: Partial<OllamaPluginCardProps> = {}): OllamaPluginCardProps {
  const current = snapshot()
  let adopt: ((models: readonly OllamaCatalogModelConfig[]) => void) | undefined
  return {
    t: key => en[key],
    useOllamaSettings: selector => selector(current),
    describeCredential: vi.fn(() => Promise.resolve({ configured: false, writable: true })),
    saveConfiguration: vi.fn((next: OllamaSettingsView, _sourceRevision: number) => Promise.resolve({ settings: next, revision: 2 })),
    saveCredential: vi.fn(() => Promise.resolve()),
    discoverModels: vi.fn(() => Promise.resolve([])),
    fetchUsage: vi.fn(() => Promise.resolve({ kind: 'unsupported' as const })),
    beginModelPicker: vi.fn((_picked, onAdopt) => { adopt = onAdopt }),
    completeModelPicker: vi.fn(candidates => { adopt?.(candidates) }),
    failModelPicker: vi.fn(),
    closeModelPicker: vi.fn(),
    ...overrides,
  } as OllamaPluginCardProps
}

describe('OllamaPluginCard', () => {
  it('stays visible when Connection does not expose the settings plane', () => {
    const current = snapshot({
      status: 'unavailable',
      value: undefined,
      base: undefined,
      user: undefined,
      revision: undefined,
      writable: false,
      mode: 'memory',
    })
    render(<OllamaPluginCard {...props({ useOllamaSettings: selector => selector(current) })} />)

    fireEvent.click(screen.getByRole('button', { name: `${en.expand}: ${en.title}` }))

    expect(screen.getByRole('status').textContent).toBe(en.remoteAccess)
  })

  it('keeps global request defaults out of the plugin editor', () => {
    render(<OllamaPluginCard {...props()} />)

    fireEvent.click(screen.getByRole('button', { name: `${en.expand}: ${en.title}` }))

    expect(screen.queryByText('Request defaults')).toBeNull()
    expect(screen.queryByLabelText('Stream idle timeout (ms)')).toBeNull()
    const save = screen.getByRole<HTMLButtonElement>('button', { name: en.save })
    expect(save.style.color).toBe('var(--dsw-alias-label-primary-foreground)')
    expect(save.style.background).toBe('var(--dsw-alias-button-primary-fill)')
  })

  it('opens the picker before discovery settles', async () => {
    let resolveDiscovery: ((models: readonly OllamaCatalogModelConfig[]) => void) | undefined
    const discoverModels = vi.fn(() => new Promise<readonly OllamaCatalogModelConfig[]>(resolve => {
      resolveDiscovery = resolve
    }))
    const beginModelPicker = vi.fn()
    const completeModelPicker = vi.fn()
    render(<OllamaPluginCard {...props({ discoverModels, beginModelPicker, completeModelPicker })} />)
    fireEvent.click(screen.getByRole('button', { name: `${en.expand}: ${en.title}` }))

    fireEvent.click(screen.getByRole('button', { name: en.fetchModels }))

    expect(beginModelPicker).toHaveBeenCalledTimes(1)
    expect(completeModelPicker).not.toHaveBeenCalled()
    resolveDiscovery?.([{ id: 'gemma3' }])
    await waitFor(() => { expect(completeModelPicker).toHaveBeenCalledWith([{ id: 'gemma3' }]) })
  })

  it('stores an API key and adopts native model capabilities from discovery', async () => {
    const saveConfiguration = vi.fn((next: OllamaSettingsView, _sourceRevision: number) => Promise.resolve({ settings: next, revision: 2 }))
    const discoverModels = vi.fn(() => Promise.resolve([
      {
        id: 'gemma3',
        name: 'Gemma 3',
        contextWindow: 131_072,
        vision: true,
        thinking: false,
        tools: true,
      },
    ]))
    render(<OllamaPluginCard {...props({ saveConfiguration, discoverModels })} />)

    fireEvent.click(screen.getByRole('button', { name: `${en.expand}: ${en.title}` }))
    fireEvent.change(screen.getByLabelText(en.apiKey), { target: { value: ' ollama-secret ' } })
    expect(screen.getByText(en.apiKeyPending)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: en.fetchModels }))

    await waitFor(() => { expect(discoverModels).toHaveBeenCalledWith({
      baseURL: 'https://ollama.com/api',
      apiKey: 'ollama-secret',
    }) })
    fireEvent.click(await screen.findByRole('button', { name: `${en.modelDetails}: gemma3` }))
    await waitFor(() => { expect(screen.getByLabelText<HTMLInputElement>(en.vision).checked).toBe(true) })
    expect(screen.queryByLabelText(en.tools)).toBeNull()
    expect(screen.queryByLabelText(en.modelOutput)).toBeNull()
    expect(screen.getByLabelText<HTMLInputElement>(en.thinking).checked).toBe(false)
    expect(screen.getByLabelText(en.modelContext)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: en.save }))

    await waitFor(() => { expect(saveConfiguration).toHaveBeenCalledTimes(1) })
    expect(saveConfiguration).toHaveBeenCalledWith(
      expect.objectContaining({
        models: [{
          id: 'gemma3',
          name: 'Gemma 3',
          contextWindow: 131_072,
          vision: true,
          thinking: false,
        }],
      }),
      1,
    )
  })
  it('keeps a failed key draft retryable after the settings form has accepted a newer revision', async () => {
    let latestSnapshot = snapshot()
    const saveConfiguration = vi.fn(async (next: OllamaSettingsView, sourceRevision: number) => {
      if (latestSnapshot.revision !== sourceRevision) throw new Error('stale revision')
      latestSnapshot = snapshot({ value: next, revision: sourceRevision + 1 })
      return { settings: next, revision: latestSnapshot.revision! }
    })
    const saveCredential = vi.fn()
      .mockRejectedValueOnce(new Error('credential storage failed'))
      .mockResolvedValueOnce(undefined)
    render(<OllamaPluginCard {...props({
      useOllamaSettings: selector => selector(latestSnapshot),
      saveConfiguration,
      saveCredential,
    })} />)
    fireEvent.click(screen.getByRole('button', { name: `${en.expand}: ${en.title}` }))
    const key = screen.getByLabelText<HTMLInputElement>(en.apiKey)
    fireEvent.change(key, { target: { value: 'retry-key' } })
    fireEvent.click(screen.getByRole('button', { name: en.save }))
    await waitFor(() => expect(screen.getByText('credential storage failed')).toBeTruthy())
    expect(key.value).toBe('retry-key')
    expect(latestSnapshot.revision).toBe(2)
    fireEvent.click(screen.getByRole('button', { name: en.save }))
    await waitFor(() => expect(saveCredential).toHaveBeenCalledTimes(2))
    expect(saveConfiguration.mock.calls.map(([, revision]) => revision)).toEqual([1, 2])
    await waitFor(() => expect(key.value).toBe(''))
  })


  it('seeds selection from current models and replaces the catalog on adoption', async () => {
    const currentModels: OllamaCatalogModelConfig[] = [
      { id: 'keep', name: 'Keep', contextWindow: 4096 },
      { id: 'remove', name: 'Remove' },
    ]
    const current = { ...settings, models: currentModels }
    const currentSnapshot = snapshot({ value: current, base: current, user: { models: currentModels } })
    let adopt: ((models: readonly OllamaCatalogModelConfig[]) => void) | undefined
    const beginModelPicker = vi.fn((_picked: ReadonlySet<string>, onAdopt: (models: readonly OllamaCatalogModelConfig[]) => void) => {
      adopt = onAdopt
    })
    const completeModelPicker = vi.fn()
    const discoverModels = vi.fn(() => Promise.resolve([
      { id: 'keep', name: 'Keep discovered', contextWindow: 8192 },
      { id: 'new', name: 'New', contextWindow: 16384 },
    ]))
    const saveConfiguration = vi.fn(async (next: OllamaSettingsView, _sourceRevision: number) => ({ settings: next, revision: 2 }))
    render(<OllamaPluginCard {...props({
      useOllamaSettings: selector => selector(currentSnapshot),
      beginModelPicker,
      completeModelPicker,
      discoverModels,
      saveConfiguration,
    })} />)

    fireEvent.click(screen.getByRole('button', { name: `${en.expand}: ${en.title}` }))
    fireEvent.click(screen.getByRole('button', { name: en.fetchModels }))

    await waitFor(() => { expect(completeModelPicker).toHaveBeenCalledWith([
      { id: 'keep', name: 'Keep discovered', contextWindow: 8192 },
      { id: 'new', name: 'New', contextWindow: 16384 },
      { id: 'remove', name: 'Remove' },
    ]) })
    expect(beginModelPicker).toHaveBeenCalledWith(new Set(['keep', 'remove']), expect.any(Function))
    adopt?.([{ id: 'new', name: 'New', contextWindow: 16384 }])
    await waitFor(() => { expect(screen.getByLabelText<HTMLInputElement>(`${en.modelId} 1`).value).toBe('new') })

    fireEvent.click(screen.getByRole('button', { name: en.save }))
    await waitFor(() => { expect(saveConfiguration).toHaveBeenCalledTimes(1) })
    expect(saveConfiguration).toHaveBeenCalledWith(expect.objectContaining({
      models: [{ id: 'new', name: 'New', contextWindow: 16384 }],
    }), 1)
  })
  it('treats a base-URL-only user layer as an inherited model catalog', () => {
    const current = snapshot({ user: { baseURL: 'https://example.test/api' } })
    render(<OllamaPluginCard {...props({ useOllamaSettings: selector => selector(current) })} />)
    fireEvent.click(screen.getByRole('button', { name: `${en.expand}: ${en.title}` }))

    expect(screen.getByText(en.inherited)).toBeTruthy()
    expect(screen.queryByText(en.customized)).toBeNull()
  })

  it('reloads the accepted model catalog after the card remounts', async () => {
    let durable = structuredClone(settings)
    const saveConfiguration = vi.fn(async (next: OllamaSettingsView, _sourceRevision: number) => {
      durable = structuredClone(next)
      return { settings: structuredClone(durable), revision: 2 }
    })
    const first = render(<OllamaPluginCard {...props({
      saveConfiguration,
      discoverModels: vi.fn(() => Promise.resolve([{ id: 'qwen3', name: 'Qwen 3', thinking: true }])),
    })} />)
    fireEvent.click(screen.getByRole('button', { name: `${en.expand}: ${en.title}` }))
    fireEvent.click(screen.getByRole('button', { name: en.fetchModels }))
    fireEvent.click(await screen.findByRole('button', { name: `${en.modelDetails}: qwen3` }))
    await waitFor(() => { expect(screen.getByLabelText<HTMLInputElement>(en.thinking).checked).toBe(true) })
    fireEvent.click(screen.getByRole('button', { name: en.save }))
    await waitFor(() => { expect(saveConfiguration).toHaveBeenCalledTimes(1) })
    first.unmount()

    const reopened = snapshot({ value: durable, user: { models: durable.models }, revision: 2 })
    render(<OllamaPluginCard {...props({ useOllamaSettings: selector => selector(reopened) })} />)
    fireEvent.click(screen.getByRole('button', { name: `${en.expand}: ${en.title}` }))
    fireEvent.click(screen.getByRole('button', { name: en.models }))

    expect(screen.getByLabelText<HTMLInputElement>(`${en.modelId} 1`).value).toBe('qwen3')
    expect(screen.getByText(en.customized)).toBeTruthy()
  })

  it('disables durable settings writes for a read-only profile', () => {
    const current = snapshot({ writable: false })
    render(<OllamaPluginCard {...props({
      useOllamaSettings: selector => selector(current),
    })} />)

    fireEvent.click(screen.getByRole('button', { name: `${en.expand}: ${en.title}` }))

    expect(screen.getByLabelText<HTMLInputElement>(en.baseURL).disabled).toBe(true)
    expect(screen.getByRole<HTMLButtonElement>('button', { name: en.save }).disabled).toBe(true)
    expect(screen.getByText(en.readOnly)).toBeTruthy()
  })

  it('renders cloud usage windows and per-model weekly counts', async () => {
    const fetchUsage = vi.fn(() => Promise.resolve({
      kind: 'ok' as const,
      usage: {
        fetchedAt: '2026-08-16T00:00:00.000Z',
        session: {
          usage: 0.188,
          models: [
            { name: 'session-alpha', requestCount: 75 },
            { name: 'session-beta', requestCount: 25 },
          ],
        },
        weekly: {
          usage: 0.891,
          models: [
            { name: 'glm-5.2', requestCount: 4133 },
            { name: 'web search', requestCount: 264 },
          ],
        },
      },
    }))
    render(<OllamaPluginCard {...props({ fetchUsage })} />)

    fireEvent.click(screen.getByRole('button', { name: `${en.expand}: ${en.title}` }))

    await waitFor(() => { expect(screen.getByRole('meter', { name: en.usageWeekly })).toBeTruthy() })
    expect(screen.getByRole('meter', { name: en.usageWeekly }).getAttribute('aria-valuenow')).toBe('10.9')
    expect(screen.getByRole('meter', { name: en.usageSession }).getAttribute('aria-valuenow')).toBe('81.2')
    expect(screen.getByText(en.usageModels)).toBeTruthy()
    expect(screen.getByText('glm-5.2')).toBeTruthy()
    expect(screen.getByText(`4133 ${en.usageRequests}`)).toBeTruthy()
    expect(screen.getByText(`264 ${en.usageRequests}`)).toBeTruthy()
    expect(fetchUsage).toHaveBeenCalledWith({ baseURL: 'https://ollama.com/api' })

    expect(screen.queryByRole('tooltip')).toBeNull()
    expect(screen.queryByRole('progressbar')).toBeNull()

    const details = screen.getByRole('list', { name: en.usageModels })
    expect(details.style.maxHeight).toBe('')
    expect(details.style.overflowY).toBe('')
  })

  it('labels a monthly-only snapshot with the neutral monthly window name', async () => {
    const fetchUsage = vi.fn(() => Promise.resolve({
      kind: 'ok' as const,
      usage: {
        fetchedAt: '2026-08-16T00:00:00.000Z',
        monthly: { usage: 0.25, models: [{ name: 'qwen3-coder', requestCount: 4 }] },
      },
    }))
    render(<OllamaPluginCard {...props({ fetchUsage })} />)

    fireEvent.click(screen.getByRole('button', { name: `${en.expand}: ${en.title}` }))

    await waitFor(() => { expect(screen.getByRole('meter', { name: en.usageMonthly })).toBeTruthy() })
    expect(screen.getByRole('meter', { name: en.usageMonthly }).getAttribute('aria-valuenow')).toBe('75')
    expect(screen.queryByRole('meter', { name: en.usageSession })).toBeNull()
    expect(screen.queryByRole('meter', { name: en.usageWeekly })).toBeNull()
    // The monthly window is the primary one, so it carries the per-model counts.
    expect(screen.getByText('qwen3-coder')).toBeTruthy()
    expect(screen.getByText(`4 ${en.usageRequests}`)).toBeTruthy()
  })

  it('explains when the endpoint has no usage surface', async () => {
    render(<OllamaPluginCard {...props()} />)

    fireEvent.click(screen.getByRole('button', { name: `${en.expand}: ${en.title}` }))

    await waitFor(() => { expect(screen.getByText(en.usageUnsupported)).toBeTruthy() })
  })

  it('shows a usage read failure and retries on demand', async () => {
    const fetchUsage = vi.fn()
      .mockRejectedValueOnce(new Error('could not reach https://ollama.com/api/usage'))
      .mockResolvedValueOnce({
        kind: 'ok' as const,
        usage: { fetchedAt: '2026-08-16T00:00:00.000Z', weekly: { usage: 0.1, models: [] } },
      })
    render(<OllamaPluginCard {...props({ fetchUsage })} />)

    fireEvent.click(screen.getByRole('button', { name: `${en.expand}: ${en.title}` }))

    await waitFor(() => { expect(screen.getByText(en.usageUnreachable)).toBeTruthy() })
    fireEvent.click(screen.getByRole('button', { name: en.usageRefresh }))
    await waitFor(() => { expect(screen.getByRole('meter', { name: en.usageWeekly }).getAttribute('aria-valuenow')).toBe('90') })
    expect(fetchUsage).toHaveBeenCalledTimes(2)
  })

  it('asks for a host restart when the running plugin predates usage reads', async () => {
    const fetchUsage = vi.fn(() => Promise.resolve({ kind: 'needs-restart' as const }))
    render(<OllamaPluginCard {...props({ fetchUsage })} />)

    fireEvent.click(screen.getByRole('button', { name: `${en.expand}: ${en.title}` }))

    await waitFor(() => { expect(screen.getByText(en.usageNeedsRestart)).toBeTruthy() })
  })

  it('reorders catalog rows by dragging the handle', async () => {
    const currentModels: OllamaCatalogModelConfig[] = [{ id: 'alpha' }, { id: 'bravo' }, { id: 'charlie' }]
    const current = { ...settings, models: currentModels }
    const currentSnapshot = snapshot({ value: current, base: current, user: { models: currentModels } })
    const saveConfiguration = vi.fn(async (next: OllamaSettingsView, _sourceRevision: number) => ({ settings: next, revision: 2 }))
    const { container } = render(<OllamaPluginCard {...props({
      useOllamaSettings: selector => selector(currentSnapshot),
      saveConfiguration,
    })} />)

    fireEvent.click(screen.getByRole('button', { name: `${en.expand}: ${en.title}` }))
    fireEvent.click(screen.getByRole('button', { name: en.models }))
    fireEvent.change(screen.getByLabelText(`${en.modelId} 1`) as HTMLInputElement, { target: { value: 'alpha-edited' } })
    expect(screen.queryByRole('button', { name: `${en.moveUp}: alpha-edited` })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: en.sortModels }))
    expect(screen.getByRole('button', { name: en.doneSorting })).toBeTruthy()
    expect((screen.getByLabelText(`${en.modelId} 1`) as HTMLInputElement).value).toBe('alpha-edited')

    const rows = Array.from(container.querySelectorAll<HTMLElement>('[data-model-row]'))
    for (const [index, row] of rows.entries()) {
      const sortable = row.closest<HTMLElement>('[data-sortable-row]') ?? row
      vi.spyOn(sortable, 'getBoundingClientRect').mockReturnValue({
        x: 0, y: index * 50, top: index * 50, bottom: index * 50 + 40,
        left: 0, right: 400, width: 400, height: 40, toJSON: () => ({}),
      })
    }

    fireEvent.pointerDown(screen.getByLabelText(`${en.dragModel}: alpha-edited`), {
      button: 0, pointerId: 1, clientX: 10, clientY: 10,
    })
    fireEvent.pointerMove(window, { pointerId: 1, clientX: 10, clientY: 140 })

    // The preview order changes before release: sibling cards move out of the
    // way while a floating ghost follows the pointer.
    expect(Array.from(container.querySelectorAll('[data-sortable-row="true"]:not([data-sortable-ghost="true"]) [data-model-row]')).map(row => row.getAttribute('data-model-row'))).toEqual([
      'bravo', 'charlie', 'alpha-edited',
    ])
    expect(document.querySelector('[data-sortable-ghost="true"]')).not.toBeNull()

    fireEvent.pointerUp(window, { pointerId: 1, clientX: 10, clientY: 140 })
    fireEvent.click(screen.getByRole('button', { name: en.save }))
    await waitFor(() => { expect(saveConfiguration).toHaveBeenCalledTimes(1) })
    expect(saveConfiguration).toHaveBeenCalledWith(expect.objectContaining({
      models: [{ id: 'bravo' }, { id: 'charlie' }, { id: 'alpha-edited' }],
    }), 1)
  })
  it('renders the shared detail template when the settings page asks for it', () => {
    const onRefresh = vi.fn()
    const usage = {
      status: 'ready' as const,
      fetchedAt: '2026-09-12T00:00:00.000Z',
      windows: [
        { id: 'weekly', label: 'Week', shortLabel: 'W', remainingPercent: 72, valueText: '72%' },
        { id: 'hourly', label: 'Hour', shortLabel: 'H', remainingPercent: 95, valueText: '95%' },
      ],
    }
    const { container } = render(<OllamaPluginCard {...props({ mode: 'detail', usage, accountState: 'configured', onRefresh, copy: providerDetailCopy.en, template: ProviderDetail })} />)

    expect(container.querySelector('[data-provider-detail]')).not.toBeNull()
    expect(container.querySelectorAll('[data-c-quota]')).toHaveLength(1)
    expect(container.textContent).toContain('72%')
    expect(container.textContent).toContain('95%')
    // The plugin's own usage section is gone in detail mode.
    expect(container.querySelector('[aria-label="' + en.usage + '"]')).toBeNull()
  })
})
