# Revisão Arquitetural: Chat Zap Flow IA (Serverless Priority)

Este documento detalha o diagnóstico técnico e o plano de migração para a nova arquitetura moderna, visando a eliminação de infraestrutura pesada (VPS) em favor de serviços gerenciados (Supabase/Lovable).

## 1. Arquitetura Atual (Diagnóstico)
O sistema opera em um modelo híbrido:
- **Frontend**: React/Vite (Lovable).
- **Backend**: Supabase (Auth, DB, RLS, Storage) + Edge Functions.
- **WhatsApp**: Dependente de um orchestrator no n8n que consome a `whatsapp_connections` e responde via `n8n-webhook-receiver`.
- **Mensageria**: O outbox do Supabase (`event_outbox`) enfileira comandos que são enviados ao n8n via Edge Function.
- **Identidade Visual**: Já migrada para "Chat Zap Flow IA".

### Problemas Encontrados
- **Acoplamento ao n8n**: O fluxo de mensagens em tempo real (`WhatsApp -> n8n -> Edge Function -> DB`) adiciona latência e carga na VPS.
- **Lógica de Planos**: Preços estão hard-coded em Edge Functions (Asaas), dificultando a gestão comercial.
- **Infraestrutura**: Ainda existe dependência de scripts externos para processar o outbox.

## 2. Arquitetura Proposta (Alvo)
Transição para um modelo **Event-Driven Serverless**:
- **VPS (n8n)**: Exclusiva para IA avançada e integrações de terceiros (CRM, Calendar).
- **WhatsApp**: Prioridade para **Meta Cloud API** (Direct Hook) para reduzir latência e custos.
- **Realtime**: Uso nativo do Supabase Realtime (Canais e Broadcast).
- **Fila de Automação**: Fila leve baseada em tabelas SQL e `pg_cron`/Edge Functions.

## 3. Plano de Migração (Fases)

### Fase 1: Fundação Empresarial e RLS (MVP)
- [ ] Renomear tabelas `tenants` para `companies` (ou manter `tenants` como alias estável).
- [ ] Garantir isolamento RLS total por `company_id`.
- [ ] Criar tabelas de `subscriptions` e `plans` para remover hard-coding de preços.

### Fase 2: Camada de Mensageria e WhatsApp Provider
- [ ] Implementar `interface WhatsAppProvider` no backend (Edge Functions).
- [ ] Criar o provedor `meta_cloud` (Direct Hook).
- [ ] Refatorar o provedor `n8n_unofficial` para ser um módulo desacoplado.

### Fase 3: Realtime e Performance
- [ ] Substituir qualquer polling residual por assinaturas Supabase Realtime.
- [ ] Criar SQL Views e Materialized Views para o Dashboard (evitar contagem pesada de mensagens).
- [ ] Implementar Paginação por Cursor em mensagens.

### Fase 4: Integração Financeira (Asaas v2)
- [ ] Mover lógica de preços para a tabela `plans`.
- [ ] Implementar Webhook de Retorno do Asaas com idempotência e validação de assinatura.

### Fase 5: n8n Relegado (Automações)
- [ ] Criar trigger `automation_requested` que chama o n8n apenas se a automação estiver ativa.
- [ ] Implementar `n8n-callback` seguro para receber resultados de fluxos assíncronos.

## 4. O que será removido
- [ ] Dependência de workers permanentes para chat em tempo real.
- [ ] Lógica de Baileys/Socket.io no core (mantidos apenas se o usuário trouxer um provider externo).
- [ ] Valores de planos fixos no código.

## 5. Estimativa Qualitativa de Consumo
| Componente | Arquitetura Antiga (VPS) | Nova Arquitetura (Serverless) |
| :--- | :--- | :--- |
| **CPU/RAM VPS** | Alta (Node/Redis/Workers) | Baixa (Apenas n8n ocioso) |
| **Latência Chat** | Média (Múltiplos saltos) | Baixa (Direct Meta Hook) |
| **Manutenção** | Alta (Atualizar libs, DB, OS) | Baixa (Managed Services) |

---
**Próximo Passo**: Iniciar a Fase 1 com a criação das tabelas de Planos e Assinaturas e normalização da estrutura multi-tenant.
