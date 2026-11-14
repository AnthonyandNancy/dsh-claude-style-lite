/**
 * A reader's move reaches the status line's pin on the frame after it happens
 * (D40, D101). The owner keeps the instant and hands it out; the pin's own
 * feature decides what to do with it.
 *
 * @capability scroll-ownership
 * @features engine
 * @risk The status line keeps floating over what the reader went back to read while the host waits out its sample window.
 */
import { expect, test } from 'vitest'
import { adoptSkin } from '@dsh-claude-style/engine/skin'
import { joinScrollOwner, subscribeReaderMove } from '@dsh-claude-style/engine/scroll-owner'
import { COMPOSER_SELECTOR, CONVERSATION_SCROLL_SELECTOR } from '@dsh-claude-style/contracts/dom'
import { hostElement } from '../../fixtures/host-markup'
import { ownedPage } from '../../fixtures/scroll-owner'
import { TEST_SKIN } from '../../fixtures/vocabulary'

adoptSkin(TEST_SKIN)
const cleanups = ownedPage()
const frame = () => new Promise<number>(resolve => requestAnimationFrame(resolve))

function conversation() {
  const box = hostElement(CONVERSATION_SCROLL_SELECTOR)
  box.style.cssText = 'height:100px;overflow:auto;scrollbar-gutter:stable'
  const content = document.createElement('div')
  content.style.height = '600px'
  box.append(content)
  document.body.append(box)
  cleanups.push(() => box.remove())
  box.scrollTop = 200
  return box
}

function listen() {
  const calls: number[] = []
  const stop = subscribeReaderMove(() => calls.push(performance.now()))
  cleanups.push(stop)
  return calls
}

test('a wheel inside the conversation reaches a move listener on the next frame', async () => {
  const leave = joinScrollOwner()
  cleanups.push(leave)
  const box = conversation()
  const calls = listen()
  box.dispatchEvent(new WheelEvent('wheel', { bubbles: true, deltaY: -120 }))
  expect(calls).toHaveLength(0)
  await frame()
  expect(calls).toHaveLength(1)
})

test('a wheel inside the composer reaches nobody', async () => {
  const leave = joinScrollOwner()
  cleanups.push(leave)
  const box = conversation()
  const composer = hostElement<HTMLElement>(COMPOSER_SELECTOR)
  box.append(composer)
  const calls = listen()
  composer.dispatchEvent(new WheelEvent('wheel', { bubbles: true, deltaY: -120 }))
  await frame()
  await frame()
  expect(calls).toHaveLength(0)
})

test('a left press on the words is a selection, not a move', async () => {
  const leave = joinScrollOwner()
  cleanups.push(leave)
  const box = conversation()
  const calls = listen()
  box.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0 }))
  await frame()
  await frame()
  expect(calls).toHaveLength(0)
})

test('an upper arrow key with nothing else focused is a move', async () => {
  const leave = joinScrollOwner()
  cleanups.push(leave)
  conversation()
  const calls = listen()
  document.body.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'ArrowUp' }))
  await frame()
  expect(calls).toHaveLength(1)
})

test('an unsubscribed listener hears nothing', async () => {
  const leave = joinScrollOwner()
  cleanups.push(leave)
  const box = conversation()
  const calls: number[] = []
  const stop = subscribeReaderMove(() => calls.push(1))
  stop()
  box.dispatchEvent(new WheelEvent('wheel', { bubbles: true, deltaY: -120 }))
  await frame()
  await frame()
  expect(calls).toHaveLength(0)
})

test('two wheels inside one frame reach the listener once', async () => {
  const leave = joinScrollOwner()
  cleanups.push(leave)
  const box = conversation()
  const calls = listen()
  box.dispatchEvent(new WheelEvent('wheel', { bubbles: true, deltaY: -60 }))
  box.dispatchEvent(new WheelEvent('wheel', { bubbles: true, deltaY: -60 }))
  await frame()
  expect(calls).toHaveLength(1)
})
