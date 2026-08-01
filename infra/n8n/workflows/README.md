# Workflows autorais do Biz WA Hub

Nenhum projeto ou template externo do n8n é utilizado.

Os workflows são criados do zero a partir dos contratos da plataforma. Este diretório recebe somente exports sanitizados, sem IDs de credenciais, API keys ou segredos.

Checkpoint 2:

- `01-system-health-check.json`: monitor local publicado.
- `02-platform-event-receiver.json`: receptor HMAC, mantido despublicado até configurar o segredo.
- `03-supabase-event-callback.json`: callback HMAC, mantido despublicado até publicar a Edge Function.
