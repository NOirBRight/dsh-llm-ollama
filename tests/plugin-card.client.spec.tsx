// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { SettingsScopeSnapshot } from '@deepseek-ai/dsh-client-runtime/client'
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

function snapshot(overrides: Partial<SettingsScopeSnapshot<OllamaSettingsView>> = {}): SettingsScopeSnapshot<OllamaSettingsView> {
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
  return {
    t: key => en[key],
    useOllamaSettings: selector => selector(current),
    describeCredential: vi.fn(() => Promise.resolve({ configured: false, writable: true })),
    saveConfiguration: vi.fn(next => Promise.resolve({ settings: next, revision: 2 })),
    discoverModels: vi.fn(() => Promise.resolve([])),
    openModelPicker: vi.fn((candidates, onAdopt) => { onAdopt(candidates) }),
    closeModelPicker: vi.fn(),
    ...overrides,
  } as OllamaPluginCardProps
}

describe('OllamaPluginCard', () => {
  it('keeps global request defaults out of the plugin editor', () => {
    render(<OllamaPluginCard {...props()} />)

    fireEvent.click(screen.getByRole('button', { name: `${en.expand}: ${en.title}` }))

    expect(screen.queryByText('Request defaults')).toBeNull()
    expect(screen.queryByLabelText('Stream idle timeout (ms)')).toBeNull()
    const save = screen.getByRole<HTMLButtonElement>('button', { name: en.save })
    expect(save.style.color).toBe('var(--dsw-alias-label-primary-foreground)')
    expect(save.style.background).toBe('var(--dsw-alias-button-primary-fill)')
  })

  it('stores an API key and adopts native model capabilities from discovery', async () => {
    const saveConfiguration = vi.fn((next: OllamaSettingsView) => Promise.resolve({ settings: next, revision: 2 }))
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
    fireEvent.click(screen.getByRole('button', { name: en.fetchModels }))

    await waitFor(() => { expect(discoverModels).toHaveBeenCalledWith({
      baseURL: 'https://ollama.com/api',
      apiKey: 'ollama-secret',
    }) })
    await waitFor(() => { expect(screen.getByLabelText<HTMLInputElement>(en.vision).checked).toBe(true) })
    expect(screen.getByLabelText<HTMLInputElement>(en.tools).checked).toBe(true)
    expect(screen.getByLabelText<HTMLInputElement>(en.thinking).checked).toBe(false)
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
          tools: true,
        }],
      }),
      'ollama-secret',
    )
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
    const saveConfiguration = vi.fn(async (next: OllamaSettingsView) => {
      durable = structuredClone(next)
      return { settings: structuredClone(durable), revision: 2 }
    })
    const first = render(<OllamaPluginCard {...props({
      saveConfiguration,
      discoverModels: vi.fn(() => Promise.resolve([{ id: 'qwen3', name: 'Qwen 3', thinking: true }])),
    })} />)
    fireEvent.click(screen.getByRole('button', { name: `${en.expand}: ${en.title}` }))
    fireEvent.click(screen.getByRole('button', { name: en.fetchModels }))
    await waitFor(() => { expect(screen.getByLabelText<HTMLInputElement>(en.thinking).checked).toBe(true) })
    fireEvent.click(screen.getByRole('button', { name: en.save }))
    await waitFor(() => { expect(saveConfiguration).toHaveBeenCalledTimes(1) })
    first.unmount()

    const reopened = snapshot({ value: durable, user: { models: durable.models }, revision: 2 })
    render(<OllamaPluginCard {...props({ useOllamaSettings: selector => selector(reopened) })} />)
    fireEvent.click(screen.getByRole('button', { name: `${en.expand}: ${en.title}` }))

    expect(screen.getByLabelText<HTMLInputElement>(en.modelId).value).toBe('qwen3')
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
})
