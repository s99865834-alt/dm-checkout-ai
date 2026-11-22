-- Reply hours. Null or {"enabled": false} means the AI is always on.
-- Shape is defined and validated in app/lib/reply-schedule.js.
alter table public.settings add column if not exists reply_schedule jsonb;
