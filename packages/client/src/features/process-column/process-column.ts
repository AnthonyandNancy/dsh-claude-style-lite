import { subscribeMutations } from '@dsh-claude-style/engine/bus'
import { THINK_ROW_SELECTOR } from '@dsh-claude-style/contracts/dom'
import { PROCESS_COLUMN_ATTR } from '../../constants'

/** On a thinking row: `open` while its disclosure control is expanded. */
const THINK_OPEN_ATTRIBUTE = 'data-dsh-claude-think-open'

/**
 * Project the host's `aria-expanded` onto the row, so the column stylesheet can
 * tell a folded thought from an open one without asking the tree again.
 */
function syncThinkOpen() {
  for (const row of document.querySelectorAll<HTMLElement>(THINK_ROW_SELECTOR)) {
    const open = row.getAttribute('aria-expanded') === 'true'
      || row.querySelector('[data-disclosure-row][aria-expanded="true"], [role="button"][aria-expanded="true"]') !== null
    if (open !== row.hasAttribute(THINK_OPEN_ATTRIBUTE)) row.toggleAttribute(THINK_OPEN_ATTRIBUTE, open)
  }
}

/**
 * Draws an open process group's rows as one card (process-column.css). The
 * feature runs only while the column layout is chosen, so the attribute the
 * stylesheet reads comes off with it and the flat layout is the host's own.
 */
export function install() {
  document.body.setAttribute(PROCESS_COLUMN_ATTR, '')
  syncThinkOpen()
  const stop = subscribeMutations(document.body, {
    childList: true,
    subtree: true,
    attributeFilter: ['aria-expanded'],
  }, syncThinkOpen)
  return () => {
    stop()
    for (const row of document.querySelectorAll(`[${THINK_OPEN_ATTRIBUTE}]`)) row.removeAttribute(THINK_OPEN_ATTRIBUTE)
    document.body.removeAttribute(PROCESS_COLUMN_ATTR)
  }
}
