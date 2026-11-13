/**
 * Why each session's latest turn ended, kept as the host commits `turn/end`.
 *
 * The browser half sees only `running` in the live status, so a stop, a pause,
 * an error and a normal finish arrive there as the same transition. The host
 * sees every session's committed events, including sessions the reader never
 * opened, so it keeps the latest turn reason per session and answers one read
 * (D97).
 */
import { turnOutcomeOf } from '@dsh-claude-style/contracts/attention'
import type { TurnOutcome } from '@dsh-claude-style/contracts/attention'
import type { DshContext } from '@dsh-claude-style/engine/node/dsh'

/** One committed event, in the members this reader needs. */
interface TurnEvent {
  type?: unknown
  time?: unknown
  data?: { turn?: unknown, reason?: unknown }
}

/** The sessions whose outcome is kept before the least recently moved is forgotten. */
const KEPT_SESSIONS = 512

/** What the route answers for one session. */
export interface TurnOutcomeAnswer {
  outcome: TurnOutcome
  /** The closed turn the outcome belongs to, so a reader can tell two stops apart. */
  turn: number
  /** The event time of that `turn/end`, on the host's clock. */
  at: number
}

/** One session's last closed turn. */
type LastTurn = TurnOutcomeAnswer

/**
 * Keep the latest `turn/end` per session.
 *
 * @param ctx - host plugin context; a host without `on` keeps nothing.
 * @returns `read(sessionId)` and `dispose()`; a session no `turn/end` has
 *     reached answers null, which the browser reads as an unknown ending.
 */
export function createTurnOutcomes(ctx: DshContext) {
  const last = new Map<string, LastTurn>()
  let disposed = false

  function remember(sessionId: string, event: TurnEvent) {
    if (typeof event.data?.turn !== 'number' || !Number.isSafeInteger(event.data.turn)) return
    const at = typeof event.time === 'number' && Number.isFinite(event.time) ? event.time : 0
    // The map's insertion order is the eviction order: a moved key is re-inserted
    // so the oldest idle session goes first.
    last.delete(sessionId)
    last.set(sessionId, { outcome: turnOutcomeOf(event.data.reason), turn: event.data.turn, at })
    if (last.size <= KEPT_SESSIONS) return
    const oldest = last.keys().next().value
    if (oldest !== undefined) last.delete(oldest)
  }

  const stop = typeof ctx.on === 'function'
    ? ctx.on('session/event', (session: { id?: unknown } | null, event: TurnEvent) => {
        const id = typeof session?.id === 'string' ? session.id : ''
        if (id === '' || event?.type !== 'turn/end') return
        remember(id, event)
      })
    : null

  return {
    /** What ended the session's latest turn, or null while none has closed. */
    read(sessionId: string): LastTurn | null {
      return last.get(sessionId) ?? null
    },
    dispose() {
      if (disposed) return
      disposed = true
      last.clear()
      if (typeof stop === 'function') stop()
    },
  }
}
