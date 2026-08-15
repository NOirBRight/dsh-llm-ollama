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
    saveConfiguration: vi.fn(() => Promise.resolve()),
    discoverModels: vi.fn(() => Promise.resolve([])),
    ...overrides,
  } as OllamaPluginCardProps
}

describe('OllamaPluginCard', () => {
  it('keeps global request defaults out of the plugin editor', () => {
    render(<OllamaPluginCard {...props()} />)

    fireEvent.click(screen.getByRole('button', { name: `${en.expand}: ${en.title}` }))

    expect(screen.queryByText('Request defaults')).toBeNull()
    expect(screen.queryByLabelText('Stream idle timeout (ms)')).toBeNull()
  })

  it('stores an API key and adopts native model capabilities from discovery', async () => {
    const saveConfiguration = vi.fn(() => Promise.resolve())
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
    expect(await screen.findByText('Gemma 3')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: en.addSelected }))

    expect(screen.getByLabelText<HTMLInputElement>(en.vision).checked).toBe(true)
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
