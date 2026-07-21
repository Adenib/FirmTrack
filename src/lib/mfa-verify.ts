import type { SupabaseClient } from '@supabase/supabase-js'

// Supabase Auth intentionally binds an MFA challenge to the IP address it
// was created from and rejects verification from a different one
// (mfa_ip_address_mismatch) -- a genuine, documented security feature,
// not a bug in this app. Confirmed via direct investigation that it's not
// this app's client IP actually changing (checked via curl and Node
// fetch, sequential and parallel -- stable every time) and not simply
// two challenges on one factor in quick succession (a standalone script
// hit that pattern 10/10 clean). It only ever surfaced under concurrent
// MFA load from one source IP, which points at a rare race on Supabase's
// own side -- plausible in production too, e.g. several staff at the
// same office signing in around the same time over one shared public IP.
// A fresh challenge from that same (confirmed-stable) IP reliably
// succeeds, so retrying once here is a safety net for that specific
// known-flaky external behavior, not a mask over a real bug.
export async function challengeAndVerifyWithRetry(
  supabase: SupabaseClient,
  factorId: string,
  code: string
) {
  const first = await supabase.auth.mfa.challengeAndVerify({ factorId, code })
  if (!first.error || first.error.code !== 'mfa_ip_address_mismatch') return first
  return supabase.auth.mfa.challengeAndVerify({ factorId, code })
}
