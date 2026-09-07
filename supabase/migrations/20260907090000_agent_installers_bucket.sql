-- Storage for the FirmTrack desktop agent's Windows installer. Private
-- bucket (not public) -- same "no direct public storage URL, served via
-- short-lived signed URLs" convention as the 'documents' bucket, since
-- the download should go through firmtracks.com (auth-gated), not a
-- bare Supabase storage URL.
insert into storage.buckets (id, name, public)
values ('agent-installers', 'agent-installers', false)
on conflict (id) do nothing;
