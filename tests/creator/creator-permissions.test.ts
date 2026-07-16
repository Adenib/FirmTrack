import { describe, it, expect } from 'vitest'
import { canAccessCreatorPage } from '@/lib/creator-permissions'

describe('canAccessCreatorPage', () => {
  it('creator (legacy full-access role) can reach every page', () => {
    for (const page of ['overview', 'organizations', 'revenue', 'staff'] as const) {
      expect(canAccessCreatorPage('creator', page)).toBe(true)
    }
  })

  it('admin cadre can reach every page, including staff management', () => {
    for (const page of ['overview', 'organizations', 'revenue', 'staff'] as const) {
      expect(canAccessCreatorPage('admin', page)).toBe(true)
    }
  })

  it('accounts cadre: overview + revenue only', () => {
    expect(canAccessCreatorPage('accounts', 'overview')).toBe(true)
    expect(canAccessCreatorPage('accounts', 'revenue')).toBe(true)
    expect(canAccessCreatorPage('accounts', 'organizations')).toBe(false)
    expect(canAccessCreatorPage('accounts', 'staff')).toBe(false)
  })

  it('developer cadre: overview + organizations only', () => {
    expect(canAccessCreatorPage('developer', 'overview')).toBe(true)
    expect(canAccessCreatorPage('developer', 'organizations')).toBe(true)
    expect(canAccessCreatorPage('developer', 'revenue')).toBe(false)
    expect(canAccessCreatorPage('developer', 'staff')).toBe(false)
  })

  it('an unknown/unset role gets no access', () => {
    expect(canAccessCreatorPage('', 'overview')).toBe(false)
    expect(canAccessCreatorPage('bogus', 'overview')).toBe(false)
  })
})
