import { useEffect, useRef } from 'react'
import type { RefObject } from 'react'
import { modules } from '../data/osData'
import type { ModuleId } from '../data/osData'

const FOCUSABLE = 'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

function reachable(element: Element | null): element is HTMLElement {
  return element instanceof HTMLElement && element.isConnected && !element.closest('[inert]') && element.matches(FOCUSABLE)
}

type Find = {
  /** Selector of the open tool's root, inside the host. */
  tool: string
  /** Selector of the controls that open a module from the home state: one per module, in registry order. */
  launchers: string
}

/**
 * The keyboard contract every paradigm keeps, whatever its geometry: opening a tool moves focus
 * into it, and closing it returns focus to the control the operator opened it from, or to that
 * module's launcher. Nothing is shared but the rule; each paradigm says where its tool and launchers are.
 */
export function useToolFocus(host: RefObject<HTMLElement | null>, active: ModuleId | null, interactive: boolean, find: Find) {
  const latest = useRef(find)
  const shown = useRef<ModuleId | null>(null)
  const origin = useRef<HTMLElement | null>(null)
  const mounted = useRef(false)
  useEffect(() => { latest.current = find })

  // Whatever held focus inside the paradigm before a tool opened is where closing it leads back to.
  useEffect(() => {
    const element = host.current
    if (!element || !interactive) return
    const remember = (event: FocusEvent) => {
      // A tool's own controls take focus as it mounts, before this hook has seen it open; they are not an origin.
      if (!shown.current && event.target instanceof HTMLElement && !event.target.closest(latest.current.tool)) origin.current = event.target
    }
    element.addEventListener('focusin', remember)
    return () => element.removeEventListener('focusin', remember)
  }, [host, interactive])

  useEffect(() => {
    const before = shown.current
    const first = !mounted.current
    mounted.current = true
    shown.current = active
    const root = host.current
    // A paradigm that mounts with a tool already open leaves focus where it is: the operator is switching
    // paradigms, not opening a tool, and the number keys must keep working.
    if (!interactive || !root || before === active || first) return
    const focused = document.activeElement
    // Focus that the operator has placed outside the paradigm, on the lab's own controls, is theirs to keep.
    if (focused instanceof HTMLElement && focused !== document.body && !root.contains(focused)) return
    if (active) {
      const tool = root.querySelector<HTMLElement>(latest.current.tool)
      if (!tool || tool.contains(focused)) return
      // A command prompt that outlives the tool (QuantumOS) keeps the focus it is being typed in.
      if (focused instanceof HTMLElement && focused.matches('[data-os-command]') && reachable(focused)) return
      // Into the tool: its command prompt if it has one, otherwise its first button. Never a text field
      // the operator did not ask for, which would raise a keyboard on touch and swallow shortcuts.
      const usable = [...tool.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((element) => !element.closest('[inert]'))
      const entry = usable.find((element) => element.matches('[data-os-command]')) ?? usable.find((element) => element.matches('button')) ?? usable[0]
      entry?.focus({ preventScroll: true })
      return
    }
    if (!before) return
    // Back to where the operator came from, unless that was another module's launcher: a tool that was
    // reached from inside another one closes onto its own launcher.
    const all = [...root.querySelectorAll<HTMLElement>(latest.current.launchers)]
    const launcher = all[modules.findIndex((module) => module.id === before)] ?? null
    const from = origin.current
    const back = reachable(from) && (from === launcher || !all.includes(from)) ? from : launcher
    back?.focus({ preventScroll: true })
    if (document.activeElement !== back) launcher?.focus({ preventScroll: true })
  }, [host, active, interactive])
}
