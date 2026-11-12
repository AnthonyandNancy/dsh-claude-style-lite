/**
 * The rail's opening decision, kept out of React so it can be judged on its
 * own: the setting names the default, a reader's press stands for the session,
 * and the host's own right column takes the side first.
 *
 * @capability session-panel
 * @features session-panel
 * @risk The rail opens over the host's own right column, or a reader's close is overridden by a later measurement.
 */
import { expect, test } from 'vitest'
import { railOpensByChoice } from '@dsh-claude-style/client/pure'

test('the setting decides only the default mode', () => {
  expect(railOpensByChoice('default', true, true, false)).toBe(true)
  expect(railOpensByChoice('default', false, true, false)).toBe(false)
  expect(railOpensByChoice('default', true, false, false)).toBe(false)
})

test('a reader’s own press stands over the setting', () => {
  expect(railOpensByChoice('open', false, true, false)).toBe(true)
  expect(railOpensByChoice('closed', true, true, false)).toBe(false)
})

test('the host’s right column takes the side first', () => {
  expect(railOpensByChoice('open', true, true, true)).toBe(false)
  expect(railOpensByChoice('default', true, true, true)).toBe(false)
})
