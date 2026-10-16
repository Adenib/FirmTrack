-- Typing indicators for the Standard-channel support chat. A plain
-- timestamp per side (not a boolean) so "is typing" is just "pinged
-- within the last few seconds" -- no explicit "stopped typing" event
-- needed, it naturally expires. Kept on support_requests itself rather
-- than a new table since it's one row of ephemeral state per thread.
alter table public.support_requests add column if not exists user_typing_at timestamptz;
alter table public.support_requests add column if not exists agent_typing_at timestamptz;
