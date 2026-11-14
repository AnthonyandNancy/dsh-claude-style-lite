import { subscribeMutations } from './bus'
import { requestFrame } from './frame'
import { skin } from './skin'
import { CHAT_RUNNING_SELECTOR, COMPOSER_SELECTOR, CONVERSATION_SESSION_ATTRIBUTE, CONVERSATION_SESSION_SELECTOR, SIDEBAR_SLOT_SELECTOR, STREAMING_SELECTOR } from '@dsh-claude-style/contracts/dom'
import { SCROLL_KEYS, SUBMISSION_ROW_SELECTOR, conversationScroller, findFollowTailButton, isScrollbarStrip } from './chat-dom'
import { SCROLL_EASE_LEAD_PX, easeScroll, isScrollEasing, scrollEasePosition, scrollEnd, stopScrollEase } from './scroll-ease'

/**
 * The chat area's scroll positions have one writer (D40): features ask, this module decides on the spring of scroll-ease.ts. Sources rank jump > fold > follow > process, and a request below the ease running is refused.
 * Whether content follows the end belongs to the host alone (D100): nothing here records a reader position, and the reader's own wheel is kept only as an instant (`readerMovedSince`) so a hand-back can tell a layout's loss of the follow from his choice to read higher up. While content streams, the host's follow pins the end and the follow feature slides what the pin pushed up (D95).
 */

export { SCROLL_EASE_LEAD_PX }

export type ScrollSource = 'jump' | 'fold' | 'follow' | 'process'

/** Each source's rank; a higher rank's claim stands over a lower one's. */
const SCROLL_SOURCE_RANK: Record<ScrollSource, number> = {
  process: 1,
  follow: 2,
  fold: 3,
  jump: 4,
}

/**
 * How long the stream slide stands down after a submission arrives: the host's jump to a message just sent is deliberate, and its echo row (SUBMISSION_ROW_SELECTOR, chat-dom.ts) is swapped for the real one about a second later, which moves the position again.
 */
const SUBMISSION_HOLD_MS = 1200
/** How many times a hand-back looks again; the host may turn its follow off a beat later. */
const FOLLOW_LOOK_ROUNDS = 5
/** The gap between two looks; five of them cover the host's 500 ms sampling window. */
const FOLLOW_LOOK_INTERVAL_MS = 100
/**
 * The gap between two looks while the walk to the end is running: the button is
 * pressed on the look after the walk lands, and a tenth of a second's delay there
 * is a tenth of a second in which the host may take its follow off again.
 */
const FOLLOW_WALK_INTERVAL_MS = 30
/** The walk is given up after this long; a spring that never arrives must not keep the round waiting. */
const FOLLOW_WALK_DEADLINE_MS = 4000

/** The reader's intent events, watched for the instant a hand-back is measured against. */
const INTENT_TYPES = ['wheel', 'touchstart', 'touchmove', 'touchend', 'touchcancel', 'pointerdown', 'keydown', 'beforematch']
/** The intents that move a position; the others (beforematch, a touch's end) only settle a gesture. */
const MOVING_INTENT_TYPES = new Set(['wheel', 'touchstart', 'pointerdown', 'keydown'])
/** Subtrees whose mutations are streaming tokens or sidebar chrome, never a user submission row. */
const NON_SUBMISSION_SUBTREE = `${SIDEBAR_SLOT_SELECTOR}, ${STREAMING_SELECTOR}, ${CHAT_RUNNING_SELECTOR}`

/** Whether an event is the reader taking the scroll over: a pointer or key inside the composer is him typing, and of the keys only the ones that scroll the viewport count. */
function isReaderScrollIntent(event: Event) {
  const target = event.target
  if (target instanceof Element && target.closest(COMPOSER_SELECTOR) !== null) return false
  if (event.type !== 'keydown') return true
  return event instanceof KeyboardEvent && SCROLL_KEYS.has(event.key)
}

/** The source of the ease running on each container, stale once the spring has let go. A WeakMap because a spring that arrives on its own never asks again, and a Map would hold the container and its conversation subtree for the life of the page. */
const easeSources = new WeakMap<Element, ScrollSource>()
/** When the reader last made a moving intent, for movedSince. */
let lastMovingIntentAt = 0
/** When a feature last took the position to a place the reader picked: a turn, the answer's first line. */
let lastNavigationAt = 0
/** Until this moment the stream slide stands down: the reader's own message just arrived. */
let submissionHoldUntil = 0
/** How many features use the owner; its listeners live while one does. */
let members = 0
let stopSubmissionWatch: (() => void) | null = null
/**
 * Told once on the frame after an accepted reader move, so the status line's
 * pin can stand down before the host's sample closes its follow (D100).
 */
const moveListeners = new Set<() => void>()
/** Cancels the frame that would tell the listeners, or null while none waits. */
let cancelMoveFrame: (() => void) | null = null

/**
 * Hear a reader move on the frame after it is accepted (D40, D100). The owner
 * keeps the instant alone: whether the move releases a pinned row belongs to
 * the row's own feature.
 * @returns unsubscribe.
 */
