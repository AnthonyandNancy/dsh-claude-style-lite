import { observeMarker, subscribeMutations } from '@dsh-claude-style/engine/bus'
import { observeSession } from '@dsh-claude-style/engine/host'

/** The mark on the conversation scroller while the reader has moved since the host's last follow edge (chat-wait.css). */
export const MOVED_ATTR = 'data-dsh-claude-wait-reader-moved'

/** What the waiting line's pin release reads from the page and the scroll owner. */
export interface PinReleaseOptions {
  /** The host's follow mark as an attribute name, read through the contract table. */
  followAttribute: string
  /** The host's follow mark as a selector, for the nodes that carry it. */
  followSelector: string
  /** The conversation scroller the stylesheet hangs the mark on. */
  scroller: () => Element | null
  /** Hear a reader move on the frame after the scroll owner accepts it. */
  subscribeMove: (listener: () => void) => () => void
  /** Whether the reader moved after `since` (a performance.now() reading). */
  movedSince: (since: number) => boolean
}

/** The pin release's own lifetime: one release call and one teardown. */
export interface PinRelease {
  /** Take the mark off, leaving the host's follow untouched. */
  release(): void
  /** Stop every subscription and take the mark off. */
  stop(): void
}

/**
 * Stand the running line's pin down for the reader's own move (D100). The mark
 * only vetoes the pin while the host still reports its follow; it holds no
 * reader position and writes no scroll. The host's follow edge, a session
 * switch and the feature's teardown take the mark off again.
 *
 * @param options - the mark, the follow contract, and the owner's readings.
 */
export function createPinRelease(options: PinReleaseOptions): PinRelease {
  /** The scroller carrying the mark, or null while no reader move stands. */
  let marked: Element | null = null
  /** When the host's follow last rose; a move has to be newer than this to count. */
  let followEdgeAt = 0
  /** Whether a follow marker stood in the page at the last batch. */
  let seenFollowing = false

  function release() {
    if (marked === null) return
    marked.removeAttribute(MOVED_ATTR)
    marked = null
  }

  /** A follow edge puts the pin back where the host says the reader returned. */
  function noteFollowEdge() {
    followEdgeAt = performance.now()
    release()
  }

  function noteMove() {
    if (!options.movedSince(followEdgeAt)) return
    const scroller = options.scroller()
    if (scroller === null || scroller === marked) return
    release()
    scroller.setAttribute(MOVED_ATTR, '')
    marked = scroller
  }

  /**
   * The follow marker's arrival on a node that stays mounted. The list's own
   * change catches a marker arriving and leaving across batches; the records
   * below catch a mark taken off and put back inside one batch, which the host
   * does when it settles a sample and follows the tail again in the same task.
   */
  const following = observeMarker<Element>(options.followSelector, () => {
    const next = following.all().length > 0
    if (next && !seenFollowing) noteFollowEdge()
    seenFollowing = next
  })
  seenFollowing = following.all().length > 0
  if (seenFollowing) followEdgeAt = performance.now()

  const stopReAdded = subscribeMutations(document.body, {
    subtree: true,
    attributes: true,
    attributeFilter: [options.followAttribute],
    attributeOldValue: true,
  }, (records) => {
    for (const record of records) {
      if (!(record.target instanceof Element)) continue
      if (record.oldValue !== null || !record.target.hasAttribute(options.followAttribute)) continue
      noteFollowEdge()
      return
    }
  })
  const stopSession = observeSession(release)
  const stopMove = options.subscribeMove(noteMove)

  return {
    release,
    stop() {
      stopMove()
      following.release()
      stopReAdded()
      stopSession()
      release()
    },
  }
}
