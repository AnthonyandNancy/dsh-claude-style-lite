import { isTurnOutcome } from '@dsh-claude-style/contracts/attention'
import { TURN_OUTCOME_PATH } from '@dsh-claude-style/contracts/routes'
import { hostSessions, hostUiSession } from '@dsh-claude-style/engine/host'
import { attentionEvents, attentionReading } from './attention'
import type { AttentionEvent, AttentionReading, TurnOutcome } from './attention'
import type { HostContext } from '@dsh-claude-style/engine/host'
import type { HostSessionListSnapshot, HostSessionStatusSnapshot, HostSnapshotSource } from '@dsh-claude-style/contracts/services'

/**
 * Watch the two host snapshots the cues read and answer each publication with
 * the events since the last one. The first reading is the baseline.
 *
 * A stopped run's reason is not in the live status, so the host half keeps each
 * session's latest `turn/end` and the feed reads it when a top-level session
 * stops. The ending event waits for that read, so a pause or a failure never
 * reaches the reader as a finished task (D97).
 *
 * The services can mount after this feature (the page boots it before the
 * shell finishes), so `ctx.inject` waits for both where the host offers it; a
 * host without the wait reads what stands now.
 */
export function createAttentionFeed(ctx: HostContext, onEvent: (event: AttentionEvent, title: string) => void) {
  let previous: Map<string, AttentionReading> | null = null
  let statusSource: HostSnapshotSource<HostSessionStatusSnapshot> | undefined
  let listSource: HostSnapshotSource<HostSessionListSnapshot> | undefined
  let stopStatus: (() => void) | null = null
  let stopList: (() => void) | null = null
  /** What ended each session's latest turn, as the host half last answered it. */
  const outcomes = new Map<string, TurnOutcome>()
  /** The reading a stop was answered for, so the same stop asks the host once. */
  const answeredStops = new Map<string, AttentionReading>()
  /** The sessions whose stop is being read; a publication meanwhile is picked up after it. */
  const readingStops = new Set<string>()
  let disposed = false

  /** Read one session's latest ending reason, or null when the route cannot answer. */
  async function readOutcome(sessionId: string): Promise<TurnOutcome | null> {
    try {
      const response = await fetch(`${TURN_OUTCOME_PATH}?id=${encodeURIComponent(sessionId)}`, { cache: 'no-store' })
      if (!response.ok) return null
      const answer = await response.json() as { ok?: unknown, outcome?: { outcome?: unknown } | null }
      if (answer?.ok !== true || answer.outcome === null || typeof answer.outcome !== 'object') return null
      return isTurnOutcome(answer.outcome.outcome) ? answer.outcome.outcome : null
    } catch (error) {
      // The ending reason decides only the notification's wording; a failed
      // read must not reach the status subscription that asked for it (D12).
      console.warn('notifications: the turn outcome read failed', error)
      return null
    }
  }

  /** Emit the events between the last reading and `next`, then keep `next`. */
  function publish(next: Map<string, AttentionReading>, list: HostSessionListSnapshot | null) {
    if (previous === null) {
      previous = next
      return
    }
    const events = attentionEvents(previous, next)
    previous = next
    for (let i = 0; i < events.length; i++) {
      const event = events[i]
      const title = list?.byId[event.sessionId]?.displayTitle || event.sessionId
      onEvent(event, title)
    }
  }

  function read() {
    if (disposed || readingStops.size > 0) return
    const status = typeof statusSource?.getSnapshot === 'function' ? statusSource.getSnapshot() : null
    const list = typeof listSource?.getSnapshot === 'function' ? listSource.getSnapshot() : null
    const next = attentionReading(status, list, outcomes)
    if (previous === null) {
      previous = next
      return
    }
    /** The stop of each session the host has not been asked about yet. */
    const stops: [string, AttentionReading][] = []
    for (const [id, now] of next) {
      const before = previous.get(id)
      if (now.running) {
        answeredStops.delete(id)
        outcomes.delete(id)
        continue
      }
      if (!now.topLevel || before === undefined || !before.running) continue
      if (answeredStops.get(id) === before) continue
      stops.push([id, before])
    }
    if (stops.length > 0) {
      for (const [id] of stops) readingStops.add(id)
      void Promise.all(stops.map(async ([id]) => [id, await readOutcome(id)] as const)).then((answers) => {
        if (disposed) return
        for (let i = 0; i < answers.length; i++) {
          const [id, outcome] = answers[i]
          outcomes.set(id, outcome ?? 'unknown')
          answeredStops.set(id, stops[i][1])
          readingStops.delete(id)
        }
        // The reading the stop was detected on carries no outcome yet; a fresh
        // one applies the host's answer before anything is published.
        read()
      })
      return
    }
    publish(next, list)
  }

  function bind(scope: HostContext) {
    if (disposed) return
    const status = hostUiSession(scope)?.sessionStatus
    const list = hostSessions(scope)?.list
    if (status !== statusSource) {
      if (stopStatus !== null) stopStatus()
      statusSource = status
      stopStatus = typeof status?.subscribe === 'function' ? status.subscribe(read) : null
    }
    if (list !== listSource) {
      if (stopList !== null) stopList()
      listSource = list
      stopList = typeof list?.subscribe === 'function' ? list.subscribe(read) : null
    }
    read()
  }

  const fiber = typeof ctx.inject === 'function' ? ctx.inject(['uiSession', 'sessions'], bind) : null
  if (fiber === null) bind(ctx)

  return {
    dispose() {
      disposed = true
      if (stopStatus !== null) stopStatus()
      if (stopList !== null) stopList()
      fiber?.dispose()
    },
  }
}
