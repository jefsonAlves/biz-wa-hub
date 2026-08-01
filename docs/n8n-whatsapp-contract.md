# Contrato de integração — Plataforma ⇄ n8n (WhatsApp)

Supabase/Lovable é o backend de negócio (fonte de verdade). O n8n é apenas o
orquestrador técnico (sessão WhatsApp, QR, envio/recebimento, retries, IA).
O frontend **nunca** chama o n8n: tudo passa por Edge Functions e webhooks assinados.

```text
Frontend → Edge Function (n8n-dispatch-event / whatsapp-*) → event_outbox
                                   ↓ (cron a cada minuto: process-event-outbox)
                        POST assinado (HMAC SHA-256) → n8n
n8n → POST assinado → n8n-webhook-receiver → inbound_events + tabelas de negócio
```

## 1. Saída: plataforma → n8n

- **Endpoint**: `POST {n8n_integrations.base_url}{n8n_integrations.webhook_path}`
  (padrão `/webhook/platform`), configurado por tenant em `/integrations/n8n`.
- **Content-Type**: `application/json`
- **Headers**:
  | Header | Descrição |
  | --- | --- |
  | `X-Tenant-Id` | UUID do tenant |
  | `X-Event-Id` | UUID do evento (idempotência) |
  | `X-Timestamp` | epoch em segundos |
  | `X-Signature` | `HMAC_SHA256(N8N_WEBHOOK_SECRET, "{timestamp}.{event_id}.{corpo_bruto}")` em hex minúsculo |
  | `X-N8N-Api-Key` | opcional, só se `N8N_API_KEY` estiver configurado |

- **Envelope** (idêntico em todos os eventos):

```json
{
  "event_id": "uuid",
  "event_type": "whatsapp.message.send",
  "tenant_id": "uuid",
  "connection_id": "uuid|null",
  "conversation_id": "uuid|null",
  "occurred_at": "2026-08-01T20:00:00.000Z",
  "source": "platform",
  "version": 1,
  "data": {}
}
```

- **Resposta esperada do n8n**: HTTP 2xx com corpo livre. Qualquer status ≠ 2xx
  (ou timeout de 15 s) marca falha e agenda retry.
- **Eventos suportados na saída**: `whatsapp.connection.create`,
  `whatsapp.connection.qr.request`, `whatsapp.connection.status.request`,
  `whatsapp.connection.disconnect`, `whatsapp.connection.reconnect`,
  `whatsapp.message.send`, `whatsapp.media.send`, `automation.requested`,
  `human.handoff.requested`, `system.integration.test`.

Quem emite: `n8n-dispatch-event` (imediato + outbox), `whatsapp-connection-command`,
`whatsapp-send-message`; e `process-event-outbox` para reenvio/retry.

### Exemplos de payload (`data`)

1. Criar sessão — `whatsapp.connection.create`
```json
{ "connection_name": "Vendas", "provider_type": "n8n_unofficial", "webhook_callback": "https://<projeto>.supabase.co/functions/v1/n8n-webhook-receiver" }
```
2. Solicitar QR — `whatsapp.connection.qr.request`
```json
{ "session_id": "vendas-01" }
```
3. Consultar status — `whatsapp.connection.status.request`
```json
{ "session_id": "vendas-01" }
```
4. Desconectar — `whatsapp.connection.disconnect`
```json
{ "session_id": "vendas-01", "logout": false }
```
5. Reconectar — `whatsapp.connection.reconnect`
```json
{ "session_id": "vendas-01" }
```
6. Enviar mensagem — `whatsapp.message.send`
```json
{
  "message_id": "uuid",
  "to": "5511999998888",
  "chat_id": "5511999998888@c.us",
  "message_type": "text",
  "content": "Olá! Como posso ajudar?",
  "media_url": null
}
```

## 2. Entrada: n8n → plataforma (callbacks)

- **Endpoint**: `POST https://<projeto>.supabase.co/functions/v1/n8n-webhook-receiver`
- **Headers**: os mesmos 4 headers acima, assinados com o **mesmo**
  `N8N_WEBHOOK_SECRET`.
- **Validações** (todas rejeitam com 4xx e nada é gravado nas tabelas de negócio):
  assinatura inválida (401), timestamp fora da janela de 5 min (401),
  headers ausentes (400), `event_type` desconhecido (400),
  `tenant_id` divergente do header (401), integração inativa (403),
  `X-Event-Id` repetido → `200 {"ok":true,"duplicate":true}` (idempotência via
  UNIQUE `(source, external_event_id)` em `inbound_events`).
