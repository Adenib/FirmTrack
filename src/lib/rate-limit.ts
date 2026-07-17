import { createClient } from '@supabase/supabase-js'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export type RateLimitResult = { limited: boolean; scope: 'email' | 'ip' | null }

// Reuses Stage 1's audit log as the counter instead of standing up a
// separate store (Redis, in-memory) -- the failed-attempt history it
// already captures (event_type, email, ip_address, created_at) is
// exactly what a rolling-window rate limit needs. No explicit
// "locked until" state either: once the count within the window crosses
// the threshold, every attempt is blocked until enough old attempts age
// out of the window on their own.
//
// Email and IP are checked separately with DIFFERENT thresholds
// deliberately -- the email threshold is the tight, primary defense
// (stops brute-forcing one account); the IP threshold is a much looser
// backstop (stops one source hammering many accounts) since a single IP
// can legitimately represent many users behind NAT/a shared office
// network.
async function countRecentEvents(eventType: string, field: 'email' | 'ip_address', value: string, windowMinutes: number): Promise<number> {
  const windowStart = new Date(Date.now() - windowMinutes * 60 * 1000).toISOString()
  const { count } = await supabaseAdmin
    .from('security_audit_log')
    .select('id', { count: 'exact', head: true })
    .eq('event_type', eventType)
    .eq(field, value)
    .gte('created_at', windowStart)
  return count || 0
}

export async function checkRateLimit(params: {
  eventType: string
  email: string
  ip: string | null
  emailThreshold: number
  ipThreshold: number
  windowMinutes: number
}): Promise<RateLimitResult> {
  const emailCount = await countRecentEvents(params.eventType, 'email', params.email, params.windowMinutes)
  if (emailCount >= params.emailThreshold) return { limited: true, scope: 'email' }

  if (params.ip) {
    const ipCount = await countRecentEvents(params.eventType, 'ip_address', params.ip, params.windowMinutes)
    if (ipCount >= params.ipThreshold) return { limited: true, scope: 'ip' }
  }

  return { limited: false, scope: null }
}

export const LOGIN_RATE_LIMIT = { emailThreshold: 5, ipThreshold: 30, windowMinutes: 15 }
export const PASSWORD_RESET_RATE_LIMIT = { emailThreshold: 3, ipThreshold: 20, windowMinutes: 60 }
