/** The DeepSeek clock the independent price snapshot needs, without the removed peak-rate module. */

export interface PricingCalendar {
  timeZone: string
  holidayZone: string
  peakDays: number[]
  peakWindows: { start: string, end: string }[]
  holidays: string[]
}

const CLOCK = /^([01]?\d|2[0-3]):[0-5]\d$/
const DATE = /^\d{4}-\d{2}-\d{2}$/

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null
}

function zoneResolves(timeZone: string) {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone })
    return true
  } catch {
    return false
  }
}

function isDate(value: string) {
  if (!DATE.test(value)) return false
  const [year, month, day] = value.split('-').map(Number)
  const at = new Date(Date.UTC(year, month - 1, day))
  return at.getUTCFullYear() === year && at.getUTCMonth() === month - 1 && at.getUTCDate() === day
}

/** Parse and validate one calendar document; null means the price generator must not use it. */
export function parsePricingCalendar(value: unknown): PricingCalendar | null {
  const raw = asRecord(value)
  if (raw === null || raw.schemaVersion !== 1) return null
  const deepseek = asRecord(raw.deepseek)
  if (deepseek === null) return null
  const timeZone = typeof deepseek.timeZone === 'string' ? deepseek.timeZone.trim() : ''
  const holidayZone = typeof deepseek.holidayZone === 'string' ? deepseek.holidayZone.trim() : timeZone
  if (timeZone === '' || holidayZone === '' || !zoneResolves(timeZone) || !zoneResolves(holidayZone)) return null
  const peakDays = Array.isArray(deepseek.peakDays)
    ? [...new Set(deepseek.peakDays.filter((day): day is number => Number.isInteger(day) && day >= 0 && day <= 6))].sort()
    : []
  if (peakDays.length === 0) return null
  const peakWindows: { start: string, end: string }[] = []
  if (Array.isArray(deepseek.peakWindows)) {
    for (const entry of deepseek.peakWindows) {
      const window = asRecord(entry)
      if (window === null) continue
      if (typeof window.start !== 'string' || typeof window.end !== 'string') continue
      if (!CLOCK.test(window.start) || !CLOCK.test(window.end)) continue
      peakWindows.push({ start: window.start, end: window.end })
    }
  }
  if (peakWindows.length === 0) return null
  const holidays: string[] = []
  if (deepseek.holidays !== undefined) {
    if (!Array.isArray(deepseek.holidays)) return null
    for (const entry of deepseek.holidays) {
      if (typeof entry !== 'string' || !isDate(entry)) return null
      if (!holidays.includes(entry)) holidays.push(entry)
    }
    holidays.sort()
  }
  return { timeZone, holidayZone, peakDays, peakWindows, holidays }
}
