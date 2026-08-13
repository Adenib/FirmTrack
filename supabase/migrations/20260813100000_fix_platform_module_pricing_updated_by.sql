-- platform_module_pricing.updated_by was wrongly set to reference
-- public.users(id) -- but the people who edit platform pricing are
-- Creator Console staff (platform_admins), who have no row in the
-- tenant-scoped users table at all. Confirmed via a real 500
-- (foreign key violation) on the first live PATCH attempt, not assumed.
alter table public.platform_module_pricing drop constraint if exists platform_module_pricing_updated_by_fkey;
alter table public.platform_module_pricing add constraint platform_module_pricing_updated_by_fkey
  foreign key (updated_by) references public.platform_admins(id);
