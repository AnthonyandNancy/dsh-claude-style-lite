import { afterEach } from 'vitest'
import { joinScrollOwner, stopScrollFor } from '@dsh-claude-style/engine/scroll-owner'
import { CONVERSATION_SCROLL_SELECTOR } from '@dsh-claude-style/contracts/dom'
import { hostElement } from './host-markup'
import { MOTION_ATTR } from './vocabulary'

/** A promise that settles once the page has had `milliseconds` to run. */
export const wait = (milliseconds: number) => new Promise(resolve => setTimeout(resolve, milliseconds))

/**
 * The page's own cleanups for one spec: every fixture registers what it put on
 * the page, and they are taken off in the order they were made.
 */
export function ownedPage() {
  const cleanups: (() => void)[] = []
  afterEach(() => {
    while (cleanups.length > 0) cleanups.pop()!()
  })
  return cleanups
}

/** Shared DOM, installation and motion fixtures for the scroll-owner mechanism specs. */
export function createScrollOwnerFixture(cleanups: (() => void)[]) {
  function scrollBox(selector = CONVERSATION_SCROLL_SELECTOR) {
    const box = hostElement(selector)
    box.style.cssText = 'height:100px;overflow:auto;scrollbar-gutter:stable'
    const content = document.createElement('div')
    content.style.height = '2000px'
    box.append(content)
    document.body.append(box)
    cleanups.push(() => {
      stopScrollFor(box)
      box.remove()
    })
    return box
  }

  function join() {
    const leave = joinScrollOwner()
    cleanups.push(leave)
    return leave
  }

  function setMotion(mode: string) {
    document.body.setAttribute(MOTION_ATTR, mode)
    cleanups.push(() => document.body.removeAttribute(MOTION_ATTR))
  }

  return { scrollBox, join, setMotion }
}
