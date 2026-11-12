/**
 * A notification stand-in records every constructor and lets the spec press a
 * notification's click handler. The fixture supplies the host's two snapshots,
 * then the skin applies; the feature's first reading is that baseline.
 */
import { applySnapshotHost, installSnapshotHost, restartSnapshotHost, sessionList, setSnapshotStatus } from './snapshot-host.mjs'

export { sessionList }

export async function setup(t, { status, list }) {
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
    async denyPermission() {
      await t.page.evaluate(() => window.Notification.allowOnRequest('denied'))
      await restartSnapshotHost(t)
    },
    async grantOnRequest() {
      await t.page.evaluate(() => window.Notification.allowOnRequest('granted'))
      await restartSnapshotHost(t)
    },
    status: (next, waitMs) => setSnapshotStatus(t, next, waitMs),
  }
}
