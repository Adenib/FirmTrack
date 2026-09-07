-- The desktop agent's Windows installer is ~78MB (mostly Electron's
-- runtime), above Supabase storage's default 50MB per-bucket limit.
update storage.buckets set file_size_limit = 209715200 -- 200MB
where id = 'agent-installers';
