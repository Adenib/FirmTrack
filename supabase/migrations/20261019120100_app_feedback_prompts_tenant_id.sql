-- app_feedback_prompts was created without its own tenant_id, unlike
-- every other per-user child table in this schema (mfa_backup_codes,
-- app_feedback itself, etc.) -- that denormalized tenant_id is exactly
-- what the org-deletion cleanup (tests/helpers/test-client.ts's
-- destroyTestTenant and src/lib/creator/delete-organization.ts) relies on
-- to delete by `.eq('tenant_id', orgId)` uniformly across every table.
-- Without it, that generic cleanup silently fails on this one table.
alter table public.app_feedback_prompts add column if not exists tenant_id uuid references public.organizations(id) on delete cascade;

update public.app_feedback_prompts afp
set tenant_id = u.tenant_id
from public.users u
where u.id = afp.user_id and afp.tenant_id is null;

alter table public.app_feedback_prompts alter column tenant_id set not null;

create index if not exists app_feedback_prompts_tenant_idx on public.app_feedback_prompts (tenant_id);
