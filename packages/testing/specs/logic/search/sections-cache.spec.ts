/**
 * The rows that do not depend on the query are built once for one host
 * snapshot. Two keystrokes over the same snapshot reuse the session rows while
 * the query still filters and orders them.
 *
 * @capability search
 * @features search
 * @risk A cached row set survives a session-list update or a language switch and the palette lists a deleted session or stale copy.
 */
import { expect, test } from 'vitest'
import { createSearchSources } from '@dsh-claude-style/client/pure'
import type { HostContext } from '@dsh-claude-style/engine/host'

/** One host list as the host hands it out: a snapshot method that keeps its answer until the next publish. */
function source<Snapshot>(snapshot: () => Snapshot) {
  return { getSnapshot: snapshot, subscribe: () => () => {} }
}

/** Search over one session list and one workspace list, as the palette reads them. */
function sourcesFor(list: () => unknown, workspaceSnapshot: () => unknown) {
  const sessions = { list: source(list) }
  const workspaces = { list: source(workspaceSnapshot) }
  const ctx = { get: (name: string) => name === 'sessions' ? sessions : name === 'workspaces' ? workspaces : undefined } as unknown as HostContext
  return createSearchSources(ctx, () => {})
}

test('two sections over one snapshot read the session list once', () => {
  let reads = 0
  const summary = { id: 'a', displayTitle: 'Alpha', updatedAt: 1 }
  const byId = {
    get a() {
      reads += 1
      return summary
    },
  }
  const list = { ids: ['a'], byId, projectionsBySession: {} }
  const workspaceSnapshot = { items: [], archivedSessionIds: [] }
  const sources = sourcesFor(() => list, () => workspaceSnapshot)
  sources.sections('a', 'session', [])
  sources.sections('al', 'session', [])
  expect(reads).toBe(1)
})

test('a published session list builds the session rows again', () => {
  let list: {
    ids: string[]
    byId: Record<string, { id: string, displayTitle: string, updatedAt: number }>
    projectionsBySession: Record<string, never>
  } = { ids: ['a'], byId: { a: { id: 'a', displayTitle: 'Alpha', updatedAt: 1 } }, projectionsBySession: {} }
  const workspaceSnapshot = { items: [], archivedSessionIds: [] }
  const sources = sourcesFor(() => list, () => workspaceSnapshot)
  expect(sources.sections('a', 'session', [])[0].rows.map(row => row.title)).toEqual(['Alpha'])
  list = { ids: ['b'], byId: { b: { id: 'b', displayTitle: 'Beta', updatedAt: 1 } }, projectionsBySession: {} }
  expect(sources.sections('b', 'session', [])[0].rows.map(row => row.title)).toEqual(['Beta'])
})
