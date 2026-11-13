import type { HandleName } from './scheduler'

/**
 * The page-wide handles whose inputs lie outside the conversation column. A
 * batch wholly inside the column cannot change what they read; each keeps its
 * own host, preference or size subscription for changes outside it. A handle
 * not named here runs on every pass.
 */
export const CONTENT_ONLY_HANDLES: ReadonlySet<HandleName> = new Set<HandleName>([
  'heroMenu',
  'homeRipple',
  'mascot',
  'meterRing',
  'permissions',
  'questionCard',
  'search',
  'settingsNav',
  'workspace',
])

/** Whether one handle may skip a batch confined to the conversation column. */
export function skipsOnContentOnly(name: HandleName) {
  return CONTENT_ONLY_HANDLES.has(name)
}