export function subscribeReaderMove(listener: () => void) {
  moveListeners.add(listener)
  return () => {
    moveListeners.delete(listener)
  }
}

/** Queue one announcement for the next frame's write phase; moves in one frame are one call. */
function announceReaderMove() {
  if (cancelMoveFrame !== null) return
  cancelMoveFrame = requestFrame({
    write() {
      cancelMoveFrame = null
      for (const listener of moveListeners) listener()
    },
  })
}

/** The ease running on a container now, and the source it serves. */
function runningSource(container: Element) {
  if (!isScrollEasing(container)) {
    easeSources.delete(container)
    return undefined
  }
  return easeSources.get(container)
}

/** Whether `source` may move `container` now. */
function claim(container: Element, source: ScrollSource) {
  claimConversation()
  const running = runningSource(container)
  return running === undefined || SCROLL_SOURCE_RANK[source] >= SCROLL_SOURCE_RANK[running]
}

/** Whether the reader made a moving intent anywhere after `since` (a performance.now() reading). */
export function readerMovedSince(since: number) {
  return lastMovingIntentAt > since
}

/**
 * Whether a feature put the position somewhere the reader picked after `since`:
 * a turn he pressed in the navigator, the first line of the answer. The host
 * reads such a write as the reader's own move and turns its follow off.
 */
export function navigationMovedSince(since: number) {
  return lastNavigationAt > since
}

/** Whether the stream slide (features/chat-follow/chat-follow.ts) stands down for the reader's own message right now. */
export function submissionHolds() {
  return performance.now() < submissionHoldUntil
}

/**
 * The conversation's element as it was last seen, and the session it belonged
 * to; the element is read again once a session switch replaces it.
 */
let sessionElement: Element | null = null
let sessionId: string | null = null

/**
 * Note which conversation the owner is working in, and drop what belonged to the previous one: the submission hold is armed by the rows a conversation renders, so left standing it would hold the stream slide down over the history the new conversation opens.
 */
function claimConversation() {
  if (sessionElement === null || !sessionElement.isConnected) sessionElement = conversationScroller()?.closest(CONVERSATION_SESSION_SELECTOR) ?? null
  const next = sessionElement?.getAttribute(CONVERSATION_SESSION_ATTRIBUTE) ?? null
  if (next === sessionId) return
  sessionId = next
  submissionHoldUntil = 0
}

/**
 * Whether an intent is the reader's move in the conversation: inside its
 * scroller, or a key pressed with nothing else focused. A press or wheel
 * anywhere else moves something else, and counted here it would stop the
 * hand-back from ever running.
 */
function intentReaches(scroller: Element, event: Event) {
  const target = event.target
  if (event.type === 'keydown') return target === document.body || target === document.documentElement || (target instanceof Node && scroller.contains(target))
  return target instanceof Node && scroller.contains(target)
}

/**
 * Whether a press starts moving the conversation's position: the scrollbar
 * strip and the middle button do, a press on the words does not — it selects
 * text, and counted as a move it would keep the hand-back from ever running.
 */
function pressMovesScroll(scroller: Element, event: Event) {
  return event instanceof PointerEvent && (isScrollbarStrip(scroller, event, event.target) || event.button === 1)
}

/**
 * Note that the reader moved the conversation himself. Only the instant is
 * kept: the host owns whether content follows the end, and this reading is what
 * a hand-back is measured against.
 * @param event - the document's intent, read in the capture phase.
 */
function noteIntent(event: Event) {
  if (!isReaderScrollIntent(event)) return
  if (!MOVING_INTENT_TYPES.has(event.type)) return
  const scroller = conversationScroller()
  if (scroller === null || !intentReaches(scroller, event)) return
  if (event.type === 'pointerdown' && !pressMovesScroll(scroller, event)) return
  lastMovingIntentAt = performance.now()
  announceReaderMove()
}

function hasSubmissionNode(nodes: NodeList) {
  for (let i = 0; i < nodes.length; i += 1) {
    const node = nodes[i]
    if (node instanceof Element && (node.matches(SUBMISSION_ROW_SELECTOR) || node.querySelector(SUBMISSION_ROW_SELECTOR) !== null)) {
      return true
    }
  }
  return false
}

function noteSubmission(records: MutationRecord[]) {
  for (let i = 0; i < records.length; i += 1) {
    const record = records[i]
    if (record.addedNodes.length === 0 && record.removedNodes.length === 0) continue
    if (record.target instanceof Element && record.target.closest(NON_SUBMISSION_SUBTREE) !== null) continue
    if (hasSubmissionNode(record.addedNodes) || hasSubmissionNode(record.removedNodes)) {
      submissionHoldUntil = performance.now() + SUBMISSION_HOLD_MS
      return
    }
  }
}

/** Every observed change of the body: a submission's arrival. */
function noteBodyChanges(records: MutationRecord[]) {
  noteSubmission(records)
}

/**
 * Use the owner while a feature is installed: its intent and submission watches
 * live while any feature does.
 * @returns leave.
 */
