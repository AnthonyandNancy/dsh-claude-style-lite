/**
 * The notification switch is on by default; completion and all three blocked
 * interactions raise one notification, and a click opens the session.
 *
 * @capability notifications
 * @features notifications
 * @risk A blocked interaction publishes repeatedly, the switch off still asks for permission, or a click opens the wrong session.
 */
import { spec } from '../../fixtures/behaviour.mjs'
import { sessionList, setup } from './host.mjs'

export default spec({ page: 'late-forms' }, ({ test }) => {
  test('completion and the three blocked kinds each notify once', async (t) => {
    const initial = { a: { running: true } }
    const host = await setup(t, { status: initial, list: sessionList(initial) })
    t.expectThat.equal(await host.notifications(), [], 'a run already going at load is the baseline')

    await host.status({ a: { running: true, pendingInteraction: { kind: 'approval' } } })
    await host.status({ a: { running: true, pendingInteraction: { kind: 'question' } } })
    await host.status({ a: { running: true, pendingInteraction: { kind: 'plan-review' } } })
    await host.status({ a: { running: false, pendingInteraction: { kind: 'plan-review' } } })
    await host.status({ a: { running: false, pendingInteraction: { kind: 'plan-review' } } })

    const rows = await host.notifications()
    t.expectThat.equal(rows.map((row) => row.title), ['Waiting for approval', 'Waiting for an answer', 'Waiting for plan review', 'Task finished'], 'each change has its own title')
    t.expectThat.equal(rows.map((row) => row.body), ['Session a', 'Session a', 'Session a', 'Session a'], 'the body names the session')
    t.expectThat.equal(rows.every((row) => row.silent === true), true, 'the notification does not add its own sound')
    t.expectThat.equal(rows.length, 4, 'a repeated status publishes nothing')

    await host.click(0)
    t.expectThat.equal(await host.opened(), ['a'], 'the click opens the session')
  })

  test('the switch off leaves no notifier and asks for no permission', async (t) => {
    await t.prefs({ notifications: false })
    const initial = { a: { running: true } }
    const host = await setup(t, { status: initial, list: sessionList(initial) })
    await host.status({ a: { running: true, pendingInteraction: 'question' } })
    t.expectThat.equal(await host.notifications(), [], 'off publishes nothing')
    t.expectThat.equal(await host.requests(), [], 'off asks for no permission')
  })

  test('a denied permission is asked once and then stays quiet', async (t) => {
    const initial = { a: { running: true } }
    const host = await setup(t, { status: initial, list: sessionList(initial) })
    await host.denyPermission()
    await host.status({ a: { running: true, pendingInteraction: 'approval' } })
    await host.status({ a: { running: false } })
    t.expectThat.equal(await host.notifications(), [], 'a denied permission publishes nothing')
    t.expectThat.equal(await host.requests(), ['request'], 'permission is requested once')
  })

  test('a reading with both events asks for permission once', async (t) => {
    const initial = { a: { running: true } }
    const host = await setup(t, { status: initial, list: sessionList(initial) })
    await host.grantOnRequest()
    // One reading answers a blocked prompt and the stopped run together.
    await host.status({ a: { running: false, pendingInteraction: 'approval' } })
    t.expectThat.equal(await host.requests(), ['request'], 'two events share the one permission request')
    t.expectThat.equal((await host.notifications()).length, 2, 'both events still notify')
  })

  test('a host channel raises no page Notification and opens the clicked session', async (t) => {
    const initial = { a: { running: true } }
    const host = await setup(t, { status: initial, list: sessionList(initial), capability: { ok: true, channel: 'toast', clickReturnsSession: true } })
    await host.status({ a: { running: false } })
    await t.settle()
    t.expectThat.equal((await host.notifications()).length, 0, 'the host channel does not use window.Notification')
    t.expectThat.equal((await host.sent()).length, 1, 'one host notification is posted')
    await host.activation({ sessionId: 'a', at: Date.now() })
    await t.page.waitForTimeout(1800)
    t.expectThat.equal((await host.opened()).at(-1), 'a', 'the clicked session opens once')
  })
})
