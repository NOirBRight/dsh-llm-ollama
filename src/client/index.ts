/** Browser half: Ollama Cloud setup inside Plugin configuration. */

import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import type { ConnectionHandle } from '@deepseek-ai/dsh-client-connection/client'
import type {} from '@deepseek-ai/dsh-api-remotes/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings-plugins/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-slots'
import {
  decodeOllamaDiscoveryResult,
  decodeOllamaSettings,
  DEFAULT_API_KEY_ENV,
  OLLAMA_DISCOVER_ENDPOINT,
  OLLAMA_RPC_CHANNEL,
  OLLAMA_SETTINGS_NAMESPACE,
} from '../client-contract.ts'
import type { OllamaDiscoveryRequest, OllamaSettingsView } from '../client-contract.ts'
import { OllamaPluginCard } from './OllamaPluginCard.tsx'
import type { OllamaPluginCardFace } from './OllamaPluginCard.tsx'
import { en, zh } from './locales.ts'
import type { OllamaSettingsKey } from './locales.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Ollama Cloud Plugin configuration copy. */
    'settings.ollama-cloud': OllamaSettingsKey
  }
}

/** Stable browser-plugin name. */
export const name = 'dsh-llm-ollama-client'
/** Client services required by the Plugin configuration contribution. */
export const inject = ['slots', 'locale', 'connection', 'remote', 'settingsScope']

function same(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right)
}

/** Register localized Ollama Cloud configuration under Plugin configuration. */
export function apply(ctx: ClientContext): void {
  const localeNamespace = 'settings.ollama-cloud'
  ctx.effect(
    () => ctx.locale.register(localeNamespace, { zh, en }),
    'dsh-llm-ollama: Plugin configuration copy',
  )
  const t = ctx.locale.bind(localeNamespace) as OllamaPluginCardFace['t']
  const scope = ctx.settingsScope.bind<OllamaSettingsView>({
    namespace: OLLAMA_SETTINGS_NAMESPACE,
    decode: decodeOllamaSettings,
  })
  // This dual-runtime package compiles Host and Client Context augmentations in
  // one project; the browser entry receives the client handle at runtime.
  const { api, rpc } = ctx.get('connection') as unknown as ConnectionHandle

  const describeCredential: OllamaPluginCardFace['describeCredential'] = async () => {
    const ref = scope.getSnapshot().value?.apiKeyEnv ?? DEFAULT_API_KEY_ENV
    const response = await api.credentials.describe({ refs: [ref] })
    if (!response.result.ok) throw new Error(response.result.error.message)
    const credential = response.result.value.credentials[ref]
    return {
      configured: credential?.configured ?? false,
      writable: credential?.writable ?? true,
    }
  }

  const saveConfiguration: OllamaPluginCardFace['saveConfiguration'] = async (settings, apiKey) => {
    const current = scope.getSnapshot().value
    const fields = [
      'baseURL',
      'models',
      'defaultContextWindow',
      'streamIdleTimeoutMs',
    ] as const
    for (const field of fields) {
      if (same(current?.[field], settings[field])) continue
      await scope.set(field, settings[field])
      if (!same(scope.getSnapshot().value?.[field], settings[field])) throw new Error(t('requestFailed'))
    }
    if (!same(current?.maxTokens, settings.maxTokens)) {
      if (settings.maxTokens === undefined) await scope.unset('maxTokens')
      else await scope.set('maxTokens', settings.maxTokens)
      if (!same(scope.getSnapshot().value?.maxTokens, settings.maxTokens)) throw new Error(t('requestFailed'))
    }
    if (apiKey !== undefined) {
      const ref = scope.getSnapshot().value?.apiKeyEnv ?? DEFAULT_API_KEY_ENV
      const response = await api.credentials.set({ ref, value: apiKey })
      if (!response.result.ok) throw new Error(response.result.error.message)
    }
  }

  const discoverModels: OllamaPluginCardFace['discoverModels'] = async (request: OllamaDiscoveryRequest) => {
    const result = await rpc.call(
      OLLAMA_RPC_CHANNEL,
      OLLAMA_DISCOVER_ENDPOINT,
      request,
    )
    if (!result.ok) throw new Error(result.error.message)
    const decoded = decodeOllamaDiscoveryResult(result.value)
    if (decoded === undefined) throw new Error('Ollama Cloud returned an invalid model catalog')
    return decoded.models
  }

  ctx.slots.inject('settings.plugin.item', () => ctx.slots.register({
    name: 'settings.plugin.item',
    id: 'ollama-cloud',
    order: 40,
    locale: localeNamespace,
    inject: (): OllamaPluginCardFace => ({
      t,
      hooks: { ollamaSettings: scope },
      describeCredential,
      saveConfiguration,
      discoverModels,
    }),
  }, OllamaPluginCard))
}
