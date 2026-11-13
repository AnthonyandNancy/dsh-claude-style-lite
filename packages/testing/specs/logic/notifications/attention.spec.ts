/**
 * The attention reading keeps the host's three interaction kinds apart, so a
 * notification can say what the task is waiting on, and names what ended a run
 * so a stopped or failed task never reads as a finished one.
 *
 * @capability notifications
 * @features notifications
 * @risk Every pending interaction reads as approval, a repeated status publishes twice, a stopped or failed run reads as a finished one, or a subagent's finish reads as the task's.
 */
import { expect, test } from 'vitest'
import { attentionEvents, attentionReading, turnOutcomeOf } from '@dsh-claude-style/client/pure'
import { list, readings, status } from './attention-fixtures'

test('the first reading is the baseline', () => {
  expect(attentionEvents(readings({}), readings({ a: { pending: true, pendingKind: 'approval', running: true } }))).toEqual([])
  expect(attentionEvents(readings({ a: { running: true } }), readings({ a: { pending: true, pendingKind: 'approval', running: true } }))).toEqual([
    { kind: 'blocked', sessionId: 'a', pending: 'approval' },
  ])
})

test('the host’s three pending kinds stay apart', () => {
  for (const pending of ['approval', 'plan-review', 'question'] as const) {
    expect(attentionEvents(readings({ a: { running: true } }), readings({ a: { pending: true, pendingKind: pending, running: true } }))).toEqual([
      { kind: 'blocked', sessionId: 'a', pending },
    ])
  }
})

test('the live status carries each pending kind in its object', () => {
  for (const pending of ['approval', 'plan-review', 'question'] as const) {
    const snapshot = attentionReading(status({ a: { running: true, pendingInteraction: { kind: pending } } }), list(['a'], { a: { running: true } }))
    expect(snapshot.get('a')).toEqual({ pending: true, pendingKind: pending, running: true, topLevel: true, outcome: null })
  }
})

test('a repeated status publishes nothing, and a changed kind publishes once', () => {
  const waiting = readings({ a: { pending: true, pendingKind: 'approval', running: true } })
  expect(attentionEvents(waiting, waiting)).toEqual([])
  expect(attentionEvents(waiting, readings({ a: { pending: true, pendingKind: 'question', running: true } }))).toEqual([
    { kind: 'blocked', sessionId: 'a', pending: 'question' },
  ])
})

test('the host’s turn reasons become the outcomes the copy names', () => {
  expect(turnOutcomeOf({ kind: 'completed' })).toBe('completed')
  expect(turnOutcomeOf({ kind: 'aborted', reason: { kind: 'user' } })).toBe('stopped')
  expect(turnOutcomeOf({ kind: 'aborted', reason: { kind: 'hook', reason: 'deepseek-account/signed-out' } })).toBe('stopped')
  expect(turnOutcomeOf({ kind: 'error', error: { code: 'X', message: 'failed' } })).toBe('failed')
  expect(turnOutcomeOf({ kind: 'interrupted' })).toBe('interrupted')
  expect(turnOutcomeOf({ kind: 'forked' })).toBe('forked')
  expect(turnOutcomeOf({ kind: 'max-tokens' })).toBe('truncated')
  expect(turnOutcomeOf({ kind: 'blocked' })).toBe('blocked')
})

test('an unrecognised ending reads unknown, never completed', () => {
  expect(turnOutcomeOf(undefined)).toBe('unknown')
  expect(turnOutcomeOf({})).toBe('unknown')
  expect(turnOutcomeOf({ kind: 'something-new' })).toBe('unknown')
})

test('a stopped run states why it ended, and a normal finish states completion', () => {
  expect(attentionEvents(readings({ a: { running: true, topLevel: true } }), readings({ a: { running: false, topLevel: true, outcome: 'completed' } }))).toEqual([
    { kind: 'ended', sessionId: 'a', outcome: 'completed' },
  ])
  expect(attentionEvents(readings({ a: { running: true, topLevel: true } }), readings({ a: { running: false, topLevel: true, outcome: 'stopped' } }))).toEqual([
    { kind: 'ended', sessionId: 'a', outcome: 'stopped' },
  ])
})

test('a stop the host never named reads unknown, and a forked turn asks for nothing', () => {
  expect(attentionEvents(readings({ a: { running: true } }), readings({ a: { running: false } }))).toEqual([
    { kind: 'ended', sessionId: 'a', outcome: 'unknown' },
  ])
  expect(attentionEvents(readings({ a: { running: true } }), readings({ a: { running: false, outcome: 'forked' } }))).toEqual([])
})

test('a subagent stop asks for nothing, and its prompt still asks for a cue', () => {
  expect(attentionEvents(readings({ s: { running: true, topLevel: false } }), readings({ s: { running: false, topLevel: false, outcome: 'completed' } }))).toEqual([])
  expect(attentionEvents(readings({ s: { running: true, topLevel: false } }), readings({ s: { running: false, topLevel: false, pending: true, pendingKind: 'approval' } }))).toEqual([
    { kind: 'blocked', sessionId: 's', pending: 'approval' },
  ])
})

test('the reading lays the live status over the list and keeps unknown sessions below top level', () => {
  const snapshot = attentionReading(
    status({ a: { running: false }, s: { running: true, pendingInteraction: 'question' } }),
    list(['a', 'b'], { a: { running: true }, b: { running: true, origin: 'subagent' } }),
    new Map([['a', 'stopped']]),
  )
  expect(snapshot.get('a')).toEqual({ pending: false, pendingKind: null, running: false, topLevel: true, outcome: 'stopped' })
  expect(snapshot.get('b')).toEqual({ pending: false, pendingKind: null, running: true, topLevel: false, outcome: null })
  expect(snapshot.get('s')).toEqual({ pending: true, pendingKind: 'question', running: true, topLevel: false, outcome: null })
})
