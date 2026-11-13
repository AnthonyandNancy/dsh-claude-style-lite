import type { HostSessionListSnapshot, HostSessionStatusSnapshot } from '@dsh-claude-style/contracts/services'

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
}

/** What a reading changed: a prompt the reader has not answered, or a finished run. */
export type AttentionEvent =
  | { kind: 'blocked', sessionId: string, pending: PendingKind }
  | { kind: 'finished', sessionId: string }

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
 */
export function attentionReading(status: HostSessionStatusSnapshot | null, list: HostSessionListSnapshot | null): Map<string, AttentionReading> {
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
 */
export function attentionEvents(previous: ReadonlyMap<string, AttentionReading>, next: ReadonlyMap<string, AttentionReading>): AttentionEvent[] {
  const events: AttentionEvent[] = []
  for (const [id, now] of next) {
    const before = previous.get(id)
    if (before === undefined) continue
    if (now.pendingKind !== null && now.pendingKind !== before.pendingKind) {
      events.push({ kind: 'blocked', sessionId: id, pending: now.pendingKind })
    }
    if (now.topLevel && before.running && !now.running) events.push({ kind: 'finished', sessionId: id })
  }
  return events
}
