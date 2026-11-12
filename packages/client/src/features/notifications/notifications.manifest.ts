import type { FeatureManifest } from '../../core/feature'

export default {
  id: 'notifications',
  order: 51,
  pref: 'notifications',
  contracts: [],
  stylesheets: [],
  settingsRows: [{
    tab: 'general',
    rank: 61,
    pref: 'notifications',
    title: 'notificationsTitle',
    desc: 'notificationsDesc',
    status: 'notification-permission',
  }],
  cases: ['settings'],
  scenarios: [],
} satisfies FeatureManifest
