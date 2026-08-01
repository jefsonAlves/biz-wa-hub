# Biz WA Hub - Supabase Event Callback

- Finalidade: subworkflow reutilizável para devolver eventos assinados ao Supabase.
- Webhook: não possui; é chamado por `Execute Workflow`.
- Entrada: `event_id`, `event_type`, `tenant_id`, IDs opcionais e `data`.
- Saída: resposta HTTP da Edge Function `n8n-webhook-receiver`.
- Credenciais: nenhuma exportada; service role não é enviada.
- Variáveis: `SUPABASE_URL`, `N8N_WEBHOOK_SECRET`.
- Dependências: Edge Function publicada e integração ativa para o tenant.
- Teste: chamar manualmente com um UUID novo e confirmar uma linha processada em `inbound_events`.
