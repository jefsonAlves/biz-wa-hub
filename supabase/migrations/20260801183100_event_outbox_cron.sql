-- Schedule the outbox processor to run every minute via pg_cron.
-- This ensures that events are delivered to n8n even if the trigger invocation fails.

-- Não grave URL ou chave de um projeto específico em migrations reutilizáveis.
-- O agendamento opcional deve ser criado depois, usando Vault/secrets do projeto.
DO $$ BEGIN
  RAISE NOTICE 'Cron do outbox não instalado: configure-o com Vault se a automação n8n for habilitada.';
END $$;

COMMENT ON COLUMN public.event_outbox.status IS 'pending, processing, sent, error, dead';
