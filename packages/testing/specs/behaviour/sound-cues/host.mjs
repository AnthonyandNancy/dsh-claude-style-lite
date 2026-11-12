/**
 * Only the two host services the cues read are supplied here: the session list
 * and the live status, each with its subscribe seat. The skin is disposed and
 * applied again after the fixture hands them over, so the feature's first
 * reading is the fixture's baseline rather than the stand-in page's own.
 *
 * The private sound route is answered in Node: the capability read says the
 * host can play, and every POST is recorded. No process is started, so the
 * spec hears no system sound.
 */
import { applySnapshotHost, installSnapshotHost, sessionList, setSnapshotStatus } from '../notifications/snapshot-host.mjs'

export { sessionList }

export async function setup(t, { status, list }) {
  const posts = []
  await t.page.route('**/dsh-claude-style-lite/sound', async (route) => {
    const request = route.request()
    if (request.method() === 'GET') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, playback: 'system', sounds: ['pop', 'tink'] }) })
      return
    }
    posts.push(JSON.parse(request.postData() ?? 'null'))
    await route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' })
  })

  await installSnapshotHost(t, { status, list })
  await applySnapshotHost(t)
  return {
    posts,
    async status(next, waitMs = 450) {
      await setSnapshotStatus(t, next, waitMs)
    },
    async list(next, waitMs = 450) {
      await t.page.evaluate((entries) => window.__snapshotHost.setList(entries), next)
      if (waitMs > 0) await t.page.waitForTimeout(waitMs)
    },
    async wait(ms = 450) {
      await t.page.waitForTimeout(ms)
    },
  }
}
