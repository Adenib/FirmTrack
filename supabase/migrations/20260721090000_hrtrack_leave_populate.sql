-- Leave types get a default catalog instead of firms configuring them
-- from scratch: Annual, Maternity, Compassionate, Sick, Study/Exams,
-- Unpaid. `unlimited` (new column) exempts a type from the remaining-
-- balance check in POST /api/hrtrack/requests -- Unpaid leave isn't
-- capped by a fixed allocation the way the others are.
alter table public.leave_types add column if not exists unlimited boolean not null default false;

-- Backfill every EXISTING tenant that has no leave types configured yet
-- (new tenants get these via the register route going forward, mirroring
-- how DEFAULT_ACCOUNTS is seeded at signup — this insert exists only
-- because tenants created before this migration need the same catalog).
insert into public.leave_types (tenant_id, name, annual_days, unlimited)
select o.id, v.name, v.annual_days, v.unlimited
from public.organizations o
cross join (values
  ('Annual', 20, false),
  ('Maternity', 90, false),
  ('Compassionate', 5, false),
  ('Sick', 10, false),
  ('Study/Exams', 10, false),
  ('Unpaid', 0, true)
) as v(name, annual_days, unlimited)
where not exists (
  select 1 from public.leave_types lt where lt.tenant_id = o.id
);

-- Relief officer (who covers a staff member's responsibilities while
-- they're on leave) lives inside requests.details alongside the other
-- leave-specific fields (leave_type_id, start_date, etc.) rather than as
-- a table-wide column that would be null for the other 3 request types
-- -- no schema change needed here, `details` is already jsonb.

-- Leave allowance is a genuine top-level concept (set by the reviewer at
-- approval time, not something the requester provides, and not specific
-- to the `details` payload shape) -- tracked as a record only, since there
-- is no payroll/salary system yet to actually calculate or disburse it.
alter table public.requests add column if not exists leave_allowance_amount numeric(12, 2);
