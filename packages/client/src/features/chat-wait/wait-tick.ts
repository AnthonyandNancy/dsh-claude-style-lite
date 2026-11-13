import { WAIT_OVERTIME_MS } from './wait-state'

/** The invisible values one waiting line keeps between ticks. */
export interface WaitTickState {
  turnStart: number | null
  waitStart: number | null
  wordUntil: number | null
  followed: boolean
}

/** What one quarter-second tick may write, and whether it needs the full pass. */
export interface WaitTickPlan {
  clock: boolean
  overtime: boolean
  full: boolean
}

/** A followed row keeps its full sync for its wording lock; an unfollowed row keeps the old full tick. */
export function waitTickPlan(state: WaitTickState, now: number): WaitTickPlan {
  return {
    clock: state.turnStart !== null,
    overtime: state.waitStart !== null && now - state.waitStart >= WAIT_OVERTIME_MS,
    full: !state.followed || (state.wordUntil !== null && now >= state.wordUntil),
  }
}
