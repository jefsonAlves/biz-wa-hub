# Biz WA Hub - Platform Event Receiver

- Finalidade: receber eventos do site/Supabase, validar HMAC, schema, tenant, timestamp e tamanho.
- Webhook: `POST /webhook/biz-wa-hub/platform`.
- Entrada: contrato `PlatformEvent` com os quatro cabeçalhos HMAC.
- Saída: HTTP 202 para evento aceito; 400, 401, 413 ou 503 para rejeições.
- Credenciais: nenhuma exportada.
- Variáveis: `N8N_WEBHOOK_SECRET`; o Code node requer `NODE_FUNCTION_ALLOW_BUILTIN=crypto`.
- Dependências: Supabase `event_outbox` e Edge Function de despacho.
- Teste: execute `node tests/hmac-contract.test.mjs` e depois envie o payload assinado para o webhook de teste.
