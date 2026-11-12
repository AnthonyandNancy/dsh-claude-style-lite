/**
 * A hand-back returns the conversation to the host: the reader hold goes, the
 * host button is pressed once, and a growth that arrives afterwards keeps the
 * tail the host wrote. The growth path reads the reader's own position, which a
 * hand-back clears, so that path returns instead of writing a cleared value
 * (D40, D99).
 *
 * @capability scroll-ownership
 * @features engine
 * @risk After the reader presses the host's back-to-end button, the next piece of content makes the skin read its cleared reader position, write null into scrollTop, and the window jumps to the top.
 */
import { afterEach, expect, test } from 'vitest'
import { adoptSkin } from '@dsh-claude-style/engine/skin'
import { handBackFollow, handBackPending, readerHolds, readerScrollPosition } from '@dsh-claude-style/engine/scroll-owner'
import { CHAT_FLOW_SELECTOR, CONVERSATION_SCROLL_SELECTOR, FOLLOWING_TAIL_ATTRIBUTE } from '@dsh-claude-style/contracts/dom'
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
 * holds the button. The button stands outside the scroller, so its press is no
 * scroll intent the owner hears.
 */
function followFrame() {
  const following = document.createElement('div')
  const pressed: number[] = []
  const settled: number[] = []
  const button = document.createElement('button')
  button.type = 'button'
  button.addEventListener('click', () => {
    pressed.push(performance.now())
    following.setAttribute(FOLLOWING_TAIL_ATTRIBUTE, '')
    scroller.scrollTop = scroller.scrollHeight
  })
  join()
  const scroller = scrollBox(CONVERSATION_SCROLL_SELECTOR)
  const column = hostElement(CHAT_FLOW_SELECTOR)
  column.style.height = '2000px'
  scroller.replaceChildren(following)
  following.append(column)
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
    column,
    pressed,
    settled,
    settle: () => { settled.push(performance.now()) },
  }
}

test('a hand-back presses the host button once and clears the reader position', async () => {
  const { scroller, pressed } = followFrame()
  scroller.dispatchEvent(new WheelEvent('wheel', { bubbles: true, deltaY: -120 }))
  expect(readerHolds(scroller)).toBe(true)
  handBackFollow({ source: 'reader', reason: 'reader' })
  await wait(800)
  expect(pressed).toHaveLength(1)
  expect(readerHolds(scroller)).toBe(false)
  expect(readerScrollPosition(scroller)).toBeNull()
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

test('growth after the hand-back stays at the host tail', async () => {
  const { scroller, column, pressed } = followFrame()
  scroller.dispatchEvent(new WheelEvent('wheel', { bubbles: true, deltaY: -120 }))
  expect(readerHolds(scroller)).toBe(true)
  handBackFollow({ source: 'reader', reason: 'reader' })
  // The host's own write to the tail, on the press, and the position the
  // growth path would have restored is gone with the hand-back.
  expect(readerHolds(scroller)).toBe(false)
  expect(readerScrollPosition(scroller)).toBeNull()
  expect(scroller.scrollHeight - scroller.clientHeight - scroller.scrollTop).toBe(0)
  const piece = document.createElement('div')
  piece.style.height = '600px'
  column.append(piece)
  // The host's follow pins the end on growth.
  scroller.scrollTop = scroller.scrollHeight
  await wait(50)
  expect(pressed).toHaveLength(1)
  expect(readerHolds(scroller)).toBe(false)
  expect(readerScrollPosition(scroller)).toBeNull()
  expect(scroller.scrollHeight - scroller.clientHeight - scroller.scrollTop).toBe(0)
})

test('the growth path writes no cleared position over the tail', async () => {
  const { scroller, column } = followFrame()
  scroller.dispatchEvent(new WheelEvent('wheel', { bubbles: true, deltaY: -120 }))
  expect(readerHolds(scroller)).toBe(true)
  handBackFollow({ source: 'reader', reason: 'reader' })
  expect(readerScrollPosition(scroller)).toBeNull()
  const piece = document.createElement('div')
  piece.style.height = '600px'
  column.append(piece)
  // The host pins the new tail before the growth path reads the position.
  scroller.scrollTop = scroller.scrollHeight
  const tail = scroller.scrollTop
  await wait(50)
  // A cleared position must leave the host's tail standing.
  expect(scroller.scrollTop).toBe(tail)
})
