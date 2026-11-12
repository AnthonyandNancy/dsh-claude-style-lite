#!/usr/bin/env node
/**
 * reasoning-stream.mjs — how live reasoning reaches the reader, end to end (D92).
 *
 * Registered in the lane's scenario table (packages/testing/scenarios.mjs).
 * The host renders the reasoning text itself; this module holds the reading
 * that proves the skin leaves that stream alone.
 */
import path from 'node:path'
import { recordUntil } from '../lane.mjs'

/** The thinking row and the Markdown the host renders inside it. */
const HOST = {
  row: '[data-variant="think"]',
  flow: '[data-chat-flow]',
  text: '[data-markdown-variant]',
}

/**
 * How the reasoning stands right now, in one reading: the row's phase and the
 * text's growth, with no window of the skin's between them.
 */
function readInPage(host) {
  const row = document.querySelector(host.row)
  if (row === null) return { row: false }
  const text = row.querySelector(host.text)
  if (text === null) return { row: true }
  const flow = row.closest(host.flow)
  return {
    row: true,
    phase: row.getAttribute('data-state'),
    flowTop: flow?.getBoundingClientRect().top ?? null,
    textHeight: Math.round(text.getBoundingClientRect().height),
    // No step is written onto the host's own text while it streams.
    target: text.style.transform,
    at: Math.round(performance.now()),
  }
}

function reasoningContinuousScenario({ check }) {
  return {
    script: 'think',
    prompt: 'think it through',
    patch: [
      '- id: ui-skin-claude-style-lite',
      '  config:',
      '    motion: full',
    ],
    delayMs: 1200,
    async duringTurn(context) {
      const { page } = context
      // The row has to be running with text already in it: a first sample taken
      // before the mock's reasoning starts would read as the turn being over,
      // and the recording would stop with nothing in it.
      await page.waitForFunction((host) => {
        const row = document.querySelector(host.row)
        const text = row?.querySelector(host.text)
        return row !== null && row.getAttribute('data-state') === 'running' &&
          text !== null && text !== undefined && text.getBoundingClientRect().height > 100
      }, HOST, { timeout: 40000 })
      const recording = recordUntil(page, readInPage, (seen) => seen[seen.length - 1].phase !== 'running', HOST, 60000, 'the continuous reasoning ending')
      await page.waitForFunction((host) => {
        const row = document.querySelector(host.row)
        const text = row?.querySelector(host.text)
        return text !== null && text !== undefined && text.getBoundingClientRect().height > 400
      }, HOST, { timeout: 40000 })
      await page.screenshot({ path: path.join(context.out, 'reasoning-continuous.png') })
      context.notes.samples = await recording
    },
    async assert({ session, notes }) {
      const samples = notes.samples ?? []
      const running = samples.filter((sample) => sample.phase === 'running' && sample.textHeight > 0)
      const first = running[0] ?? {}
      const last = running[running.length - 1] ?? {}
      // Once the column has overflowed, every later growth is the moment the
      // host pins the tail. The skin's slide has to carry that growth through
      // visible intermediate positions rather than leaving one whole-step jump.
      const growths = []
      for (let index = 1; index < running.length; index += 1) {
        const previous = running[index - 1]
        const current = running[index]
        if (!(previous.flowTop < first.flowTop - 0.5) || !(current.textHeight > previous.textHeight)) continue
        let end = index + 1
        while (end < running.length && running[end].textHeight <= current.textHeight) end += 1
        const positions = running.slice(index - 1, end).map((sample) => Math.round(sample.flowTop * 10) / 10)
        growths.push({
          at: current.at,
          grew: current.textHeight - previous.textHeight,
          from: previous.flowTop,
          to: current.flowTop,
          positions: new Set(positions).size,
        })
      }
      const jumped = growths.filter((growth) => growth.positions <= 2)
      const reversals = running.filter((sample, index) => index > 0 && sample.textHeight >= running[index - 1].textHeight
        && sample.flowTop > running[index - 1].flowTop + 0.5)
      return [
        check('逐字跟随直接显示思考文本，不引入步进位移',
          running.length > 20 && running.every((sample) => sample.target === ''),
          JSON.stringify({ samples: running.length, first, last })),
        check('思考文本随宿主内容到达持续长高', (last.textHeight ?? 0) > (first.textHeight ?? 0), JSON.stringify({ first: first.textHeight, last: last.textHeight })),
        check('思考溢出后的每次增长都有连续位移，正文不整段跳变',
          growths.length > 0 && jumped.length === 0 && reversals.length === 0,
          JSON.stringify({ growths: growths.length, jumped: jumped.slice(0, 3), reversals: reversals.slice(0, 3).map((sample) => ({ at: sample.at, flowTop: sample.flowTop })) })),
        check('控制台没有异常', session.problems.length === 0, session.problems.slice(0, 3).join(' | ')),
      ]
    },
  }
}

export { reasoningContinuousScenario }
