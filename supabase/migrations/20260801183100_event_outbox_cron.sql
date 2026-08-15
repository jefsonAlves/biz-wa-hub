-- Schedule the outbox processor to run every minute via pg_cron.
-- This ensures that events are delivered to n8n even if the trigger invocation fails.

SELECT cron.schedule(
  'biz-wa-hub-process-event-outbox',
  '* * * * *',
  $$
  select net.http_post(
    url := 'https://kxihlelxmsteszbecgzq.supabase.co/functions/v1/process-event-outbox',
    headers := '{"Content-Type": "application/json", "apikey": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt4aWhsZWx4bXN0ZXN6YmVjZ3pxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE1MDg1NjQsImV4cCI6MjA4NzA4NDU2NH0.bGSrz6WBdq_zLGHGQgqw9VFAxpRzah-DIpToDP1wjug"}'::jsonb,
    body := jsonb_build_object('trigger', 'pg_cron', 'time', now())
  );
  $$
);

COMMENT ON COLUMN public.event_outbox.status IS 'pending, processing, sent, error, dead';
