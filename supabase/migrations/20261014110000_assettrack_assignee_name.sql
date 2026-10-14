-- Was only populated when the sync couldn't match an assignee to a
-- FirmTrack user, so a matched assignee's original source name (e.g. from
-- a list where "Assigned To" holds a plain name, not an email) was
-- discarded. Renamed and always populated now, regardless of match
-- status, so the Asset Register can show both the source name and the
-- resolved FirmTrack email side by side.
alter table public.assettrack_assets rename column unresolved_assignee to assignee_name;
