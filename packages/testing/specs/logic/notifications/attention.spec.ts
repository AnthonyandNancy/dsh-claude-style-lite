/**
 * The attention reading keeps the host's three interaction kinds apart, so a
 * notification can say what the task is waiting on.
 *
 * @capability notifications
 * @features notifications
 * @risk Every pending interaction reads as approval, a repeated status publishes twice, or a subagent's finish reads as the task's.
 */
import { expect, test } from 'vitest'
import { attentionEvents, attentionReading } from '@dsh-claude-style/client/pure'
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

test('a repeated status publishes nothing, and a changed kind publishes once', () => {
  const waiting = readings({ a: { pending: true, pendingKind: 'approval', running: true } })
  expect(attentionEvents(waiting, waiting)).toEqual([])
  expect(attentionEvents(waiting, readings({ a: { pending: true, pendingKind: 'question', running: true } }))).toEqual([
    { kind: 'blocked', sessionId: 'a', pending: 'question' },
  ])
})

test('a top-level stop finishes, a subagent stop does not', () => {
  expect(attentionEvents(readings({ a: { running: true, topLevel: true } }), readings({ a: { running: false, topLevel: true } }))).toEqual([
    { kind: 'finished', sessionId: 'a' },
  ])
  expect(attentionEvents(readings({ s: { running: true, topLevel: false } }), readings({ s: { running: false, topLevel: false } }))).toEqual([])
})

test('the reading lays the live status over the list and keeps unknown sessions below top level', () => {
  const snapshot = attentionReading(
    status({ a: { running: false }, s: { running: true, pendingInteraction: 'question' } }),
    list(['a', 'b'], { a: { running: true }, b: { running: true, origin: 'subagent' } }),
  )
  expect(snapshot.get('a')).toEqual({ pending: false, pendingKind: null, running: false, topLevel: true })
  expect(snapshot.get('b')).toEqual({ pending: false, pendingKind: null, running: true, topLevel: false })
  expect(snapshot.get('s')).toEqual({ pending: true, pendingKind: 'question', running: true, topLevel: false })
})
