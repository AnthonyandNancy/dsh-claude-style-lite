/**
 * The cue reader turns the host's live snapshots into the two cue moments. The
 * notification reader shares it, so this spec keeps the sound cue's own reading
 * of a pending interaction and a stop.
 *
 * @capability sound-cues
 * @features sound-cues
 * @risk A prompt already pending at load cues again, a subagent's finish reads as the task's finish, or a repeated status publication plays the same cue twice.
 */
import { expect, test } from 'vitest'
import { attentionEvents, attentionReading } from '@dsh-claude-style/client/pure'
import { list, readings, status } from '../notifications/attention-fixtures'

test('a pending interaction and a stopped run are the two cue moments', () => {
  const running = readings({ chat: { running: true } })
  const waiting = readings({ chat: { running: true, pending: true, pendingKind: 'plan-review' } })
  expect(attentionEvents(running, waiting)).toEqual([{ kind: 'blocked', sessionId: 'chat', pending: 'plan-review' }])
  expect(attentionEvents(running, readings({ chat: { running: false } }))).toEqual([{ kind: 'finished', sessionId: 'chat' }])
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
  expect(attentionEvents(childRunning, readings({ child: { running: false, topLevel: false } }))).toEqual([])
  expect(attentionEvents(childRunning, childWaiting)).toEqual([{ kind: 'blocked', sessionId: 'child', pending: 'approval' }])
})

test('one reading can answer a prompt and the stop together', () => {
  expect(attentionEvents(readings({ chat: { running: true } }), readings({ chat: { running: false, pending: true, pendingKind: 'question' } }))).toEqual([
    { kind: 'blocked', sessionId: 'chat', pending: 'question' },
    { kind: 'finished', sessionId: 'chat' },
  ])
})

test('the live status lays over the list, and the sessions it alone carries are children', () => {
  const snapshot = attentionReading(
    status({ chat: { running: false }, worker: { running: true, pendingInteraction: 'approval' } }),
    list(['chat', 'child'], { chat: { running: true }, child: { running: true, origin: 'subagent' } }),
  )
  expect([...snapshot]).toEqual([
    ['chat', { pending: false, pendingKind: null, running: false, topLevel: true }],
    ['child', { pending: false, pendingKind: null, running: true, topLevel: false }],
    ['worker', { pending: true, pendingKind: 'approval', running: true, topLevel: false }],
  ])
})

test('a missing snapshot leaves the other one to answer alone', () => {
  expect(attentionReading(status({ chat: { running: true, pendingInteraction: {} } }), null).get('chat')?.pendingKind).toBe('approval')
  expect(attentionReading(null, list(['chat'], { chat: { running: true } })).get('chat')?.running).toBe(true)
  expect(attentionReading(null, null).size).toBe(0)
})
