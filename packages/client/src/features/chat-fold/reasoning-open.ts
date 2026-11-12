import { requestFrame } from '@dsh-claude-style/engine/frame'
import { observeMatches, subscribeMutations } from '@dsh-claude-style/engine/bus'
import { ROW_PHASE_ATTRIBUTE, RUNNING_STATE, THINK_ROW_SELECTOR } from '@dsh-claude-style/contracts/dom'
import { captureComposerCaret, composerComposing, focusKeepingComposerCaret } from '../../shared/composer-caret'
import { beginChatFoldToggle, endChatFoldToggle, isChatFoldToggle, subscribeFoldReaderEvents } from './fold-toggle'

/* Host ReasoningRow starts folded and renders no body until it opens. The
   first reasoning text therefore cannot be waited for: the row is pressed as
   soon as it enters `running`, once for that phase. A reader's own fold is
   remembered per phase and is never overridden; the next phase may open once
   more. The press is marked so the fold door and the token reveal treat it as
   the skin's own. */

export function createReasoningOpen() {
  /** The phase a row was in when the reader last touched it. */
  const touchedIn = new WeakMap<Element, string>()
  /** The phase a row was last pressed in, so a press that changed nothing is not retried. */
  const attemptedIn = new WeakMap<Element, string>()
  /** The rows the mutation batch put under this feature's hand. */
  const pending = new Set<Element>()
  let queued = false
  let cancelFrame: (() => void) | null = null
  let stopped = false

  function controlOf(row: Element) {
    return row.querySelector<HTMLElement>('[data-disclosure-row][aria-expanded], [role="button"][aria-expanded], button[aria-expanded]')
  }

  function expandedOf(row: Element) {
    if (row.getAttribute('aria-expanded') === 'true') return true
    const control = controlOf(row)
    return control !== null && control.getAttribute('aria-expanded') === 'true'
  }

  function shouldOpen(row: Element) {
    if (!row.isConnected) return false
    if (row.getAttribute(ROW_PHASE_ATTRIBUTE) !== RUNNING_STATE) return false
    if (touchedIn.get(row) === RUNNING_STATE) return false
    if (expandedOf(row)) return false
    if (attemptedIn.get(row) === RUNNING_STATE) return false
    return controlOf(row) !== null
  }

  function press(row: Element) {
    const control = controlOf(row)
    if (control === null) return
    // A focus or selection moved under an uncommitted composition makes the
    // browser drop the letters typed so far; the row is settled after it lands.
    if (composerComposing()) return
    attemptedIn.set(row, RUNNING_STATE)
    const previousFocus = document.activeElement
    const caret = captureComposerCaret()
    beginChatFoldToggle()
    try {
      control.click()
    } finally {
      endChatFoldToggle()
    }
    if (previousFocus instanceof HTMLElement && previousFocus.isConnected) {
      focusKeepingComposerCaret(previousFocus, caret)
    }
    if (document.activeElement === control) control.blur()
  }

  function queue(row: Element) {
    if (stopped || !row.matches(THINK_ROW_SELECTOR)) return
    pending.add(row)
    if (queued) return
    queued = true
    cancelFrame = requestFrame({
      read() {
        cancelFrame = null
        queued = false
      },
      write() {
        const rows = [...pending]
        pending.clear()
        for (const row of rows) {
          if (shouldOpen(row)) press(row)
        }
      },
    })
  }

  const stopMutations = subscribeMutations(document.body, {
    subtree: true,
    attributeFilter: [ROW_PHASE_ATTRIBUTE, 'aria-expanded'],
    attributeOldValue: true,
  }, (records) => {
    for (const record of records) {
      const target = record.target instanceof Element ? record.target : record.target.parentElement
      const row = target?.closest(THINK_ROW_SELECTOR) ?? null
      if (row !== null) {
        // A batch may carry the whole departure and return, so the record's old
        // value is what tells that the running phase ended. Both memories name
        // the running phase alone; the next one starts with a clean slate.
        if (record.attributeName === ROW_PHASE_ATTRIBUTE && record.oldValue === RUNNING_STATE) {
          touchedIn.delete(row)
          attemptedIn.delete(row)
        }
        queue(row)
      }
    }
  })

  // The rows standing now and the ones a later batch mounts: the shared match
  // registry walks a new transcript once for every reader on the page, and the
  // frame pass presses only the rows that are still here.
  const thinkRows = observeMatches<HTMLElement>(THINK_ROW_SELECTOR, () => {
    for (const row of thinkRows.all()) queue(row)
  })

  const stopReaderEvents = subscribeFoldReaderEvents((event) => {
    if (isChatFoldToggle()) return
    const target = event.target
    if (!(target instanceof Element)) return
    const row = target.closest(THINK_ROW_SELECTOR)
    if (row === null) return
    touchedIn.set(row, row.getAttribute(ROW_PHASE_ATTRIBUTE) ?? '')
  }, () => {
    for (const row of thinkRows.all()) queue(row)
  })

  for (const row of thinkRows.all()) queue(row)

  return {
    stop() {
      stopped = true
      if (cancelFrame !== null) cancelFrame()
      cancelFrame = null
      pending.clear()
      stopMutations()
      stopReaderEvents()
      thinkRows.release()
    },
  }
}
