/** Ollama Cloud connection and model-catalog card for Plugin configuration. */

import { useEffect, useMemo, useState } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import type { SettingsScope } from '@deepseek-ai/dsh-client-runtime/client'
import type { InjectFace, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-settings-plugins/client'
import type {
  OllamaCatalogModelConfig,
  OllamaDiscoveryRequest,
  OllamaSettingsView,
} from '../client-contract.ts'
import type { OllamaSettingsKey } from './locales.ts'

/** Credential state exposed without returning the credential value. */
export interface OllamaCredentialState {
  /** Whether any Host credential layer supplies the reference. */
  configured: boolean
  /** Whether the writable credentials provider can replace it. */
  writable: boolean
}

/** Dependencies injected by the browser-plugin registration. */
export interface OllamaPluginCardFace {
  /** Localized card copy. */
  t: (key: OllamaSettingsKey) => string
  hooks: {
    /** Reactive Host-owned settings section. */
    ollamaSettings: SettingsScope<OllamaSettingsView>
  }
  /** Read value-free credential status for the section's reference. */
  describeCredential: () => Promise<OllamaCredentialState>
  /** Store changed settings and an optional replacement credential. */
  saveConfiguration: (settings: OllamaSettingsView, apiKey?: string) => Promise<void>
  /** Interrogate the draft endpoint without storing its one-shot key. */
  discoverModels: (request: OllamaDiscoveryRequest) => Promise<readonly OllamaCatalogModelConfig[]>
}

/** Props delivered by the Plugin configuration item slot. */
export type OllamaPluginCardProps =
  PropsRuntime<'settings.plugin.item'>
  & InjectFace<OllamaPluginCardFace>

interface ModelDraft {
  id: string
  name?: string
  description?: string
  contextWindow: string
  maxTokens: string
  vision?: boolean
  thinking?: boolean
  tools?: boolean
}

interface Draft {
  baseURL: string
  models: ModelDraft[]
}

type ModelPatch = {
  [Key in keyof ModelDraft]?: ModelDraft[Key] | undefined
}

const cardStyle: CSSProperties = {
  overflow: 'hidden',
  border: '1px solid var(--dsw-alias-border-l2)',
  borderRadius: 10,
  background: 'var(--dsw-alias-bg-module-platform)',
}
const headerStyle: CSSProperties = {
  boxSizing: 'border-box',
  width: '100%',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 16,
  border: 0,
  padding: '13px 14px',
  background: 'transparent',
  color: 'var(--dsw-alias-label-primary)',
  font: 'inherit',
  textAlign: 'left',
  cursor: 'pointer',
}
const bodyStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 18,
  borderTop: '1px solid var(--dsw-alias-border-l2)',
  padding: '16px 14px 18px',
}
const sectionStyle: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 12 }
const sectionTitleStyle: CSSProperties = {
  margin: 0,
  fontSize: 14,
  lineHeight: '20px',
  fontWeight: 600,
  color: 'var(--dsw-alias-label-primary)',
}
const fieldStyle: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 6 }
const labelStyle: CSSProperties = { fontSize: 13, color: 'var(--dsw-alias-label-secondary)' }
const hintStyle: CSSProperties = { margin: 0, fontSize: 12, color: 'var(--dsw-alias-label-tertiary)' }
const inputStyle: CSSProperties = {
  boxSizing: 'border-box',
  width: '100%',
  minHeight: 36,
  border: '1px solid var(--dsw-alias-border-l2)',
  borderRadius: 8,
  padding: '7px 10px',
  background: 'var(--dsw-alias-bg-layer-1)',
  color: 'var(--dsw-alias-label-primary)',
  font: 'inherit',
}
const rowStyle: CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10 }
const actionsStyle: CSSProperties = { display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 10 }
const buttonStyle: CSSProperties = {
  minHeight: 34,
  border: '1px solid var(--dsw-alias-border-l2)',
  borderRadius: 18,
  padding: '6px 14px',
  background: 'var(--dsw-alias-bg-layer-1)',
  color: 'var(--dsw-alias-label-primary)',
  font: 'inherit',
  cursor: 'pointer',
}
const primaryButtonStyle: CSSProperties = {
  ...buttonStyle,
  borderColor: 'var(--dsw-alias-brand-primary)',
  background: 'var(--dsw-alias-brand-primary)',
  color: 'var(--dsw-alias-label-on-brand)',
}
const modelStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 10,
  border: '1px solid var(--dsw-alias-border-l2)',
  borderRadius: 8,
  padding: 12,
}
const capabilitiesStyle: CSSProperties = { display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 14 }
const statusStyle: CSSProperties = { margin: 0, fontSize: 13, color: 'var(--dsw-alias-label-secondary)' }
const errorStyle: CSSProperties = { ...statusStyle, color: 'var(--dsw-alias-state-error-primary)' }

