/**
 * The details rail's open state, shared by the rail and the header's control
 * (D94). The rail owns the decision (the setting's default and the reader's own
 * choice); the header's button reads that decision and asks the rail to flip it.
 * The conversation also reports whether it holds a session the rail can
 * describe, so the header's control stands disabled on the hero page.
 */
type Listener = () => void

/** The reader's standing choice for one session: the setting's default, open, or closed. */
export type RailChoiceMode = 'default' | 'open' | 'closed'

/**
 * Whether the rail stands open. The setting decides only the `default` mode; a
 * press stands until the session changes, and the host's own right column takes
 * the side first.
 */
export function railOpensByChoice(mode: RailChoiceMode, preferred: boolean, hasSession: boolean, hostColumn: boolean) {
  return !hostColumn && (mode === 'open' || (mode === 'default' && hasSession && preferred))
}

let open = false
let toggle: (() => void) | null = null
let available = false
const listeners = new Set<Listener>()
const availabilityListeners = new Set<Listener>()

/** Whether the rail stands on the page right now. */
export function railOpen() {
  return open
}

/** Record the rail's own decision; a changed value wakes the header's control. */
export function setRailOpen(next: boolean) {
  if (open === next) return
  open = next
  for (const listener of listeners) listener()
}

/** Follow the rail's decision. */
export function subscribeRail(listener: Listener) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** The rail hands its own flip over here while it is mounted; its teardown gives it back. */
export function setRailToggle(next: (() => void) | null) {
  toggle = next
  return next
}

/** Flip the rail: open it, or put it away for this session. */
export function toggleRail() {
  toggle?.()
}

/** Whether the conversation currently holds a session the rail can describe. */
export function sessionAvailable() {
  return available
}

/** Record the conversation's own answer; a changed value wakes the header's control. */
export function setSessionAvailable(next: boolean) {
  if (available === next) return
  available = next
  for (const listener of availabilityListeners) listener()
}

/** Follow the conversation's answer. */
export function subscribeSessionAvailable(listener: Listener) {
  availabilityListeners.add(listener)
  return () => availabilityListeners.delete(listener)
}

/** Clear the answer with the generation that wrote it. */
export function clearSessionPanelState() {
  setSessionAvailable(false)
  setRailOpen(false)
  setRailToggle(null)
}
