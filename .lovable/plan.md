# Plano de Implementação — Correção do Fluxo de Conexão Super Admin

Corrigir a arquitetura das Edge Functions e do banco de dados para permitir que usuários `super_admin` gerenciem conexões de WhatsApp de qualquer tenant, respeitando a seleção feita no frontend.

## Alterações Técnicas

### 1. Banco de Dados (Migrations)
- Limpar funções duplicadas `get_whatsapp_connections_safe`.
- Garantir que a versão com `_tenant_id` seja a única e suporte `super_admin`.
- Atualizar permissões RLS para `whatsapp_connections` e `n8n_integrations`.

### 2. Edge Functions Shared (`_shared/n8n.ts`)
- Atualizar `authenticate(req)` para:
  - Verificar se o usuário possui a role `super_admin`.
  - Não falhar se `profile.tenant_id` for nulo para Super Admins.
  - Retornar `{ userId, tenantId, isSuperAdmin }`.

### 3. Edge Function `whatsapp-connection-command`
- Na criação (`create_connection_entry`): usar `tenant_id` do body se for Super Admin.
- Em comandos existentes: buscar a conexão por ID e validar se o usuário é Super Admin OU se pertence ao tenant da conexão.
- Usar sempre o `tenant_id` real da conexão para enfileirar eventos no outbox.

### 4. Frontend
- Verificar se `src/pages/Connections.tsx` envia corretamente o `tenant_id` no body.

## Passos de Verificação
- Testar criação de conexão como Super Admin selecionando um tenant diferente do próprio.
- Verificar se o QR Code e status funcionam para o tenant selecionado.
- Validar logs do outbox para garantir que o `tenant_id` correto foi gravado.
