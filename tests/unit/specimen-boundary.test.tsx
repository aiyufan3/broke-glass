// @vitest-environment happy-dom
import { act, useEffect } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import SpecimenBoundary from '../../src/components/SpecimenBoundary'

declare global { var IS_REACT_ACT_ENVIRONMENT: boolean }
globalThis.IS_REACT_ACT_ENVIRONMENT = true

let fault: string | null = null
let mounts = 0

function Specimen() {
  useEffect(() => { mounts++ }, [])
  if (fault) throw new Error(fault)
  return <p>membrane intact</p>
}

let host: HTMLDivElement
let errors: ReturnType<typeof vi.spyOn>
beforeEach(() => {
  fault = null
  mounts = 0
  host = document.createElement('div')
  document.body.append(host)
  errors = vi.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => {
  errors.mockRestore()
  host.remove()
})

const press = (label: string) => act(() => {
  const button = [...host.querySelectorAll('button')].find((element) => element.textContent === label)
  if (!button) throw new Error(`No button labelled ${label}`)
  button.click()
})

test('a failing specimen is contained, logged with its name and message, and can be remounted', async () => {
  const root = createRoot(host)
  fault = 'membrane ruptured'
  await act(() => root.render(<SpecimenBoundary name="WetwareOS"><Specimen /></SpecimenBoundary>))

  const alert = host.querySelector('[role="alert"]')
  expect(alert?.textContent).toContain('WetwareOS')
  expect(alert?.textContent).toContain('membrane ruptured')
  expect(errors).toHaveBeenCalledWith('WetwareOS failed to render and was contained.', expect.objectContaining({ message: 'membrane ruptured' }), expect.any(String))

  // Still failing: a retry is contained again instead of escaping the boundary.
  await press('Remount specimen')
  expect(host.querySelector('[role="alert"]')?.textContent).toContain('membrane ruptured')

  fault = null
  await press('Remount specimen')
  expect(host.querySelector('[role="alert"]')).toBeNull()
  expect(host.textContent).toBe('membrane intact')
  await act(() => root.unmount())
})

test('a remount starts the specimen from a fresh mount rather than reusing its old instance', async () => {
  const root = createRoot(host)
  await act(() => root.render(<SpecimenBoundary name="FieldOS"><Specimen /></SpecimenBoundary>))
  expect(mounts).toBe(1)
  fault = 'singularity diverged'
  await act(() => root.render(<SpecimenBoundary name="FieldOS"><Specimen key="rerender" /></SpecimenBoundary>))
  expect(host.querySelector('[role="alert"]')?.textContent).toContain('singularity diverged')
  fault = null
  const before = mounts
  await press('Remount specimen')
  expect(mounts).toBe(before + 1)
  expect(host.textContent).toBe('membrane intact')
  await act(() => root.unmount())
})
