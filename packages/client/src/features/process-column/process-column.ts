import { observeMatches, subscribeMutations } from '@dsh-claude-style/engine/bus'
import { THINK_ROW_SELECTOR } from '@dsh-claude-style/contracts/dom'
import { PROCESS_COLUMN_ATTR } from '../../constants'

/** On a thinking row: `open` while its disclosure control is expanded. */
const THINK_OPEN_ATTRIBUTE = 'data-dsh-claude-think-open'

/**
 * Project the host's `aria-expanded` onto the row, so the column stylesheet can
 * tell a folded thought from an open one without asking the tree again.
 */
function syncThinkOpen(row: HTMLElement) {
  const open = row.getAttribute('aria-expanded') === 'true'
    || row.querySelector('[data-disclosure-row][aria-expanded="true"], [role="button"][aria-expanded="true"]') !== null
  if (open !== row.hasAttribute(THINK_OPEN_ATTRIBUTE)) row.toggleAttribute(THINK_OPEN_ATTRIBUTE, open)
}

/**
 * Draws an open process group's rows as one card (process-column.css). The
 * feature runs only while the column layout is chosen, so the attribute the
 * stylesheet reads comes off with it and the flat layout is the host's own.
 */
export function install() {
  document.body.setAttribute(PROCESS_COLUMN_ATTR, '')
  // The shared match registry follows the rows a batch mounts; the attribute
  // subscription follows the host's own open state on the rows standing.
  const thinkRows = observeMatches<HTMLElement>(THINK_ROW_SELECTOR, () => {
    for (const row of thinkRows.all()) syncThinkOpen(row)
  })
  for (const row of thinkRows.all()) syncThinkOpen(row)
  const stop = subscribeMutations(document.body, {
    subtree: true,
    attributeFilter: ['aria-expanded'],
  }, (records) => {
    for (const record of records) {
      if (!(record.target instanceof Element)) continue
      const row = record.target.closest(THINK_ROW_SELECTOR)
      if (row instanceof HTMLElement) syncThinkOpen(row)
    }
  })
  return () => {
    stop()
    for (const row of thinkRows.all()) row.removeAttribute(THINK_OPEN_ATTRIBUTE)
    thinkRows.release()
    document.body.removeAttribute(PROCESS_COLUMN_ATTR)
  }
}
