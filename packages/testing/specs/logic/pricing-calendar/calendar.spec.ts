/**
 * The independent price calendar accepts the DeepSeek clock the price snapshot
 * needs and refuses every field the snapshot parser would refuse.
 *
 * @capability pricing-calendar
 * @features contracts
 * @risk A removed peak-rate catalog leaves the price generator without its DeepSeek clock, or a malformed calendar reaches the shipped price snapshot.
 */
import { expect, test } from 'vitest'
import { parsePricingCalendar } from '@dsh-claude-style/contracts/pricing-calendar'

const VALID = {
  schemaVersion: 1,
  updatedAt: '2026-11-10',
  source: 'upstream peak catalog at 8cafcacd5aa574faa75b1912b8934bede7936b73',
  deepseek: {
    timeZone: 'UTC',
    holidayZone: 'Asia/Shanghai',
    peakDays: [1, 2, 3, 4, 5],
    peakWindows: [
      { start: '01:00', end: '04:00' },
      { start: '06:00', end: '10:00' },
    ],
    holidays: ['2026-01-01', '2027-01-01'],
  },
}

test('a valid calendar yields the fields the price snapshot carries', () => {
  expect(parsePricingCalendar(VALID)).toEqual(VALID.deepseek)
})

test('a bad time zone, window, weekday or date is refused', () => {
  expect(parsePricingCalendar({ ...VALID, deepseek: { ...VALID.deepseek, timeZone: 'Mars/Olympus' } })).toBeNull()
  expect(parsePricingCalendar({ ...VALID, deepseek: { ...VALID.deepseek, peakWindows: [{ start: '25:00', end: '04:00' }] } })).toBeNull()
  expect(parsePricingCalendar({ ...VALID, deepseek: { ...VALID.deepseek, peakDays: [7] } })).toBeNull()
  expect(parsePricingCalendar({ ...VALID, deepseek: { ...VALID.deepseek, holidays: ['2026-02-30'] } })).toBeNull()
})

test('a calendar with no peak day or no window is refused', () => {
  expect(parsePricingCalendar({ ...VALID, deepseek: { ...VALID.deepseek, peakDays: [] } })).toBeNull()
  expect(parsePricingCalendar({ ...VALID, deepseek: { ...VALID.deepseek, peakWindows: [] } })).toBeNull()
})

test('a missing or unknown schema version is refused', () => {
  expect(parsePricingCalendar({ ...VALID, schemaVersion: 2 })).toBeNull()
  expect(parsePricingCalendar({ ...VALID, schemaVersion: undefined })).toBeNull()
})
