/**
 * A footer whose entries have not changed is measured once: the second pass
 * reuses each node's fixed-position answer. A class change invalidates the
 * answer and reads the node again.
 *
 * @capability footer-mirror
 * @features account
 * @risk A footer panel that becomes fixed after a class change is collapsed as an ordinary entry, or every pass reads every descendant's computed style.
 */
import { afterEach, expect, test, vi } from 'vitest'
import { footerMirrorHarness } from '../../fixtures/footer-mirror'

afterEach(() => {
  vi.restoreAllMocks()
  document.body.replaceChildren()
})

test('the second measure reads no computed style and a class change invalidates the answer', async () => {
  const { footArea, slot, mirror } = footerMirrorHarness()
  const entry = document.createElement('div')
  const child = document.createElement('span')
  child.textContent = 'Remote'
  entry.append(child)
  slot.append(entry)
  // cost: D9 — the cache's whole point is that a repeated measure reads no computed style.
  const style = vi.spyOn(window, 'getComputedStyle')
  mirror.measure(footArea)
  const first = style.mock.calls.length
  expect(first).toBeGreaterThan(0)
  mirror.measure(footArea)
  expect(style.mock.calls.length).toBe(first)
  entry.className = 'is-fixed'
  await new Promise(resolve => setTimeout(resolve, 0))
  mirror.measure(footArea)
  expect(style.mock.calls.length).toBeGreaterThan(first)
})
