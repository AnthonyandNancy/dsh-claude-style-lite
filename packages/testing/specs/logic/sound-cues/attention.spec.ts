/**
 * The cue reader turns the host's live snapshots into the two cue moments. The
 * notification reader shares it, so this spec keeps the sound cue's own reading
 * of a pending interaction and a stop.
 *
 * @capability sound-cues
 * @features sound-cues
 * @risk A prompt already pending at load cues again, a subagent's finish reads as the task's finish, a repeated status publication plays the same cue twice, or a stopped run plays no cue at all.
 */
import { expect, test } from 'vitest'
import { attentionEvents, attentionReading } from '@dsh-claude-style/client/pure'
import { list, readings, status } from '../notifications/attention-fixtures'

test('a pending interaction and a stopped run are the two cue moments', () => {
  const running = readings({ chat: { running: true } })
  const waiting = readings({ chat: { running: true, pending: true, pendingKind: 'plan-review' } })
  expect(attentionEvents(running, waiting)).toEqual([{ kind: 'blocked', sessionId: 'chat', pending: 'plan-review' }])
  expect(attentionEvents(running, readings({ chat: { running: false, outcome: 'completed' } }))).toEqual([{ kind: 'ended', sessionId: 'chat', outcome: 'completed' }])
})

test('a stop cues whatever its outcome, because the cue does not word it', () => {
  for (const outcome of ['completed', 'stopped', 'failed', 'interrupted', 'truncated', 'blocked', 'unknown'] as const) {
    expect(attentionEvents(readings({ chat: { running: true } }), readings({ chat: { running: false, outcome } }))).toEqual([
      { kind: 'ended', sessionId: 'chat', outcome },
    ])
  }
})

test('a repeated reading is quiet, while another pending kind is a new cue', () => {
  const approval = readings({ chat: { running: true, pending: true, pendingKind: 'approval' } })
  expect(attentionEvents(approval, readings({ chat: { running: true, pending: true, pendingKind: 'approval' } }))).toEqual([])
  expect(attentionEvents(approval, readings({ chat: { running: true, pending: true, pendingKind: 'question' } }))).toEqual([
    { kind: 'blocked', sessionId: 'chat', pending: 'question' },
  ])
})

test('a child stop is quiet, and a child prompt still cues', () => {
  const childRunning = readings({ child: { running: true, topLevel: false } })
  const childWaiting = readings({ child: { running: false, topLevel: false, pending: true, pendingKind: 'approval' } })
  expect(attentionEvents(childRunning, readings({ child: { running: false, topLevel: false, outcome: 'completed' } }))).toEqual([])
  expect(attentionEvents(childRunning, childWaiting)).toEqual([{ kind: 'blocked', sessionId: 'child', pending: 'approval' }])
})

test('one reading can answer a prompt and the stop together', () => {
  expect(attentionEvents(readings({ chat: { running: true } }), readings({ chat: { running: false, pending: true, pendingKind: 'question', outcome: 'stopped' } }))).toEqual([
    { kind: 'blocked', sessionId: 'chat', pending: 'question' },
    { kind: 'ended', sessionId: 'chat', outcome: 'stopped' },
  ])
})

test('the live status lays over the list, and the sessions it alone carries are children', () => {
  const snapshot = attentionReading(
    status({ chat: { running: false }, worker: { running: true, pendingInteraction: 'approval' } }),
    list(['chat', 'child'], { chat: { running: true }, child: { running: true, origin: 'subagent' } }),
  )
  expect([...snapshot]).toEqual([
    ['chat', { pending: false, pendingKind: null, running: false, topLevel: true, outcome: null }],
    ['child', { pending: false, pendingKind: null, running: true, topLevel: false, outcome: null }],
    ['worker', { pending: true, pendingKind: 'approval', running: true, topLevel: false, outcome: null }],
  ])
})

test('a missing snapshot leaves the other one to answer alone', () => {
  expect(attentionReading(status({ chat: { running: true, pendingInteraction: {} } }), null).get('chat')?.pendingKind).toBe('approval')
  expect(attentionReading(null, list(['chat'], { chat: { running: true } })).get('chat')?.running).toBe(true)
  expect(attentionReading(null, null).size).toBe(0)
})
