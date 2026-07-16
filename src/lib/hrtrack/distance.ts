// Great-circle distance between two lat/lng points, in meters. Pure
// function so office-vs-remote detection is unit-testable against known
// coordinate pairs without needing a live GPS reading or a database.
const EARTH_RADIUS_METERS = 6371000

function toRadians(deg: number): number {
  return (deg * Math.PI) / 180
}

export function haversineDistanceMeters(
  lat1: number, lng1: number,
  lat2: number, lng2: number
): number {
  const dLat = toRadians(lat2 - lat1)
  const dLng = toRadians(lng2 - lng1)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.sin(dLng / 2) ** 2
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return EARTH_RADIUS_METERS * c
}

export type OfficeLocation = { latitude: number; longitude: number; radius_meters: number }

// 'office' if the point falls within any configured office's radius,
// otherwise 'remote'. No configured offices at all -> always 'remote'
// (a safe default that doesn't block clock-in on an admin setup step).
export function detectAttendanceStatus(
  lat: number, lng: number,
  offices: OfficeLocation[]
): 'office' | 'remote' {
  const withinAnyOffice = offices.some(
    (o) => haversineDistanceMeters(lat, lng, o.latitude, o.longitude) <= o.radius_meters
  )
  return withinAnyOffice ? 'office' : 'remote'
}
