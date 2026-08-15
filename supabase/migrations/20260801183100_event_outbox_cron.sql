-- Phase 1: invoke process-event-outbox every 30 seconds.
-- Before applying, create these Supabase Vault secrets in the target project:
--   project_url: https://<project-ref>.supabase.co
--   secret_key:  the server-side Supabase secret/service-role key
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

SELECT cron.schedule(
  'biz-wa-hub-process-event-outbox',
  '30 seconds',
  $job$
  SELECT net.http_post(
    url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'project_url' LIMIT 1)
      || '/functions/v1/process-event-outbox',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'secret_key' LIMIT 1),
      'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'secret_key' LIMIT 1)
    ),
    body := jsonb_build_object('scheduled_at', now())
  );
  $job$
);
