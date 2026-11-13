/**
 * Whether a lost follow is the skin's to hand back (D100). The reader's own
 * move outranks the hand-back: inside the host's sampling window a growth can
 * pin the end again after the wheel, and that pin must not turn the wheel into
 * "he did not move". The host alone decides whether content follows the end;
 * this module only decides whether the skin may ask its button for it.
 */

/** What a hand-back needs to know, read at the moment it would run. */
export interface FollowHandBackInput {
  /** The conversation has stood at or followed its tail at least once. */
  seenAtTail: boolean
  /** The reader moved the conversation after the host's follow last came on. */
  readerMoved: boolean
  /** A feature took the position to a place the reader picked. */
  navigationMoved: boolean
  /** How far the position stands from the end. */
  gap: number
  /** The scroller's own height: more than this off the end is reading higher up. */
  viewport: number
}

export function followHandBackAllowed(input: FollowHandBackInput) {
  if (!input.seenAtTail) return false
  if (input.readerMoved || input.navigationMoved) return false
  // More than a screen off the end is the reader reading higher up, not a follow that fell one step behind.
  return input.gap <= input.viewport
}
