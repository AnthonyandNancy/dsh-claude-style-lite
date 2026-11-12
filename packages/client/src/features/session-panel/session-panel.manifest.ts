import type { FeatureManifest } from '../../core/feature'

export default {
  id: 'sessionPanel',
  order: 267,
  // The header control stays installed on every conversation page; the setting
  // only decides whether a session's rail starts open.
  ungated: '会话详情入口常驻在会话头部；设置只决定每个会话是否默认展开，栏本身随入口安装',
  // The rail mounts its own root on the page; it joins the first frames so a
  // late chunk cannot land inside a settled page's quiet window (D94).
  contracts: ['conversation.session-attribute', 'conversation.session', 'sidebar.chat', 'chat.scroller', 'chat.user-row', 'header.action-chips', 'shell.rightbar-column', 'shell.rightbar-toggle'],
  stylesheets: [{ file: 'session-panel.css', rank: 122 }],
  settingsRows: [{
    tab: 'conversation',
    rank: 85,
    pref: 'sessionPanelOpenByDefault',
    title: 'sessionPanelOpenByDefaultTitle',
    desc: 'sessionPanelOpenByDefaultDesc',
  }],
  cases: [],
  scenarios: ['sessionPanel'],
} satisfies FeatureManifest
