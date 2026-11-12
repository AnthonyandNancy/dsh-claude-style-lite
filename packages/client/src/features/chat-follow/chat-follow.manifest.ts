import type { FeatureManifest } from '../../core/feature'

export default {
  id: 'chatFollow',
  order: 190,
  reads: ['chatFold'],
  contracts: ['chat.call', 'chat.flow', 'chat.flow-block', 'chat.following-tail', 'chat.following-tail-attribute', 'chat.phase', 'chat.running', 'chat.scroller', 'chat.shimmer', 'chat.streaming', 'chat.think-row', 'chat.think-running', 'chat.follow-threshold', 'fold.disclosure', 'fold.disclosure-header', 'fold.expanded', 'process.body', 'process.content', 'process.expanded-mode'],
  pref: 'chatAnimations',
  yieldsTo: 'dsh-chat-ux',
  stylesheets: [{ file: 'chat-follow.css', rank: 160 }],
  settingsRows: [{
    // The Motion tab's own row: what is left of the chat-area switch after the
    // waiting line and the sent message's entrance took switches of their own.
    tab: 'motion',
    rank: 10,
    pref: 'chatAnimations',
    title: 'chatAnimationsTitle',
  }],
  cases: ['chat-follow'],
  scenarios: ['readerScroll', 'scroll', 'doorPin'],
} satisfies FeatureManifest
