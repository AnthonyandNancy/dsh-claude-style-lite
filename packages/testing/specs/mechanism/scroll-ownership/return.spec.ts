/**
 * A hand-back returns the conversation to the host once: the reader hold goes
 * immediately, the host's back-to-end button is pressed at most once, and the
 * request only watches for that button to disappear afterwards (D40).
 *
 * @capability scroll-ownership
 * @features engine
 * @risk A delayed host follow leaves the button on the page, and every look presses it again, pulling new content away from where the reader asked to be.
 */
import { afterEach, expect, test } from 'vitest'
import { adoptSkin } from '@dsh-claude-style/engine/skin'
import { handBackFollow, handBackPending, readerHolds } from '@dsh-claude-style/engine/scroll-owner'
import { CHAT_FLOW_SELECTOR, CONVERSATION_SCROLL_SELECTOR } from '@dsh-claude-style/contracts/dom'
import { TEST_SKIN } from '../../fixtures/vocabulary'
import { hostElement } from '../../fixtures/host-markup'
import { createScrollOwnerFixture } from '../../fixtures/scroll-owner'

adoptSkin(TEST_SKIN)

const wait = (milliseconds: number) => new Promise(resolve => setTimeout(resolve, milliseconds))
const cleanups: (() => void)[] = []
afterEach(() => {
  while (cleanups.length > 0) cleanups.pop()!()
})

const { scrollBox, join } = createScrollOwnerFixture(cleanups)

/**
 * The host's shape around the follow button: the flow column sits in the
 * scroller, the scroller's parent is the frame, and the frame's next sibling
 * holds the button.
 */
function followFrame() {
  const pressed: number[] = []
  const settled: number[] = []
  const button = document.createElement('button')
  button.type = 'button'
  button.addEventListener('click', () => { pressed.push(performance.now()) })
  join()
  const scroller = scrollBox(CONVERSATION_SCROLL_SELECTOR)
  const column = hostElement(CHAT_FLOW_SELECTOR)
  column.style.height = '2000px'
  scroller.replaceChildren(column)
  const frame = document.createElement('div')
  const slot = document.createElement('div')
  const outer = document.createElement('div')
  slot.append(button)
  frame.append(scroller)
  outer.append(frame)
  outer.append(slot)
  document.body.append(outer)
  cleanups.push(() => outer.remove())
  return {
    scroller,
    pressed,
    settled,
    settle: () => { settled.push(performance.now()) },
  }
}

test('a hand-back clicks the host button once and releases the reader hold', async () => {
  const { scroller, pressed } = followFrame()
  scroller.dispatchEvent(new WheelEvent('wheel', { bubbles: true, deltaY: -120 }))
  expect(readerHolds(scroller)).toBe(true)
  handBackFollow({ source: 'reader', reason: 'reader' })
  await wait(800)
  expect(pressed).toHaveLength(1)
  expect(readerHolds(scroller)).toBe(false)
  expect(handBackPending(scroller)).toBe(false)
})

test('a hand-back settles once without pressing a button that stays on the page', async () => {
  const { scroller, pressed, settled, settle } = followFrame()
  scroller.dispatchEvent(new WheelEvent('wheel', { bubbles: true, deltaY: -120 }))
  expect(readerHolds(scroller)).toBe(true)
  handBackFollow({ source: 'reader', reason: 'reader', onSettled: settle })
  await wait(800)
  expect(pressed).toHaveLength(1)
  expect(settled).toHaveLength(1)
})