- **Resposta**: `200 {"ok": true}`.

### Eventos de retorno aceitos

`whatsapp.connection.creating`, `whatsapp.connection.qr.generated`,
`whatsapp.connection.connected`, `whatsapp.connection.disconnected`,
`whatsapp.connection.error`, `whatsapp.message.received`,
`whatsapp.message.queued`, `whatsapp.message.sent`,
`whatsapp.message.delivered`, `whatsapp.message.read`,
`whatsapp.message.failed`, `automation.*`, `system.integration.test.ack`.

### Exemplos de callback

7. Retorno de QR Code
```json
{
  "event_type": "whatsapp.connection.qr.generated",
  "tenant_id": "uuid",
  "connection_id": "uuid",
  "data": { "qr_code": "data:image/png;base64,...", "expires_at": "2026-08-01T20:01:00Z" }
}
```
8. Conectado
```json
{
  "event_type": "whatsapp.connection.connected",
  "tenant_id": "uuid",
  "connection_id": "uuid",
  "data": { "phone_number": "5511999998888", "session_id": "vendas-01" }
}
```
9. Mensagem enviada
```json
{
  "event_type": "whatsapp.message.sent",
  "tenant_id": "uuid",
  "connection_id": "uuid",
  "data": { "provider_message_id": "3EB0...", "message_id": "uuid" }
}
```
10. Falha de envio
```json
{
  "event_type": "whatsapp.message.failed",
  "tenant_id": "uuid",
  "connection_id": "uuid",
  "data": { "provider_message_id": "3EB0...", "error_code": "SESSION_DISCONNECTED", "message": "sessão não conectada" }
}
```

Mensagem recebida (`whatsapp.message.received`) usa
`{ chat_id, phone, name, message_type, content, media_url, media_mime_type, provider_message_id }`
e cria/atualiza contato, conversa e mensagem automaticamente.

## 3. Máquina de estados

**Conexão** (`whatsapp_connections.status`):
`disconnected → connecting → qr_pending → connected → disconnected` e `error`
em qualquer ponto. `qr_status`: `idle | pending | available | expired`.

**Mensagem** (`messages.delivery_status`):
`pending → queued → sent → delivered → read`, ou `failed`. Entradas do contato
nascem como `received`.

## 4. Erros padronizados

| Código | Significado | Ação |
| --- | --- | --- |
| `INVALID_SIGNATURE` | HMAC não confere | revisar segredo compartilhado |
| `TIMESTAMP_SKEW` | fora da janela de 5 min | sincronizar relógio |
| `DUPLICATE_EVENT` | `X-Event-Id` já processado | ignorar |
| `INTEGRATION_INACTIVE` | integração do tenant inativa | ativar em `/integrations/n8n` |
| `SESSION_DISCONNECTED` | sessão WhatsApp caiu | reconectar/gerar QR |
| `RATE_LIMITED` | limite do provedor | aguardar retry do outbox |
| `UNKNOWN_EVENT_TYPE` | `event_type` não suportado | revisar workflow |

## 5. Entrega confiável (outbox + cron)

- Todo evento de saída é gravado em `event_outbox` (`pending → sent | dead`).
- `process-event-outbox` roda **a cada minuto** pelo job pg_cron
  `biz-wa-hub-process-event-outbox`, lê até 25 eventos com
  `next_retry_at <= now()`, entrega, incrementa `attempts` e aplica backoff
  exponencial (30 s, 2 m, 8 m, 32 m, máx. 2 h) até `max_attempts`, depois `dead`.
- Cada tentativa é registrada em `webhook_delivery_attempts`
  (URL mascarada, status HTTP, duração, excerto da resposta) — sem segredos.
- Autenticação do cron: chamada via `pg_net` com a chave anônima publicável;
  a função valida internamente e usa o service role apenas dentro da Edge
  Function. Nenhum segredo fica em migration versionada.

Verificar execuções (via ferramentas de banco do Lovable):
`select * from cron.job_run_details order by start_time desc limit 20;`

Desativar/remover o job: `select cron.unschedule('biz-wa-hub-process-event-outbox');`
O agendamento é criado com `unschedule` prévio condicional, então reexecutar
nunca cria duplicidade (nome único).
