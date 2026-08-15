// @vitest-environment jsdom

import { useSyncExternalStore } from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
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
    controller.open([
      { id: 'gemma3', vision: true },
      { id: 'qwen3', thinking: true },
    ], adopted)
    renderPicker(controller)

    expect(screen.getByRole('dialog', { name: en.pickerTitle })).toBeTruthy()
    const choices = screen.getAllByRole<HTMLInputElement>('checkbox')
    expect(choices.map(choice => choice.checked)).toEqual([true, true])
    fireEvent.click(choices[1] as HTMLInputElement)
    fireEvent.click(screen.getByRole('button', { name: en.addSelected }))

    expect(adopted).toHaveBeenCalledWith([{ id: 'gemma3', vision: true }])
    expect(screen.queryByRole('dialog', { name: en.pickerTitle })).toBeNull()
  })

  it('closes on Escape without adopting', () => {
    const controller = new OllamaModelPickerController()
    const adopted = vi.fn()
    controller.open([{ id: 'gemma3' }], adopted)
    renderPicker(controller)

    fireEvent.keyDown(document, { key: 'Escape' })

    expect(adopted).not.toHaveBeenCalled()
    expect(screen.queryByRole('dialog', { name: en.pickerTitle })).toBeNull()
  })
})
