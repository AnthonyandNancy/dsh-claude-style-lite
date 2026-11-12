/** pricing-calendar.mjs — read the independent DeepSeek price calendar (`pricing-calendar.json`). */
import fs from 'node:fs'
import { loadModule } from '../shared/ts-module.mjs'

const { parsePricingCalendar } = loadModule('packages/contracts/src/pricing-calendar.ts')

/** Read the calendar the price snapshot uses; the contract parser owns every field rule. */
export function readPricingCalendar(file) {
  const raw = JSON.parse(fs.readFileSync(file, 'utf8'))
  const calendar = parsePricingCalendar(raw)
  if (calendar === null) throw new Error(`pricing-calendar: ${file} is not a calendar the price snapshot understands`)
  return calendar
}
