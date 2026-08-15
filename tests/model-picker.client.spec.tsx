// @vitest-environment jsdom

import { useSyncExternalStore } from 'react'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  OllamaModelPicker,
  OllamaModelPickerController,
} from '../src/client/OllamaModelPicker.tsx'
import type { OllamaModelPickerProps } from '../src/client/OllamaModelPicker.tsx'
import { en } from '../src/client/locales.ts'

afterEach(() => { cleanup() })

function renderPicker(controller: OllamaModelPickerController): void {
  const useOllamaModelPicker: OllamaModelPickerProps['useOllamaModelPicker'] = selector => selector(
    useSyncExternalStore(controller.subscribe, controller.getSnapshot),
  )
  render(<OllamaModelPicker {...({
    t: key => en[key],
    useOllamaModelPicker,
    closePicker: controller.close,
    togglePickerModel: controller.toggle,
    adoptPickerModels: controller.adopt,
  } as OllamaModelPickerProps)} />)
}

describe('OllamaModelPicker', () => {
  it('uses the frame overlay dialog lifecycle and adopts only selected models', () => {
    const controller = new OllamaModelPickerController()
    const adopted = vi.fn()
    controller.begin(adopted)
    controller.complete([
      { id: 'gemma3', vision: true },
      { id: 'qwen3', thinking: true },
    ])
    renderPicker(controller)

    const dialog = screen.getByRole('dialog', { name: en.pickerTitle })
    expect(dialog.parentElement?.parentElement).toBe(document.body)
    const choices = screen.getAllByRole<HTMLInputElement>('checkbox')
    expect(choices.map(choice => choice.checked)).toEqual([true, true])
    fireEvent.click(choices[1] as HTMLInputElement)
    fireEvent.click(screen.getByRole('button', { name: en.addSelected }))

    expect(adopted).toHaveBeenCalledWith([{ id: 'gemma3', vision: true }])
    expect(screen.queryByRole('dialog', { name: en.pickerTitle })).toBeNull()
  })

  it('opens immediately with loading and keeps failures visible', () => {
    const controller = new OllamaModelPickerController()
    controller.begin(vi.fn())
    renderPicker(controller)

    expect(screen.getByRole('dialog', { name: en.pickerTitle }).getAttribute('aria-busy')).toBe('true')
    expect(screen.getByRole('status').textContent).toBe(en.pickerLoading)
    expect(screen.getByRole<HTMLButtonElement>('button', { name: en.addSelected }).disabled).toBe(true)

    act(() => { controller.fail('could not reach endpoint') })

    expect(screen.getByRole('alert').textContent).toBe('could not reach endpoint')
  })

  it('closes on Escape without adopting', () => {
    const controller = new OllamaModelPickerController()
    const adopted = vi.fn()
    controller.begin(adopted)
    renderPicker(controller)

    fireEvent.keyDown(document, { key: 'Escape' })

    expect(adopted).not.toHaveBeenCalled()
    expect(screen.queryByRole('dialog', { name: en.pickerTitle })).toBeNull()
  })
})
