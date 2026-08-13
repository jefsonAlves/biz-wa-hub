# Revisão Arquitetural: Chat Zap Flow IA (Serverless Priority)

## 1. Visão Geral
Transformação do sistema em uma arquitetura **Event-Driven Serverless** onde a VPS é utilizada exclusivamente para o orquestrador n8n (automações e IA), enquanto o core business, mensageria em tempo real e gestão de inquilinos residem no Lovable/Supabase.

## 2. Status da Implementação (Fase 1)

### Fase 1: Fundação de Planos e Assinaturas (Concluída)
- [x] Criar tabelas `plans` e `subscriptions` no esquema público.
- [x] Implementar RLS isolando assinaturas por tenant.
- [x] Migrar `asaas-payment` para buscar preços dinamicamente do banco de dados.
- [x] Atualizar Landing Page (`Index.tsx`) para consumir planos da base de dados via React Query.
- [x] Corrigir bugs de tipagem e duplicidade de imports no frontend.

## 3. Próximos Passos (Plano de Ação)

### Fase 2: Normalização de Tenants e CRM (Em Andamento)
- [ ] Renomear referências a `zapi_*` em `whatsapp_connections` para campos genéricos (`provider_token`, `instance_key`).
- [ ] Implementar a Meta Cloud API como provedor prioritário (Serverless nativo).
- [ ] Otimizar o Supabase Realtime para mensagens (remover polling onde existir).

### Fase 3: Integração Asaas Ponta-a-Ponta
- [ ] Criar webhook receiver para o Asaas atualizar o status da `subscriptions` automaticamente.
- [ ] Implementar bloqueio de funcionalidades em caso de inadimplência via RLS global.

### Fase 4: Desacoplamento do n8n (Chat Core)
- [ ] Migrar a recepção de mensagens do WhatsApp da VPS para uma Edge Function direta (Meta Webhooks).
- [ ] Reservar o n8n apenas para fluxos de IA complexos e RAG, evitando o overhead em chats simples.

## 4. Diretrizes Técnicas
- **Zero Secrets no Front**: Chaves de API (Meta, Asaas, OpenAI) devem residir apenas em segredos das Edge Functions.
- **Isolamento RLS**: Cada tabela deve ter política de `tenant_id` vinculada ao `auth.uid()`.
- **Performance**: Manter o `PAGE_SIZE` do Inbox otimizado para evitar estouro de memória em dispositivos móveis.
