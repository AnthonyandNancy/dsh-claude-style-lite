import type { TurnOutcome } from '@dsh-claude-style/contracts/attention'
import type { HostSessionListSnapshot, HostSessionStatusSnapshot } from '@dsh-claude-style/contracts/services'

export { turnOutcomeOf } from '@dsh-claude-style/contracts/attention'
export type { TurnOutcome } from '@dsh-claude-style/contracts/attention'

/** The host's blocking interaction kinds: approval, plan review and question. */
export type PendingKind = 'approval' | 'plan-review' | 'question'

/** The two readings a session's state has for the cues and notifications. */
export interface AttentionReading {
  /** The session waits on the reader right now. */
  pending: boolean
  /** What it waits on, or null while it does not wait. */
  pendingKind: PendingKind | null
  /** The session runs, as the live status or the list's summary says. */
  running: boolean
  /** The session is a top-level conversation, not a subagent. */
  topLevel: boolean
  /** What ended the session's latest turn, when the host reports one. */
  outcome: TurnOutcome | null
}

/** What a reading changed: a prompt the reader has not answered, or a run that ended. */
export type AttentionEvent =
  | { kind: 'blocked', sessionId: string, pending: PendingKind }
  | { kind: 'ended', sessionId: string, outcome: TurnOutcome }

/** Whether a host value names one of the three pending kinds. */
function isPendingKind(value: unknown): value is PendingKind {
  return value === 'approval' || value === 'plan-review' || value === 'question'
}

/**
 * The host's pending value, read as one of its three kinds. Live hosts carry
 * `{ kind }`; a bare string and an object without a known kind are older
 * shapes, whose only blocking meaning was approval.
 */
function pendingKindOf(raw: unknown): PendingKind | null {
  if (raw === undefined) return null
  const kind = typeof raw === 'object' && raw !== null ? (raw as { kind?: unknown }).kind : raw
  if (isPendingKind(kind)) return kind
  return 'approval'
}

/**
 * One reading of every session the cues watch: the list's top-level rows first,
 * with the live status laid over them, then any session the status carries that
 * the list has not reached (a subagent, or a list still loading). A session the
 * list does not prove top-level counts as a child, so only its prompt can cue.
 *
 * @param outcomes - what ended each session's latest turn, as the host half
 *     keeps it; a session missing from the map reads null.
 */
export function attentionReading(
  status: HostSessionStatusSnapshot | null,
  list: HostSessionListSnapshot | null,
  outcomes: ReadonlyMap<string, TurnOutcome> = new Map(),
): Map<string, AttentionReading> {
  const readings = new Map<string, AttentionReading>()
  if (list !== null) {
    for (let i = 0; i < list.ids.length; i++) {
      const id = list.ids[i]
      const row = list.byId[id]
      const live = status?.get(id)
      const pendingKind = pendingKindOf(live?.pendingInteraction)
      readings.set(id, {
        pending: pendingKind !== null,
        pendingKind,
        running: live?.running ?? row?.running === true,
        topLevel: row?.origin !== 'subagent',
        outcome: outcomes.get(id) ?? null,
      })
    }
  }
  if (status !== null) {
    for (const [id, live] of status) {
      if (readings.has(id)) continue
      const pendingKind = pendingKindOf(live.pendingInteraction)
      readings.set(id, {
        pending: pendingKind !== null,
        pendingKind,
        running: live.running === true,
        topLevel: false,
        outcome: outcomes.get(id) ?? null,
      })
    }
  }
  return readings
}

/**
 * The events two consecutive readings ask for. A session's first reading is its
 * baseline: a prompt already pending or a run already going makes no event
 * until it changes. A session that stops running while a new prompt waits
 * answers both events here.
 *
 * A turn the host reports as forked is the reader's own branch: the run ended
 * because the work moved elsewhere, so it asks for no ending event.
 */
export function attentionEvents(previous: ReadonlyMap<string, AttentionReading>, next: ReadonlyMap<string, AttentionReading>): AttentionEvent[] {
  const events: AttentionEvent[] = []
  for (const [id, now] of next) {
    const before = previous.get(id)
    if (before === undefined) continue
    if (now.pendingKind !== null && now.pendingKind !== before.pendingKind) {
      events.push({ kind: 'blocked', sessionId: id, pending: now.pendingKind })
    }
    if (!now.topLevel || !before.running || now.running) continue
    if (now.outcome === 'forked') continue
    events.push({ kind: 'ended', sessionId: id, outcome: now.outcome ?? 'unknown' })
  }
  return events
}
