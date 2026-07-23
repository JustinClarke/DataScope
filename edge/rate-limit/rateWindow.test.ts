import { describe, it, expect } from 'vitest'
import { stepWindow, type WindowState } from './rateWindow'

const MIN = 60
// A time aligned to a 60s bucket boundary, so offsets below stay inside one
// bucket except where a rollover is intended.
const T0 = 16_666_667 * MIN * 1000

describe('stepWindow', () => {
  it('starts a fresh key at 1', () => {
    expect(stepWindow(undefined, T0, MIN)).toEqual({ bucket: 16_666_667, count: 1 })
  })

  it('rises within the same bucket', () => {
    let s: WindowState | undefined
    s = stepWindow(s, T0, MIN)
    s = stepWindow(s, T0 + 1_000, MIN) // +1s, same 60s bucket
    s = stepWindow(s, T0 + 59_000, MIN) // +59s, still inside the same bucket
    expect(s.count).toBe(3)
  })

  it('resets to 1 when the bucket rolls over', () => {
    const first = stepWindow(undefined, T0, MIN)
    const nextWindow = stepWindow(first, T0 + 60_000, MIN) // +60s → next bucket
    expect(nextWindow.count).toBe(1)
    expect(nextWindow.bucket).toBe(first.bucket + 1)
  })

  it('honors an arbitrary window length (the daily-quota window would tolerate KV, this does not)', () => {
    const a = stepWindow(undefined, T0, 86_400)
    const b = stepWindow(a, T0 + 60_000, 86_400) // +60s is nothing against a day
    expect(b.count).toBe(2)
    expect(b.bucket).toBe(a.bucket)
  })

  it('sums an explicit amount instead of counting requests (the persistence byte-aggregate cap)', () => {
    let s: WindowState | undefined
    s = stepWindow(s, T0, 86_400, 40_000_000)
    s = stepWindow(s, T0 + 1_000, 86_400, 25_000_000)
    expect(s.count).toBe(65_000_000)
    expect(s.bucket).toBe(Math.floor(T0 / 1000 / 86_400))
  })

  it('resets the sum to the fresh amount on a bucket rollover', () => {
    const first = stepWindow(undefined, T0, 60, 900)
    const next = stepWindow(first, T0 + 60_000, 60, 100)
    expect(next.count).toBe(100)
    expect(next.bucket).toBe(first.bucket + 1)
  })
})