export function joinScrollOwner() {
  members += 1
  if (members === 1) {
    for (const type of INTENT_TYPES) document.addEventListener(type, noteIntent, { capture: true, passive: true })
    stopSubmissionWatch = subscribeMutations(document.body, { childList: true, subtree: true }, noteBodyChanges)
  }
  let left = false
  return () => {
    if (left) return
    left = true
    members -= 1
    if (members > 0) return
    for (const type of INTENT_TYPES) document.removeEventListener(type, noteIntent, true)
    if (stopSubmissionWatch !== null) stopSubmissionWatch()
    stopSubmissionWatch = null
    if (cancelMoveFrame !== null) cancelMoveFrame()
    cancelMoveFrame = null
    moveListeners.clear()
  }
}

/**
 * Put a container's position down now.
 * @returns whether the write was carried out.
 */
export function writeScroll(container: Element, value: number, source: ScrollSource) {
  if (!claim(container, source)) return false
  const running = runningSource(container)
  if (running !== undefined && SCROLL_SOURCE_RANK[running] < SCROLL_SOURCE_RANK[source]) stopScrollEase(container)
  if (source === 'jump') lastNavigationAt = performance.now()
  container.scrollTop = value
  return true
}

/**
 * Walk a container's position toward a destination on the spring, replacing
 * the ease running there.
 * @param destination - asked every frame: the position wanted now.
 * @param wanted - asked every frame; false ends the ease where it is.
 * @param lead - the longest stretch glided (packages/engine/src/scroll-ease.ts).
 * @returns whether the request was carried out.
 */
export function easeScrollFor(container: Element, source: ScrollSource, destination: (element: Element, end: number) => number, wanted: () => boolean, lead = SCROLL_EASE_LEAD_PX) {
  if (!claim(container, source)) return false
  if (source === 'jump') lastNavigationAt = performance.now()
  if (skin().motionReduced()) {
    stopScrollEase(container)
    container.scrollTop = destination(container, scrollEnd(container))
    return true
  }
  easeScroll(container, destination, wanted, lead)
  easeSources.set(container, source)
  return true
}

/** Walk a container's position to its end, wherever the end goes. */
export function easeScrollToEndFor(container: Element, source: ScrollSource, wanted: () => boolean) {
  return easeScrollFor(container, source, (_element, end) => end, wanted)
}

/** End the ease running on a container, when it serves `source` (or whichever source, without one). */
export function stopScrollFor(container: Element, source?: ScrollSource) {
  const running = runningSource(container)
  if (running === undefined) return
  if (source !== undefined && running !== source) return
  stopScrollEase(container)
  easeSources.delete(container)
}

/** The position the ease last wrote on a container, or null while none runs there. */
export function scrollPositionFor(container: Element) {
  return scrollEasePosition(container)
}

/**
 * Hand the conversation back to the host's own follow, lighting it up again when it is off. The host turns its follow off on any write inside its 500 ms sampling window and leaves one way back: the back-to-end button it renders only while off. The position is walked to the end first, so the host's onScroll sees the reader reach it; the button click covers the start of an execution, when there is no scrollbar and no scroll event. The looks in between cover the host turning its follow off a beat late.
 * @param source - follow for the follow's own hand-back, fold after a door.
 * @param options - stillWanted is asked before every look; onSettled runs once the round is over.
 */
export function handBackFollow(source: ScrollSource, options?: { stillWanted?: () => boolean, onSettled?: () => void }) {
  const stillWanted = options?.stillWanted ?? (() => true)
  const onSettled = options?.onSettled ?? null
  const scroller = conversationScroller()
  if (scroller === null) {
    if (onSettled !== null) onSettled()
    return
  }
  if (scroller.scrollHeight - scroller.clientHeight - scroller.scrollTop > 0.5) easeScrollToEndFor(scroller, source, stillWanted)
  const startedAt = performance.now()
  let rounds = 0
  const look = () => {
    if (!stillWanted()) {
      if (onSettled !== null) onSettled()
      return
    }
    // The walk first, the button after it: clicking mid-walk would drop the
    // eased position for the host's own instant jump. Its looks are counted
    // apart: the walk ends on its own, and the rounds belong to the button.
    if (isScrollEasing(scroller)) {
      if (performance.now() - startedAt > FOLLOW_WALK_DEADLINE_MS) {
        if (onSettled !== null) onSettled()
        return
      }
      window.setTimeout(look, FOLLOW_WALK_INTERVAL_MS)
      return
    }
    if (rounds >= FOLLOW_LOOK_ROUNDS) {
      if (onSettled !== null) onSettled()
      return
    }
    rounds += 1
    // A pinned position does not mean the follow is back: the settlement may
    // switch it off a beat later, and after that only the button brings it
    // back. The button stands on the page only while the follow is off, so
    // finding one is the reading.
    const button = findFollowTailButton()
    if (button !== null) {
      button.click()
      if (onSettled !== null) onSettled()
      return
    }
    window.setTimeout(look, FOLLOW_LOOK_INTERVAL_MS)
  }
  window.setTimeout(look, FOLLOW_LOOK_INTERVAL_MS)
}
