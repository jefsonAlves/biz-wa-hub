# Plataforma SaaS de Atendimento WhatsApp + n8n — Arquitetura e Plano de Execução

## 1. Diagnóstico da estrutura atual

Já existe e funciona:
- Multiempresa: `tenants`, `profiles.tenant_id`, `user_roles` (super_admin, tenant_admin, agent, viewer) e RLS com funções seguras (`get_user_tenant_id`, `has_role`, `is_tenant_member`).
- Atendimento: `contacts`, `conversations`, `messages`, `internal_notes`, `schedules`, `departments`, `agents_config`, `knowledge_items`, `business_hours`, `system_logs`.
- Integração WhatsApp via GREEN-API/Z-API em 9 edge functions (`zapi-send`, `zapi-webhook-received`, `green-api-sync`, etc.).
- Frontend: Inbox, Departamentos, Equipe, Conhecimento, Relatórios, Configurações, área admin.

## 2. Problemas e riscos identificados

1. Tokens do provedor (`zapi_token`, `zapi_client_token`) estão em colunas de `whatsapp_connections` legíveis pelo frontend — vazamento de credencial.
2. Acoplamento a um provedor: nomes `zapi_*` espalhados no schema, funções e UI.
3. Webhook de entrada sem assinatura, sem timestamp, sem controle de replay; idempotência apenas por consulta ad-hoc de `wa_message_id`.
4. Lógica de IA embutida no webhook, sem trava de concorrência (humano e IA podem responder juntos) e sem fila/retry — evento perdido em falha.
5. Sem filas, SLA, histórico de atribuição, supervisão, auditoria estruturada nem controle de envio (rate limit / opt-out).
6. Sem camada de eventos: nada para o n8n consumir de forma confiável.

## 3. Arquitetura proposta

```text
Frontend (React/Vite)
   |  supabase-js (RLS, apenas dados não sensíveis)
   v
Supabase (PostgreSQL + RLS)  <-- fonte oficial dos dados
   |  event_outbox                     ^ inbound_events (idempotência)
   v                                   |
Edge Functions (segredos ficam aqui)
   n8n-dispatch-event  ---HMAC--->  n8n self-hosted (HTTPS público)
   n8n-webhook-receiver <--HMAC---  n8n
   whatsapp-* (provider adapters) <---> GREEN-API / Z-API / oficial
```

Regras: frontend nunca fala com n8n nem com provedor; todo segredo em Supabase Secrets; todo dado com `tenant_id` + RLS.

## 4. Tabelas mantidas sem alteração

`tenants`, `departments`, `business_hours`, `internal_notes`, `plan_configs`, `system_logs`, `schedules`.

## 5. Tabelas alteradas

- `whatsapp_connections`: renomear para `provider`, `provider_instance_id`, `provider_api_url`, `provider_token_reference`; tokens movidos para storage seguro; campos de rate limit e opt-in; remover leitura de token pelo frontend.
- `messages`: `provider_message_id` (mantendo coluna antiga como alias durante a transição).
- `conversations`: `queue_id`, `assigned_at`, `first_response_at`, `waiting_since`, `last_customer_message_at`, `last_agent_message_at`, `closed_by`, `priority`, `sla_policy_id`, `transfer_count`, `automation_status`, `human_takeover`, `origin`, `channel`.
- `knowledge_items`: `scope_type`, `department_id`, `agent_config_id`, `source_type`, `storage_path`, `version`, `approved_by`, `approved_at`, `valid_until`, `metadata`.
- `user_roles`: novos papéis `tenant_owner`, `supervisor`, `automation` no enum `app_role`.

## 6. Novas tabelas

Integração: `n8n_integrations`, `event_outbox`, `inbound_events`, `automation_locks`, `automation_executions`.
Acesso: `department_members`, `user_permissions`, `user_connection_access`, `user_department_access`, `user_sessions`, `audit_events`.
Atendimento: `queues`, `conversation_assignments`, `sla_policies`, `connection_send_policies`, `contact_consents`, `blocklist`.
Chat interno: `internal_channels`, `internal_channel_members`, `internal_messages`, `internal_message_reads`.

## 7. Contratos

Evento plataforma -> n8n (`POST {base_url}{webhook_path}`), cabeçalhos `X-Tenant-Id`, `X-Event-Id`, `X-Timestamp`, `X-Signature`; corpo no formato único `{event_id, event_type, tenant_id, connection_id, conversation_id, occurred_at, source, data}`.
Assinatura: `HMAC_SHA256(webhook_secret, timestamp + "." + event_id + "." + corpo_json_bruto)`.
Rejeição: assinatura inválida, timestamp fora da janela de 5 min, `event_id` repetido, tenant divergente, schema inválido, integração inativa.
n8n -> plataforma: mesmos cabeçalhos, tipos `automation.reply|tag|assign|transfer|pause|resume|close|internal_note|create_task|handoff|error`.

## 8. Idempotência, filas e retries

`inbound_events` com UNIQUE (`source`, `external_event_id`) para tudo que entra. Saída pelo padrão Outbox: gravação transacional em `event_outbox`, worker com retry exponencial (`attempts`, `next_retry_at`, `max_attempts`), circuit breaker por integração e reenvio manual. `automation_locks` impede resposta simultânea de IA e humano.

## 9. Fases

**Fase 1 — Fundação segura (primeira entrega)**
Abstração de provedor + migração de nomes preservando dados; tokens fora do alcance do frontend; `n8n_integrations`, `event_outbox`, `inbound_events`; edge functions `n8n-test-connection`, `n8n-dispatch-event`, `n8n-webhook-receiver`, `n8n-execution-status`, `n8n-retry-failed-event`; webhooks assinados; página `/integrations/n8n` e `/integrations/whatsapp` (URL mascarada, testar conexão, pendentes, falhas, reenviar, girar segredo).

**Fase 2 — Equipe e filas**
Papéis novos, `department_members` e tabelas de acesso, múltiplos números por tenant, `queues` com estratégias de distribuição, atribuição e transferência com `conversation_assignments`, páginas `/queues`.

**Fase 3 — SLA e supervisão**
`sla_policies`, métricas de primeira resposta/resolução/espera, painel `/supervision` em tempo real, alertas `sla.warning` / `sla.breached`, `/sla`.

**Fase 4 — Chat interno**
Canais diretos/grupo/departamento/avisos, anexos em storage, menções, não lidas, `/internal-chat`.

**Fase 5 — Conhecimento e IA (modo sugestão)**
Escopos de conhecimento, versões e aprovação, configuração de IA por tenant, modo sugestão com aprovação do atendente, handoff humano.

**Fase 6 — IA semiautomática e governança**
Estados de automação, limites de envio/opt-out/quiet hours, `audit_events` completo, recursos LGPD (exportar, anonimizar, retenção), `/automation-events`, `/audit`, `/security`.

## 10. Testes e verificação

Por fase: migrations revisadas, lint + build, testes das edge functions (assinatura válida/inválida, replay, tenant errado, retry), verificação de RLS com consultas cruzadas entre tenants, e validação visual das páginas novas antes de avançar.

## 11. Observações de conformidade

Nenhum mecanismo para burlar bloqueios ou detecção do WhatsApp. Limites de envio, quiet hours, opt-in e blocklist existem para estabilidade operacional, consentimento e prevenção de abuso — nenhum intervalo garante que um número não seja bloqueado.

## Próximo passo

Aprovando o plano, executo a **Fase 1** completa (migrations + edge functions + páginas de integração) e só sigo para a Fase 2 após validação.
