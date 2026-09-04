import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { getValidGraphToken } from '@/lib/microsoft-graph/tokens'
import { listUnreadOutlookMessages } from '@/lib/microsoft-graph/client'
import { summarizeInboxDigest, AiInboxDigestError } from '@/lib/ai/inbox-digest'
import { sendInboxDigestEmail, EmailSendError, type InboxDigestEmailItem } from '@/lib/ai/send-inbox-digest-email'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Looping many mailboxes with an LLM call each could exceed the 60s the
// other crons use -- an assumption to revisit if the actual Vercel plan
// tier caps lower than this.
export const maxDuration = 300

function isAuthorized(request: Request): boolean {
  const auth = request.headers.get('authorization')
  return !!process.env.CRON_SECRET && auth === `Bearer ${process.env.CRON_SECRET}`
}

// One daily pass per opted-in user with an active aitrack subscription:
// fetch their unread Outlook mail, have Claude triage it, and email them
// a digest -- priority, one-line summary, suggested reply text (never a
// real Outlook draft; the app's Graph consent is read-only). Same
// per-user try/catch resilience as hrtrack-wfh-digest: one mailbox
// failing doesn't abort the batch.
export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const today = new Date().toISOString().split('T')[0]

  const { data: subs } = await supabaseAdmin
    .from('subscriptions')
    .select('tenant_id')
    .eq('module', 'aitrack')
    .eq('is_active', true)
  const activeTenantIds = new Set((subs || []).map((s) => s.tenant_id))

  const { data: tokenRows } = await supabaseAdmin
    .from('microsoft_graph_tokens')
    .select('user_id, scope, users(id, tenant_id, email)')
    .eq('ai_inbox_digest_enabled', true)

  type TokenRow = { user_id: string; scope: string; users: { id: string; tenant_id: string; email: string } | null }
  const candidates = ((tokenRows || []) as unknown as TokenRow[]).filter(
    (row) => row.scope.includes('Mail.Read') && row.users && activeTenantIds.has(row.users.tenant_id)
  )

  const summary = {
    usersChecked: candidates.length,
    digestsSent: 0,
    usersWithNoUnread: 0,
    errors: [] as { userId: string; error: string }[],
  }

  for (const row of candidates) {
    const user = row.users!
    try {
      const accessToken = await getValidGraphToken(user.id)
      if (!accessToken) {
        const error = 'No valid Microsoft Graph token (disconnected or revoked)'
        summary.errors.push({ userId: user.id, error })
        await supabaseAdmin.from('ai_inbox_digest_runs').insert({
          tenant_id: user.tenant_id,
          user_id: user.id,
          run_date: today,
          unread_count: 0,
          sent: false,
          error,
        })
        continue
      }

      const unread = await listUnreadOutlookMessages(accessToken)
      if (unread.length === 0) {
        summary.usersWithNoUnread++
        await supabaseAdmin.from('ai_inbox_digest_runs').insert({
          tenant_id: user.tenant_id,
          user_id: user.id,
          run_date: today,
          unread_count: 0,
          sent: false,
        })
        continue
      }

      const { entries } = await summarizeInboxDigest({
        messages: unread.map((m) => ({
          id: m.id,
          subject: m.subject,
          from: m.from,
          receivedDateTime: m.receivedDateTime,
          bodyPreview: m.bodyPreview,
        })),
      })

      const byId = new Map(unread.map((m) => [m.id, m]))
      const items: InboxDigestEmailItem[] = entries
        .map((entry) => {
          const message = byId.get(entry.id)
          if (!message) return null
          return {
            subject: message.subject,
            from: message.from,
            webLink: message.webLink,
            priority: entry.priority,
            summary: entry.summary,
            suggestedReply: entry.suggestedReply,
          }
        })
        .filter((item): item is InboxDigestEmailItem => item !== null)

      await sendInboxDigestEmail(user.email, today, items)

      await supabaseAdmin.from('ai_inbox_digest_runs').insert({
        tenant_id: user.tenant_id,
        user_id: user.id,
        run_date: today,
        unread_count: unread.length,
        sent: true,
      })
      summary.digestsSent++
    } catch (err) {
      const message = err instanceof AiInboxDigestError || err instanceof EmailSendError ? err.message : (err as Error).message
      summary.errors.push({ userId: user.id, error: message })
      await supabaseAdmin.from('ai_inbox_digest_runs').insert({
        tenant_id: user.tenant_id,
        user_id: user.id,
        run_date: today,
        unread_count: 0,
        sent: false,
        error: message,
      })
    }
  }

  return NextResponse.json({ ok: true, ...summary })
}
