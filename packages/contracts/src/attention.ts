/**
 * What ended a run, in the vocabulary the notification copy names (D97).
 *
 * The host's `turn/end` carries a closed reason map; both halves read the same
 * mapping so a stopped or failed round never reaches the reader as a finished
 * task.
 */

/** The outcomes a closed turn can have for the reader. */
export const TURN_OUTCOMES = ['completed', 'stopped', 'failed', 'interrupted', 'forked', 'truncated', 'blocked', 'unknown'] as const
export type TurnOutcome = typeof TURN_OUTCOMES[number]

/** Whether a value names one of the outcomes the private route carries. */
export function isTurnOutcome(value: unknown): value is TurnOutcome {
  return typeof value === 'string' && (TURN_OUTCOMES as readonly string[]).includes(value)
}

/**
 * The host's `turn/end` reason as the outcome the reader is told about.
 *
 * `aborted` covers the reader's own stop, a goal pause, an archived session and
 * a cancelled hook alike; the cause stays in the host log and does not change
 * the wording. A reason this build does not know reads `unknown`, never
 * `completed`, so an unrecognised ending cannot claim a task succeeded.
 */
export function turnOutcomeOf(reason: unknown): TurnOutcome {
  const kind = typeof reason === 'object' && reason !== null ? (reason as { kind?: unknown }).kind : reason
  switch (kind) {
    case 'completed': return 'completed'
    case 'aborted': return 'stopped'
    case 'error': return 'failed'
    case 'interrupted': return 'interrupted'
    case 'forked': return 'forked'
    case 'max-tokens': return 'truncated'
    case 'blocked': return 'blocked'
    default: return 'unknown'
  }
}
