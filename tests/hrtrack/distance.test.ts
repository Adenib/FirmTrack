import { describe, it, expect } from 'vitest'
import { haversineDistanceMeters, detectAttendanceStatus } from '@/lib/hrtrack/distance'

describe('haversineDistanceMeters', () => {
  it('returns ~0 for the same point', () => {
    expect(haversineDistanceMeters(6.5244, 3.3792, 6.5244, 3.3792)).toBeLessThan(1)
  })

  it('returns roughly the known distance between two real cities (Lagos to Abuja, ~525km great-circle)', () => {
    const d = haversineDistanceMeters(6.5244, 3.3792, 9.0765, 7.3986)
    expect(d).toBeGreaterThan(500000)
    expect(d).toBeLessThan(550000)
  })

  it('returns a small distance for two points ~100m apart', () => {
    // ~0.0009 degrees latitude is roughly 100m
    const d = haversineDistanceMeters(6.5244, 3.3792, 6.5253, 3.3792)
    expect(d).toBeGreaterThan(80)
    expect(d).toBeLessThan(120)
  })
})

describe('detectAttendanceStatus', () => {
  const office = { latitude: 6.5244, longitude: 3.3792, radius_meters: 200 }

  it('returns "office" when within radius of a configured office', () => {
    expect(detectAttendanceStatus(6.5244, 3.3792, [office])).toBe('office')
  })

  it('returns "remote" when outside every configured office\'s radius', () => {
    expect(detectAttendanceStatus(9.0765, 7.3986, [office])).toBe('remote')
  })

  it('returns "remote" when no offices are configured at all', () => {
    expect(detectAttendanceStatus(6.5244, 3.3792, [])).toBe('remote')
  })

  it('matches if within radius of ANY of several configured offices', () => {
    const farOffice = { latitude: 9.0765, longitude: 7.3986, radius_meters: 200 }
    expect(detectAttendanceStatus(6.5244, 3.3792, [farOffice, office])).toBe('office')
  })
})
