import {describe,it,expect} from 'vitest'
import {canonicalUserIds,dayStart,trendPeriods,actionWindows,DAY} from '../cohortTrackingModel.js'

describe('fixed cohort tracking invariants',()=>{
  it('normalizes manual IDs and deduplicates without expanding anonymous users',()=>{
    expect(canonicalUserIds(['115','user:115',' 132 ','','anonymous:guest','user:212']))
      .toEqual(['user:115','user:132','user:212'])
    expect(canonicalUserIds([])).toEqual([])
    expect(canonicalUserIds(null)).toEqual([])
  })
  it('builds seven UTC+7 calendar dates, final day is partial',()=>{
    const asOf=Date.parse('2026-11-16T12:09:00+07:00')
    const periods=trendPeriods(asOf)
    expect(periods).toHaveLength(7)
    expect(periods[0].start).toBe(Date.parse('2026-11-10T00:00:00+07:00'))
    expect(periods[6].start).toBe(Date.parse('2026-11-16T00:00:00+07:00'))
    expect(periods[6].end).toBe(asOf+1)
    expect(periods.every(d=>d.end>d.start)).toBe(true)
    expect(periods[1].start-periods[0].start).toBe(DAY)
  })
  it('excludes action day and compares equal mature 7-day windows',()=>{
    const t=Date.parse('2026-11-16T19:15:00+07:00')
    const windows=actionWindows(t)
    expect(dayStart(t)).toBe(Date.parse('2026-11-16T00:00:00+07:00'))
    expect(windows.beforeEnd).toBe(dayStart(t))
    expect(windows.afterStart).toBe(dayStart(t)+DAY)
    expect(windows.beforeEnd-windows.beforeStart).toBe(7*DAY)
    expect(windows.afterEnd-windows.afterStart).toBe(7*DAY)
  })
})
