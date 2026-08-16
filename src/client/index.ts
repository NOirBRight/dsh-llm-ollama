/** Browser half: Ollama Cloud setup inside Plugin configuration. */

import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import type { ConnectionHandle } from '@deepseek-ai/dsh-client-connection/client'
import type {} from '@deepseek-ai/dsh-api-remotes/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings-plugins/client'
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-slots'
import {
  decodeOllamaDiscoveryResult,
  decodeOllamaSaveResult,
  decodeOllamaSettings,
  decodeOllamaUsageReply,
  DEFAULT_API_KEY_ENV,
  OLLAMA_DISCOVER_ENDPOINT,
  OLLAMA_RPC_CHANNEL,
  OLLAMA_SAVE_ENDPOINT,
  OLLAMA_SETTINGS_NAMESPACE,
  OLLAMA_USAGE_ENDPOINT,
} from '../client-contract.ts'
import type { OllamaDiscoveryRequest, OllamaSettingsView } from '../client-contract.ts'
import { OllamaPluginCard } from './OllamaPluginCard.tsx'
import type { OllamaPluginCardFace } from './OllamaPluginCard.tsx'
import { OllamaModelPicker, OllamaModelPickerController } from './OllamaModelPicker.tsx'
import type { OllamaModelPickerFace } from './OllamaModelPicker.tsx'
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
  const picker = new OllamaModelPickerController()
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
    const snapshot = scope.getSnapshot()
    if (snapshot.revision === undefined) throw new Error(t('requestFailed'))
    const saved = await rpc.call(
      OLLAMA_RPC_CHANNEL,
      OLLAMA_SAVE_ENDPOINT,
      {
        baseURL: settings.baseURL,
        models: settings.models,
        expectedRevision: snapshot.revision,
      },
    )
    if (!saved.ok) throw new Error(saved.error.message)
    const accepted = decodeOllamaSaveResult(saved.value)
    if (accepted === undefined) throw new Error(t('requestFailed'))
    if (apiKey !== undefined) {
      const ref = accepted.settings.apiKeyEnv
      const response = await api.credentials.set({ ref, value: apiKey })
      if (!response.result.ok) throw new Error(response.result.error.message)
    }
    return accepted
  }

  const fetchUsage: OllamaPluginCardFace['fetchUsage'] = async (request: OllamaDiscoveryRequest) => {
    const result = await rpc.call(
      OLLAMA_RPC_CHANNEL,
      OLLAMA_USAGE_ENDPOINT,
      request,
    )
    if (!result.ok) {
      // A Host started before this package's usage endpoint exists answers
      // with its unknown-endpoint error; the card asks for a restart instead
      // of surfacing that as a read failure.
      if (result.error.message.startsWith('unknown Ollama Cloud endpoint')) {
        return { kind: 'needs-restart' as const }
      }
      throw new Error(result.error.message)
    }
    const reply = decodeOllamaUsageReply(result.value)
    if (reply === undefined) throw new Error('Ollama Cloud returned an invalid usage snapshot')
    return reply.status === 'ok'
      ? { kind: 'ok' as const, usage: reply.usage }
      : { kind: 'unsupported' as const }
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

  ctx.slots.inject('shell.overlay', () => ctx.slots.register({
    name: 'shell.overlay',
    id: 'ollama-cloud-model-picker',
    order: 100,
    inject: (): OllamaModelPickerFace => ({
      t,
      hooks: { ollamaModelPicker: picker },
      closePicker: picker.close,
      togglePickerModel: picker.toggle,
      adoptPickerModels: picker.adopt,
    }),
  }, OllamaModelPicker))

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
      fetchUsage,
      beginModelPicker: (initiallyPicked, onAdopt) => { picker.begin(onAdopt, initiallyPicked) },
      completeModelPicker: candidates => { picker.complete(candidates) },
      failModelPicker: message => { picker.fail(message) },
      closeModelPicker: picker.close,
    }),
  }, OllamaPluginCard))
}
