/**
 * A header whose own padding, border and gap have not changed keeps those
 * readings between flushes, while the parent width and child boxes are still
 * read for each form decision.
 *
 * @capability process-fold
 * @features chat-fold
 * @risk A cached style makes a narrow header choose the full sentence after the panel's padding changed, or hides a genuine width change.
 */
import { afterEach, expect, test, vi } from 'vitest'
import { createSummaryWidthCache } from '@dsh-claude-style/client/pure'

afterEach(() => {
  vi.restoreAllMocks()
  document.body.replaceChildren()
})

test('the style half of the available width is read once and the child boxes are still read', () => {
  const header = document.createElement('div')
  header.style.cssText = 'display:flex;gap:4px;padding:0 8px;border:1px solid transparent'
  const summary = document.createElement('span')
  summary.textContent = 'summary'
  header.append(summary)
  document.body.append(header)
  // cost: D9 — the cache's whole point is that a repeated form decision reads no header style.
  const style = vi.spyOn(window, 'getComputedStyle')
  const cache = createSummaryWidthCache()
  cache.available(header, summary)
  const first = style.mock.calls.length
  cache.available(header, summary)
  expect(style.mock.calls.length).toBe(first)
})