function modelDraftOf(model: OllamaCatalogModelConfig): ModelDraft {
  return {
    ...model,
    contextWindow: model.contextWindow === undefined ? '' : String(model.contextWindow),
    maxTokens: model.maxTokens === undefined ? '' : String(model.maxTokens),
  }
}

function draftOf(settings: OllamaSettingsView): Draft {
  return {
    baseURL: settings.baseURL,
    models: settings.models.map(modelDraftOf),
  }
}

function integerOf(text: string): number | undefined {
  if (text.trim().length === 0) return undefined
  const value = Number(text)
  return Number.isSafeInteger(value) && value > 0 ? value : Number.NaN
}

function validURL(value: string): boolean {
  try {
    const url = new URL(value)
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}

function sameDraft(left: Draft, right: Draft): boolean {
  return JSON.stringify(left) === JSON.stringify(right)
}

function modelSettingsOf(draft: ModelDraft): OllamaCatalogModelConfig {
  const { contextWindow: contextText, maxTokens: maxText, ...model } = draft
  const contextWindow = integerOf(contextText)
  const maxTokens = integerOf(maxText)
  return {
    ...model,
    id: model.id.trim(),
    ...contextWindow === undefined ? {} : { contextWindow },
    ...maxTokens === undefined ? {} : { maxTokens },
  }
}

function settingsOf(draft: Draft, current: OllamaSettingsView): OllamaSettingsView {
  return {
    ...current,
    baseURL: draft.baseURL.trim(),
    models: draft.models.map(modelSettingsOf),
  }
}

function modelFailure(models: readonly ModelDraft[]): boolean {
  const ids = new Set<string>()
  for (const model of models) {
    const id = model.id.trim()
    if (id.length === 0 || ids.has(id)) return true
    ids.add(id)
    if (Number.isNaN(integerOf(model.contextWindow)) || Number.isNaN(integerOf(model.maxTokens))) return true
  }
  return false
}

function messageOf(error: unknown, fallback: string): string {
  return error instanceof Error && error.message.length > 0 ? error.message : fallback
}

function Capability({ label, checked, disabled, onChange }: {
  label: string
  checked: boolean
  disabled: boolean
  onChange: (checked: boolean) => void
}): ReactNode {
  return (
    <label style={{ ...labelStyle, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(event) => { onChange(event.target.checked) }}
      />
      {label}
    </label>
  )
}

/** Render the single-package Ollama Cloud contribution under Plugin configuration. */
export function OllamaPluginCard(props: OllamaPluginCardProps): ReactNode {
  const { t } = props
  const snapshot = props.useOllamaSettings(value => value)
  const [open, setOpen] = useState(false)
  const initial = useMemo(() => snapshot.value === undefined ? undefined : draftOf(snapshot.value), [snapshot.value])
  const [source, setSource] = useState<Draft | undefined>(initial)
  const [draft, setDraft] = useState<Draft | undefined>(initial)
  const [sourceRevision, setSourceRevision] = useState<number | undefined>(snapshot.revision)
  const [apiKey, setApiKey] = useState('')
  const [credential, setCredential] = useState<OllamaCredentialState | undefined>(undefined)
  const [busy, setBusy] = useState(false)
  const [fetching, setFetching] = useState(false)
  const [failure, setFailure] = useState<string | undefined>(undefined)
  const [notice, setNotice] = useState<string | undefined>(undefined)
  const [candidates, setCandidates] = useState<readonly OllamaCatalogModelConfig[] | undefined>(undefined)
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const dirty = source !== undefined && draft !== undefined && (!sameDraft(source, draft) || apiKey.length > 0)

  useEffect(() => {
    if (snapshot.status !== 'ready' || snapshot.value === undefined) return
    if (snapshot.revision === sourceRevision) return
    if (dirty) return
    const next = draftOf(snapshot.value)
    setSource(next)
    setDraft(next)
    setSourceRevision(snapshot.revision)
  }, [dirty, snapshot.revision, snapshot.status, snapshot.value, sourceRevision])

  const refreshCredential = async (): Promise<void> => {
    try {
      setCredential(await props.describeCredential())
    } catch {
      setCredential(undefined)
    }
  }
  useEffect(() => {
    if (!open || snapshot.status !== 'ready') return
    void refreshCredential()
  }, [open, snapshot.status, snapshot.value?.apiKeyEnv])

  if (snapshot.status === 'unavailable') return null
  const title = t('title')
  const disabled = snapshot.status !== 'ready' || !snapshot.writable || busy
  const keyInvalid = apiKey.length > 0 && apiKey.trim().length === 0
  const invalid = draft !== undefined && (
    !validURL(draft.baseURL.trim()) || modelFailure(draft.models) || keyInvalid
  )

  const patchDraft = (next: Partial<Draft>): void => {
    setDraft(current => current === undefined ? current : { ...current, ...next })
    setFailure(undefined)
    setNotice(undefined)
  }
  const patchModel = (index: number, patch: ModelPatch): void => {
    if (draft === undefined) return
    patchDraft({
      models: draft.models.map((model, at) => {
        if (at !== index) return model
        const next: ModelDraft = { ...model }
        if (patch.id !== undefined) next.id = patch.id
        if ('name' in patch) {
          if (patch.name === undefined) delete next.name
          else next.name = patch.name
        }
        if ('description' in patch) {
          if (patch.description === undefined) delete next.description
          else next.description = patch.description
        }
        if (patch.contextWindow !== undefined) next.contextWindow = patch.contextWindow
        if (patch.maxTokens !== undefined) next.maxTokens = patch.maxTokens
        if ('vision' in patch) {
          if (patch.vision === undefined) delete next.vision
          else next.vision = patch.vision
        }
        if ('thinking' in patch) {
          if (patch.thinking === undefined) delete next.thinking
          else next.thinking = patch.thinking
        }
        if ('tools' in patch) {
          if (patch.tools === undefined) delete next.tools
          else next.tools = patch.tools
        }
        return next
      }),
    })
  }
  const removeModel = (index: number): void => {
    if (draft === undefined) return
    patchDraft({ models: draft.models.filter((_, at) => at !== index) })
  }

  const fetchModels = async (): Promise<void> => {
    if (draft === undefined) return
    setFetching(true)
    setFailure(undefined)
    setNotice(undefined)
    try {
      const found = await props.discoverModels({
        baseURL: draft.baseURL.trim(),
        ...apiKey.trim().length === 0 ? {} : { apiKey: apiKey.trim() },
      })
      if (found.length === 0) {
        setFailure(t('fetchEmpty'))
        return
      }
      setCandidates(found)
      setPicked(new Set(found.map(model => model.id)))
    } catch (error: unknown) {
      setFailure(messageOf(error, t('requestFailed')))
    } finally {
      setFetching(false)
    }
  }

  const addPicked = (): void => {
    if (draft === undefined || candidates === undefined) return
    const merged = new Map(draft.models.map(model => [model.id, model]))
    for (const candidate of candidates) {
      if (!picked.has(candidate.id)) continue
      merged.set(candidate.id, { ...merged.get(candidate.id), ...modelDraftOf(candidate) })
    }
    patchDraft({ models: [...merged.values()] })
    setCandidates(undefined)
    setPicked(new Set())
  }

  const discard = (): void => {
    if (source !== undefined) setDraft(structuredClone(source))
    setApiKey('')
    setCandidates(undefined)
    setPicked(new Set())
    setFailure(undefined)
    setNotice(undefined)
  }

  const save = async (): Promise<void> => {
    if (draft === undefined || snapshot.value === undefined || invalid) return
    setBusy(true)
    setFailure(undefined)
    setNotice(undefined)
    try {
      const settings = settingsOf(draft, snapshot.value)
      await props.saveConfiguration(settings, apiKey.trim().length === 0 ? undefined : apiKey.trim())
      const next = draftOf(settings)
      setSource(next)
      setDraft(next)
      setSourceRevision(snapshot.revision)
      setApiKey('')
      setNotice(t('saved'))
      await refreshCredential()
    } catch (error: unknown) {
      setFailure(messageOf(error, t('requestFailed')))
    } finally {
      setBusy(false)
    }
  }

  let validation: string | undefined
  if (draft !== undefined && !validURL(draft.baseURL.trim())) validation = t('invalidBaseURL')
  else if (draft !== undefined && modelFailure(draft.models)) validation = t('invalidModel')
  else if (keyInvalid) validation = t('invalidApiKey')

  return (
    <li style={cardStyle}>
      <button
        type="button"
        style={headerStyle}
        aria-expanded={open}
        aria-label={`${t(open ? 'collapse' : 'expand')}: ${title}`}
        onClick={() => { setOpen(!open) }}
      >
        <span style={{ display: 'flex', minWidth: 0, flexDirection: 'column', gap: 3 }}>
          <span style={{ fontSize: 14, lineHeight: '20px', fontWeight: 600 }}>{title}</span>
          <span style={{ fontSize: 13, lineHeight: '18px', color: 'var(--dsw-alias-label-tertiary)' }}>
            {t('description')}
          </span>
        </span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
          {dirty ? <span style={hintStyle}>{t('unsaved')}</span> : null}
          <span aria-hidden="true" style={{ fontSize: 18, transform: open ? 'rotate(180deg)' : 'none' }}>⌄</span>
        </span>
      </button>
      {open
        ? (
          <div style={bodyStyle}>
            {snapshot.status === 'loading' ? <p style={statusStyle}>{t('loading')}</p> : null}
            {snapshot.status === 'ready' && !snapshot.writable ? <p style={statusStyle}>{t('readOnly')}</p> : null}
            {draft === undefined
              ? null
              : (
                <>
                  <section style={sectionStyle}>
                    <h3 style={sectionTitleStyle}>{t('connection')}</h3>
                    <label style={fieldStyle}>
                      <span style={labelStyle}>{t('apiKey')}</span>
                      <input
                        style={inputStyle}
                        type="password"
                        aria-label={t('apiKey')}
                        autoComplete="off"
                        value={apiKey}
                        placeholder={credential?.configured ? t('apiKeyConfigured') : t('apiKeyPlaceholder')}
                        disabled={busy || credential?.writable === false}
                        onChange={(event) => { setApiKey(event.target.value); setFailure(undefined); setNotice(undefined) }}
                      />
                      <span style={hintStyle}>{credential?.configured ? t('apiKeyConfigured') : t('apiKeyUnset')}</span>
                    </label>
                    <label style={fieldStyle}>
                      <span style={labelStyle}>{t('baseURL')}</span>
                      <input
                        style={inputStyle}
                        type="url"
                        aria-label={t('baseURL')}
                        value={draft.baseURL}
                        disabled={disabled}
                        onChange={(event) => { patchDraft({ baseURL: event.target.value }) }}
                      />
                    </label>
                  </section>

                  <section style={sectionStyle} aria-label={t('models')}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                      <div>
                        <h3 style={sectionTitleStyle}>{t('models')}</h3>
                        <p style={hintStyle}>{snapshot.user !== undefined ? t('customized') : t('inherited')}</p>
                      </div>
                      <button
                        type="button"
                        style={buttonStyle}
                        disabled={fetching || invalid || snapshot.status !== 'ready'}
                        onClick={() => { void fetchModels() }}
                      >
                        {t(fetching ? 'fetchingModels' : 'fetchModels')}
                      </button>
                    </div>
                    {draft.models.map((model, index) => (
                      <div key={`${String(index)}:${model.id}`} style={modelStyle}>
                        <div style={rowStyle}>
                          <label style={fieldStyle}>
                            <span style={labelStyle}>{t('modelId')}</span>
                            <input
                              style={inputStyle}
                              value={model.id}
                              disabled={disabled}
                              onChange={(event) => { patchModel(index, { id: event.target.value }) }}
                            />
                          </label>
                          <label style={fieldStyle}>
                            <span style={labelStyle}>{t('modelName')}</span>
                            <input
                              style={inputStyle}
                              value={model.name ?? ''}
                              disabled={disabled}
                              onChange={(event) => { patchModel(index, { name: event.target.value || undefined }) }}
                            />
                          </label>
                          <label style={fieldStyle}>
                            <span style={labelStyle}>{t('modelContext')}</span>
                            <input
                              style={inputStyle}
                              inputMode="numeric"
                              value={model.contextWindow}
                              disabled={disabled}
                              onChange={(event) => { patchModel(index, { contextWindow: event.target.value }) }}
                            />
                          </label>
                          <label style={fieldStyle}>
                            <span style={labelStyle}>{t('modelOutput')}</span>
                            <input
                              style={inputStyle}
                              inputMode="numeric"
                              value={model.maxTokens}
                              disabled={disabled}
                              onChange={(event) => { patchModel(index, { maxTokens: event.target.value }) }}
                            />
                          </label>
                        </div>
                        <div style={capabilitiesStyle}>
                          <Capability label={t('vision')} checked={model.vision === true} disabled={disabled} onChange={(vision) => { patchModel(index, { vision }) }} />
                          <Capability label={t('thinking')} checked={model.thinking === true} disabled={disabled} onChange={(thinking) => { patchModel(index, { thinking }) }} />
                          <Capability label={t('tools')} checked={model.tools === true} disabled={disabled} onChange={(tools) => { patchModel(index, { tools }) }} />
                          {model.thinking === true ? <span style={hintStyle}>{t('reasoningLevels')}</span> : null}
                          <button type="button" style={buttonStyle} disabled={disabled} onClick={() => { removeModel(index) }}>
                            {t('remove')}
                          </button>
                        </div>
                      </div>
                    ))}
                    <button
                      type="button"
                      style={buttonStyle}
                      disabled={disabled}
                      onClick={() => {
                        patchDraft({ models: [...draft.models, { id: '', contextWindow: '', maxTokens: '' }] })
                      }}
                    >
                      {t('addModel')}
                    </button>
                  </section>
                </>
              )}

            {candidates === undefined
              ? null
              : (
                <section style={modelStyle} aria-label={t('discoveredModels')}>
                  <h3 style={sectionTitleStyle}>{t('discoveredModels')}</h3>
                  {candidates.map(model => (
                    <label key={model.id} style={{ ...labelStyle, display: 'flex', alignItems: 'center', gap: 8 }}>
                      <input
                        type="checkbox"
                        checked={picked.has(model.id)}
                        onChange={() => {
                          setPicked((current) => {
                            const next = new Set(current)
                            if (!next.delete(model.id)) next.add(model.id)
                            return next
                          })
                        }}
                      />
                      <span>{model.name ?? model.id}</span>
                      {model.contextWindow === undefined ? null : <span style={hintStyle}>{String(model.contextWindow)}</span>}
                      {model.vision === true ? <span style={hintStyle}>{t('vision')}</span> : null}
                      {model.thinking === true ? <span style={hintStyle}>{t('thinking')}</span> : null}
                      {model.tools === true ? <span style={hintStyle}>{t('tools')}</span> : null}
                    </label>
                  ))}
                  <div style={actionsStyle}>
                    <button type="button" style={buttonStyle} onClick={() => { setCandidates(undefined); setPicked(new Set()) }}>
                      {t('close')}
                    </button>
                    <button type="button" style={primaryButtonStyle} disabled={picked.size === 0} onClick={addPicked}>
                      {t('addSelected')}
                    </button>
                  </div>
                </section>
              )}

            {validation === undefined ? null : <p style={errorStyle}>{validation}</p>}
            {failure === undefined ? null : <p style={errorStyle}>{failure}</p>}
            {notice === undefined ? null : <p style={statusStyle}>{notice}</p>}
            <div style={actionsStyle}>
              <button type="button" style={buttonStyle} disabled={!dirty || busy} onClick={discard}>{t('discard')}</button>
              <button
                type="button"
                style={primaryButtonStyle}
                disabled={!dirty || invalid || disabled}
                onClick={() => { void save() }}
              >
                {t(busy ? 'saving' : 'save')}
              </button>
            </div>
          </div>
        )
        : null}
    </li>
  )
}
