-- AELEX's real IT_Asset_Management1 list carries two free-text columns
-- (Status, Condition) with ad-hoc values ("In Use", "BAD/DECOMMISSIONED",
-- "Re-deployed to Munachimso") that don't fit assettrack_assets'
-- controlled asset_status enum -- these capture that data verbatim rather
-- than forcing a lossy fuzzy-match into the enum.
alter table public.assettrack_assets add column if not exists status_note text;
alter table public.assettrack_assets add column if not exists condition_note text;
