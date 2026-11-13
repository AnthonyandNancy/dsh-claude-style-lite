/**
 * The host services a snapshot reader needs: the session list and the live
 * status, each with its subscribe seat. A spec installs this fixture, gives the
 * page whatever service shape its own subject adds, then applies the skin, so a
 * feature's first reading is the fixture's baseline rather than the stand-in
 * page's own.
 *
 * The fixture lives at `window.__snapshotHost` inside the page.
 */
export async function installSnapshotHost(t, { status, list }) {
  await t.page.evaluate(({ initialStatus, initialList }) => {
    // The page's own generation goes first, so the caller's apply is a clean one.
    window.__dispose()
    const channels = { list: new Set(), status: new Set(), opened: [] }
    const subscribe = (key) => (listener) => { channels[key].add(listener); return () => channels[key].delete(listener) }
    const emit = (key) => { for (const listener of [...channels[key]]) listener() }
    let statusNow = new Map(Object.entries(initialStatus))
    let listNow = initialList
    const uiSession = {
      current: { value: { key: 'a' }, subscribe: () => () => {} },
      sessionStatus: { getSnapshot: () => statusNow, subscribe: subscribe('status') },
    }
    const sessions = {
      list: { getSnapshot: () => listNow, subscribe: subscribe('list') },
      binding: () => null,
      refresh: () => Promise.resolve(),
    }
    const uiWorkspace = { openSession: (id) => channels.opened.push(id) }
    const supplied = { uiSession, sessions, uiWorkspace }
    const originalGet = window.__ctxOriginalGet ?? window.__ctx.get.bind(window.__ctx)
    window.__ctxOriginalGet = originalGet
    window.__ctx.get = (name) => Object.hasOwn(supplied, name) ? supplied[name] : originalGet(name)
    window.__ctx.inject = (_dependencies, callback) => {
      const disposers = []
      callback({
        get: window.__ctx.get,
        effect: (effect) => {
          const dispose = effect()
          if (typeof dispose === 'function') disposers.push(dispose)
          return dispose
        },
      })
      return { dispose: () => { for (const dispose of disposers.splice(0).reverse()) dispose() } }
    }
    window.__snapshotHost = {
      channels,
      setStatus(next) { statusNow = new Map(Object.entries(next)); emit('status') },
      setList(next) { listNow = next; emit('list') },
    }
  }, { initialStatus: status, initialList: list })
}

/** Apply this page's skin on the fixture's services, then let the page settle. */
export async function applySnapshotHost(t) {
  await t.page.evaluate(() => {
    window.__skin.apply(window.__ctx)
    // The late-forms page starts without the settings namespace; it arrives
    // here the way a cold page sees the host's wire read answer.
    window.__serveNamespace()
  })
  await t.settle()
}

/** Tear this generation down and apply the skin again on the same fixture. */
export async function restartSnapshotHost(t, capability) {
  await t.page.evaluate((input) => {
    if (input !== undefined) window.__hostNotify = { capability: input, sent: [], activation: null }
    window.__dispose()
  }, capability)
  await applySnapshotHost(t)
}

export async function setSnapshotStatus(t, status, waitMs = 350) {
  await t.page.evaluate((entries) => window.__snapshotHost.setStatus(entries), status)
  if (waitMs > 0) await t.page.waitForTimeout(waitMs)
}

/**
 * What ended each named session's latest turn, as the private route answers it.
 *
 * A session named here holds `{ outcome, at }`; one left out answers null, the
 * way a host with no `turn/end` for it does. The page's own fetch stub reads
 * this through `window.__turnOutcomes`.
 */
export async function setTurnOutcomes(t, outcomes) {
  await t.page.evaluate((entries) => { window.__turnOutcomes = entries }, outcomes)
}

/** Mark one session's latest turn ending with one host reason. */
export async function endTurn(t, sessionId, reason = 'completed') {
  await t.page.evaluate(({ id, kind }) => {
    window.__turnOutcomes = { ...(window.__turnOutcomes ?? {}), [id]: { outcome: kind, at: Date.now() } }
  }, { id: sessionId, kind: reason })
}

/** A list holding the named sessions, each row carrying the status's running flag. */
export function sessionList(status, { subagents = [] } = {}) {
  const ids = Object.keys(status).filter(id => !subagents.includes(id))
  return {
    phase: 'ready',
    ids,
    byId: Object.fromEntries(ids.map(id => [id, { id, displayTitle: `Session ${id}`, updatedAt: 1, running: status[id].running === true }])),
    projectionsBySession: {},
  }
}
