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

test('a failing specimen is contained with its name, message and component stack, and can be remounted', async () => {
  const root = createRoot(host)
  fault = 'membrane ruptured'
  await act(() => root.render(<SpecimenBoundary name="WetwareOS"><section><Specimen /></section></SpecimenBoundary>))

  const alert = host.querySelector('[role="alert"]')
  expect(alert?.querySelector('strong')?.textContent).toBe('WetwareOS')
  expect(alert?.querySelector('code')?.textContent).toBe('membrane ruptured')
  expect(alert?.querySelector('details pre')?.textContent).toMatch(/Specimen/)
  // React reports the caught error once; the boundary records it on the plate instead of logging it again.
  expect(errors.mock.calls.filter((call: unknown[]) => call.some((part: unknown) => String(part).includes('membrane ruptured') || (part instanceof Error && part.message === 'membrane ruptured')))).toHaveLength(1)

  // Still failing: a retry is contained again instead of escaping the boundary.
  await press('Remount specimen')
  expect(host.querySelector('[role="alert"] code')?.textContent).toBe('membrane ruptured')

  fault = null
  const before = mounts
  await press('Remount specimen')
  expect(host.querySelector('[role="alert"]')).toBeNull()
  expect(host.textContent).toBe('membrane intact')
  expect(mounts).toBe(before + 1)
  await act(() => root.unmount())
})

test('a thrown value that is not an Error is still reported by its text', async () => {
  function Thrower(): never { throw 'tectonic fault' }
  const root = createRoot(host)
  await act(() => root.render(<SpecimenBoundary name="StrataOS"><Thrower /></SpecimenBoundary>))
  expect(host.querySelector('[role="alert"] code')?.textContent).toBe('tectonic fault')
  await act(() => root.unmount())
})
