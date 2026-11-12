import { check, basicChecks, same } from './_shared.mjs'

/** One row by the name its label carries. */
function byName(rows) {
  return (rows || []).reduce((all, row) => { all[row.name] = row; return all }, {})
}

/** Whether a computed `rgb()` is neutral enough to read as grey: no channel leads by more than a neutral host step. */
function neutral(colour) {
  if (typeof colour !== 'string') return false
  const channels = colour.match(/[\d.]+/g)
  if (channels === null || channels.length < 3) return false
  const [r, g, b] = channels.slice(0, 3).map(Number)
  return Math.max(r, g, b) - Math.min(r, g, b) <= 18
}

export default {
  /**
   * The model menu's rows: an official model, one no profile claims, the seat's
   * own row at the bottom of level 1 (whose provider that level does not list),
   * and a level-2 row.
   */
  'model-rows'(r) {
    basicChecks(r)
    const rows = r.modelRows || {}
    const levelOne = rows.levelOne || []
    const one = byName(levelOne)
    const two = byName(rows.levelTwo)
    check('the picker draws level 1 with the seat\'s own row under the list',
      levelOne.length === 3 && one['V4.1 Flash'] !== undefined && one['Kimi K3'] !== undefined && one['GLM-5.3'] !== undefined,
      JSON.stringify(levelOne.map((row) => row.name)))
    check('the official Flash row carries the host\'s 1017 release tag, and the other rows do not',
      one['V4.1 Flash'] !== undefined && one['V4.1 Flash'].text.includes('1017') &&
        one['Kimi K3'] !== undefined && !one['Kimi K3'].text.includes('1017'),
      JSON.stringify({ flash: one['V4.1 Flash'], kimi: one['Kimi K3'] }))
    check('the seat\'s row is the current one and the last of that level',
      rows.currentRow !== null && rows.currentRow !== undefined && rows.currentRow.current === true && rows.currentRow.name === 'GLM-5.3',
      JSON.stringify(rows.currentRow))
    check('every row carries no rate meter',
      levelOne.every((row) => Object.hasOwn(row, 'meter') === false),
      JSON.stringify(levelOne.map((row) => Object.keys(row))))
    check('the seat\'s row is drawn as the list rows are: same height, padding, radius and layout',
      rows.currentRow !== null && one['V4.1 Flash'] !== undefined && same(rows.currentRow.box, one['V4.1 Flash'].box),
      JSON.stringify({ current: rows.currentRow, listed: one['V4.1 Flash'] }))
    check('the second level lists its models with no rate meter',
      two['GLM-5.3'] !== undefined && Object.hasOwn(two['GLM-5.3'], 'meter') === false,
      JSON.stringify(two['GLM-5.3']))
    const press = r.modelPress || {}
    check('with the hover preference on, a press on the open model menu keeps it up',
      press.opened === true && press.kept === true,
      JSON.stringify({ opened: press.opened, kept: press.kept }))
    const descriptions = r.modelDescriptions || {}
    check('every row of the first level carries a description line while Model descriptions is on, and turning it off takes the line off that level alone',
      descriptions.listed === 3 && descriptions.lines === 3 &&
        descriptions.bareListed === 3 && descriptions.bareLines === 0 &&
        descriptions.secondLevelLines === 0 && descriptions.bareSecondLevelLines === 0,
      JSON.stringify(descriptions))
    // The picker's switch is live: its teardown hands the host\'s own seat and
    // menu back, and installing it again takes the seat over once more.
    const picker = r.modelPicker || {}
    check('switching the model picker off hands the host\'s own seat back, and on takes it over again',
      picker.off !== undefined && picker.off.trigger === false && picker.off.hostMarked === false &&
        picker.back !== undefined && picker.back.trigger === true && picker.back.hostMarked === true,
      JSON.stringify(picker))
    const seat = r.modelSeat || {}
    check('the seat\'s own line carries the tag with the Flash model in force, on a neutral plate and ink',
      seat.text !== null && seat.text.includes('V4.1 Flash') && seat.text.includes('1017') &&
        seat.tagBg !== null && seat.tagBg !== 'rgba(0, 0, 0, 0)' && neutral(seat.tagBg) && neutral(seat.tagColor),
      JSON.stringify(seat))
    const external = r.externalControls || {}
    check('the control registry mounts an independent model picker, rejects an unknown id and preserves the composer on teardown',
      external.available === true && external.mountedCount === 2 && external.externalPopover === true &&
        external.unknownRejected === true && external.remainingCount === 1 && external.slotClean === true &&
        external.externalStyle != null && external.externalStyle.display === 'flex' && external.externalStyle.height === '28px' &&
        external.externalStyle.border === '0px' && external.externalStyle.background === 'rgba(0, 0, 0, 0)',
      JSON.stringify(external))
  },
  'model-account'(r) {
    basicChecks(r)
    const account = r.modelAccount || {}
    check('with no API key, the signed-in account leads the first level beside the chosen provider',
      Array.isArray(account.levelOne) && account.levelOne[0] === 'DeepSeek V4.1 Flash' && account.levelOne[1] === 'GLM-5.3' &&
        account.lead === 'DeepSeek Account',
      JSON.stringify(account))
    check('the account that leads the first level is not repeated behind More models',
      Array.isArray(account.levelTwo) && account.levelTwo.includes('Gateway Flash') && !account.levelTwo.includes('DeepSeek V4.1 Flash'),
      JSON.stringify(account.levelTwo))
  },
}
