import { createClient } from '@supabase/supabase-js'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export type SecurityEventType =
  | 'login_success'
  | 'login_failure'
  | 'logout'
  | 'password_reset_requested'
  | 'password_reset_completed'
  | 'user_created'
  | 'user_role_changed'
  | 'user_deactivated'
  | 'user_reactivated'

export type LogSecurityEventInput = {
  tenantId?: string | null
  userId?: string | null
  eventType: SecurityEventType
  email?: string | null
  request: Request
  metadata?: Record<string, unknown>
}

function getClientIp(request: Request): string | null {
  // Vercel/most proxies put the real client IP first in x-forwarded-for.
  const forwardedFor = request.headers.get('x-forwarded-for')
  if (forwardedFor) return forwardedFor.split(',')[0].trim()
  return request.headers.get('x-real-ip')
}

// A logging failure must never block or fail the real auth action it's
// attached to -- catches its own errors so every call site can
// `await logSecurityEvent(...)` with no try/catch of its own.
export async function logSecurityEvent(input: LogSecurityEventInput): Promise<void> {
  try {
    await supabaseAdmin.from('security_audit_log').insert({
      tenant_id: input.tenantId || null,
      user_id: input.userId || null,
      event_type: input.eventType,
      email: input.email || null,
      ip_address: getClientIp(input.request),
      user_agent: input.request.headers.get('user-agent'),
      metadata: input.metadata || {},
    })
  } catch (err) {
    console.error('logSecurityEvent failed:', err)
  }
}
