/**
 * The waiting line's pin yields to the reader's own move (D100, D101). The mark
 * lives on the conversation scroller and goes away on the host's next follow
 * edge, so a reader who comes back finds the line pinned again.
 *
 * @capability chat-wait
 * @features chat-wait
 * @risk The line stays pinned over the reader's chosen place until the host's sample timer fires, or stays unpinned after the reader returns to the end.
 */
import { afterEach, expect, test } from 'vitest'
import { joinScrollOwner, subscribeReaderMove } from '@dsh-claude-style/engine/scroll-owner'
import { CONVERSATION_SCROLL_SELECTOR, FOLLOWING_TAIL_ATTRIBUTE, FOLLOWING_TAIL_SELECTOR } from '@dsh-claude-style/contracts/dom'
import { createPinRelease } from '@dsh-claude-style/client/pure'
import type { PinRelease } from '@dsh-claude-style/client/pure'
import { hostElement } from '../../fixtures/host-markup'
import { ownedPage } from '../../fixtures/scroll-owner'
import { surfaceAttribute } from '../../fixtures/surface'

const cleanups = ownedPage()
const MOVED = surfaceAttribute('chat-wait.reader-moved')
const frame = () => new Promise<number>(resolve => requestAnimationFrame(resolve))
const settle = () => new Promise(resolve => setTimeout(resolve, 0))

/** The host's flow frame around its scroller, the shape chat-wait.css hangs the veto on. */
function conversation() {
  const box = hostElement<HTMLElement>(CONVERSATION_SCROLL_SELECTOR)
  box.style.cssText = 'height:100px;overflow:auto;scrollbar-gutter:stable'
  const following = hostElement<HTMLElement>(FOLLOWING_TAIL_SELECTOR)
  const content = document.createElement('div')
  content.style.height = '600px'
  following.append(content)
  box.append(following)
  document.body.append(box)
  cleanups.push(() => box.remove())
  box.scrollTop = 200
  return { box, following }
}

/** A pin release driven by the page, with the reader's own move as the owner reports it. */
function releaseFor(leave: () => void, box: HTMLElement) {
  const release = createPinRelease({
    followAttribute: FOLLOWING_TAIL_ATTRIBUTE,
    followSelector: FOLLOWING_TAIL_SELECTOR,
    scroller: () => box,
    subscribeMove: subscribeReaderMove,
    movedSince: () => true,
  })
  cleanups.push(() => {
    release.stop()
    leave()
  })
  return release satisfies PinRelease
}

test('a reader move marks the scroller and the host follow edge takes the mark off', async () => {
  const leave = joinScrollOwner()
  cleanups.push(leave)
  const { box, following } = conversation()
  releaseFor(leave, box)
  box.dispatchEvent(new WheelEvent('wheel', { bubbles: true, deltaY: -120 }))
  expect(box.hasAttribute(MOVED)).toBe(false)
  await frame()
  expect(box.hasAttribute(MOVED)).toBe(true)
  following.removeAttribute(FOLLOWING_TAIL_ATTRIBUTE)
  await settle()
  // The host settling its sample is the reader's move being read, not the
  // reader coming back: the mark stands until a follow edge says otherwise.
  expect(box.hasAttribute(MOVED)).toBe(true)
  following.setAttribute(FOLLOWING_TAIL_ATTRIBUTE, '')
  await settle()
  expect(box.hasAttribute(MOVED)).toBe(false)
})

test('a follow mark taken off and put back inside one task is still a follow edge', async () => {
  const leave = joinScrollOwner()
  cleanups.push(leave)
  const { box, following } = conversation()
  releaseFor(leave, box)
  following.setAttribute(FOLLOWING_TAIL_ATTRIBUTE, '')
  await settle()
  box.dispatchEvent(new WheelEvent('wheel', { bubbles: true, deltaY: -120 }))
  await frame()
  expect(box.hasAttribute(MOVED)).toBe(true)
  following.removeAttribute(FOLLOWING_TAIL_ATTRIBUTE)
  following.setAttribute(FOLLOWING_TAIL_ATTRIBUTE, '')
  await settle()
  expect(box.hasAttribute(MOVED)).toBe(false)
})

test('a reader who has not moved since the follow edge leaves the pin alone', () => {
  const leave = joinScrollOwner()
  const { box } = conversation()
  const release = createPinRelease({
    followAttribute: FOLLOWING_TAIL_ATTRIBUTE,
    followSelector: FOLLOWING_TAIL_SELECTOR,
    scroller: () => box,
    subscribeMove: subscribeReaderMove,
    movedSince: () => false,
  })
  cleanups.push(() => {
    release.stop()
    leave()
  })
  box.dispatchEvent(new WheelEvent('wheel', { bubbles: true, deltaY: -120 }))
  const scroller = document.querySelector(CONVERSATION_SCROLL_SELECTOR)
  expect(scroller?.hasAttribute(MOVED)).toBe(false)
})

test('the teardown takes the mark off and hears nothing more', async () => {
  const leave = joinScrollOwner()
  cleanups.push(leave)
  const { box } = conversation()
  const release = releaseFor(leave, box)
  box.dispatchEvent(new WheelEvent('wheel', { bubbles: true, deltaY: -120 }))
  await frame()
  expect(box.hasAttribute(MOVED)).toBe(true)
  release.stop()
  expect(box.hasAttribute(MOVED)).toBe(false)
  box.dispatchEvent(new WheelEvent('wheel', { bubbles: true, deltaY: -120 }))
  await frame()
  await frame()
  expect(box.hasAttribute(MOVED)).toBe(false)
})

afterEach(() => {
  document.body.replaceChildren()
})
