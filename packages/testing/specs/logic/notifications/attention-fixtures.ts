import type { AttentionReading } from '@dsh-claude-style/client/pure'
import type { HostSessionListSnapshot, HostSessionStatusSnapshot } from '@dsh-claude-style/contracts/services'

/** Fixtures both attention readers judge: their one shared surface is the reading they consume. */
export function readings(entries: Record<string, Partial<AttentionReading>>): Map<string, AttentionReading> {
  return new Map(Object.entries(entries).map(([id, entry]) => [id, {
    pending: entry.pending ?? false,
    pendingKind: entry.pendingKind ?? null,
    running: entry.running ?? false,
    topLevel: entry.topLevel !== false,
  }]))
}

export function status(entries: Record<string, { running?: boolean, pendingInteraction?: unknown }>): HostSessionStatusSnapshot {
  return new Map(Object.entries(entries)) as unknown as HostSessionStatusSnapshot
}

export function list(ids: string[], rows: Record<string, { running?: boolean, origin?: string }>): HostSessionListSnapshot {
  return {
    phase: 'ready',
    ids,
    byId: Object.fromEntries(ids.map(id => [id, { id, displayTitle: id, updatedAt: 1, ...rows[id] }])),
    projectionsBySession: {},
  }
}
