/**
 * The page-wide features that may skip a batch confined to the conversation
 * column, and no others, are named in one place. A feature's own host or size
 * subscription covers each change the batch could have carried.
 *
 * @capability page-observation
 * @features engine
 * @risk A page-wide feature silently stops following a change outside the transcript, or a transcript-bound feature is added to the skip list.
 */
import { expect, test } from 'vitest'
import { CONTENT_ONLY_HANDLES } from '@dsh-claude-style/client/pure'

test('the skip list holds exactly the page-wide handles that own their outside changes', () => {
  expect([...CONTENT_ONLY_HANDLES].sort()).toEqual([
    'chatWait',
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
})
