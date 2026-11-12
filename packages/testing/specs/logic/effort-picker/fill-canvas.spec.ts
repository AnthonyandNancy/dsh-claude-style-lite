/**
 * The effort fill's Canvas geometry as numbers: the right edge a target asks
 * for, the eased distance at the move token's ends, and the reduced-motion
 * answer. The renderer paints what these answer.
 *
 * @capability effort-picker
 * @features effort
 * @risk The canvas fill lands a pixel off the knob, eases past its end, or keeps painting after the reader asked for reduced motion.
 */
import { expect, test } from 'vitest'
import { fillEased, fillRight, fillWidthDev } from '@dsh-claude-style/client/pure'

test('the fill right edge tracks the knob centre', () => {
  expect(fillRight(0, 16)).toBe(8)
  expect(fillRight(100, 16)).toBe(108)
  expect(fillRight(50, 16)).toBe(58)
})

test('the backing store is capped at DPR 2', () => {
  expect(fillWidthDev(320, 1)).toBe(320)
  expect(fillWidthDev(320, 2)).toBe(640)
  expect(fillWidthDev(320, 3)).toBe(640)
})

test('the eased distance lands on both ends', () => {
  const eased = fillEased(0.5, 0, 100)
  expect(eased).toBeGreaterThan(0)
  expect(eased).toBeLessThan(100)
  expect(fillEased(0, 0, 100)).toBe(0)
  expect(fillEased(1, 0, 100)).toBe(100)
})
