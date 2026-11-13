/**
 * A notification stand-in records every constructor and lets the spec press a
 * notification's click handler. The fixture supplies the host's two snapshots
 * and the ending reason of each session's latest turn, then the skin applies;
 * the feature's first reading is that baseline.
 */
import { applySnapshotHost, endTurn, installSnapshotHost, restartSnapshotHost, sessionList, setSnapshotStatus, setTurnOutcomes } from './snapshot-host.mjs'

export { sessionList }

export async function setup(t, { status, list, capability, outcomes }) {
  if (outcomes !== undefined) await setTurnOutcomes(t, outcomes)
  if (capability !== undefined) {
    await t.page.evaluate((input) => {
      window.__hostNotify = { capability: input, sent: [], activation: null }
    }, capability)
  }
  await t.page.evaluate(() => {
    const notifications = []
    const requests = []
    function FakeNotification(title, options) {
      this.title = title
      this.options = options
      this.onclick = null
      this.onclose = null
      this.closed = false
      this.close = () => {
        this.closed = true
        if (typeof this.onclose === 'function') this.onclose()
      }
      notifications.push(this)
    }
    FakeNotification.permission = 'granted'
    FakeNotification.requestPermission = () => {
      requests.push('request')
      return Promise.resolve(FakeNotification.permission)
    }
    FakeNotification.allowOnRequest = (permission) => {
      FakeNotification.permission = 'default'
      FakeNotification.requestPermission = () => {
        requests.push('request')
        FakeNotification.permission = permission
        return Promise.resolve(permission)
      }
    }
    window.Notification = FakeNotification
    window.__notificationStandIn = { notifications, requests }
  })
  await installSnapshotHost(t, { status, list })
  await applySnapshotHost(t)
  return {
    notifications: () => t.page.evaluate(() => window.__notificationStandIn.notifications.map((notification) => ({
      title: notification.title,
      body: notification.options.body,
      silent: notification.options.silent,
    }))),
    requests: () => t.page.evaluate(() => window.__notificationStandIn.requests.slice()),
    click: (index) => t.page.evaluate((at) => window.__notificationStandIn.notifications[at].onclick(), index),
    opened: () => t.page.evaluate(() => window.__snapshotHost.channels.opened),
    async denyPermission(capability) {
      await t.page.evaluate(() => window.Notification.allowOnRequest('denied'))
      await restartSnapshotHost(t, capability)
    },
    async grantOnRequest(capability) {
      await t.page.evaluate(() => window.Notification.allowOnRequest('granted'))
      await restartSnapshotHost(t, capability)
    },
    status: (next, waitMs) => setSnapshotStatus(t, next, waitMs),
    /** Name what ended the session's latest turn before its stop is published. */
    endTurn: (sessionId, reason) => endTurn(t, sessionId, reason),
    /** Give the page its own host capability before the feature's one read. */
    capability: (value) => t.page.evaluate((input) => {
      window.__hostNotify = { capability: input, sent: [], activation: null }
    }, value),
    sent: () => t.page.evaluate(() => window.__hostNotify.sent.slice()),
    activation: (value) => t.page.evaluate((input) => {
      window.__hostNotify.activation = input
    }, value),
  }
}
