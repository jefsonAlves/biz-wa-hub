

# Reconstrucao Completa: AgentFlow SaaS - WhatsApp Multi-Tenant

## Visao Geral

Reconstruir o projeto do zero como um SaaS multi-tenant de atendimento via WhatsApp com integracao Z-API real, autenticacao via Supabase, IA com Lovable AI, e painel completo.

---

## Fase 0 - Infraestrutura (Lovable Cloud + Banco)

1. Ativar Lovable Cloud para obter Supabase integrado
2. Criar schema completo do banco com migrations:
   - `tenants` (empresa, plano, status, limites)
   - `profiles` (nome, avatar, tenant_id)
   - `user_roles` (user_id, role enum: super_admin/tenant_admin/agent/viewer)
   - `departments` (nome, tenant_id)
   - `agents_config` (persona IA, system_prompt, modelo, temperatura, moderacao)
   - `whatsapp_connections` (instance_id, token, client_token, status, tenant_id) - tokens criptografados
   - `contacts` (telefone normalizado, nome, tenant_id)
   - `conversations` (contact_id, department_id, status, agent_id, ai_paused, sales_status, deal_value)
   - `messages` (conversation_id, role, content, type, author_id, is_internal, audio_url)
   - `knowledge_items` (tenant_id, title, type, content, status)
   - `business_hours` (tenant_id, config JSON)
   - `system_logs` (tenant_id, level, action, details)
   - `plan_configs` (tier, limits)
3. RLS policies usando funcao `has_role()` para seguranca multi-tenant
4. Storage bucket para midias (audio, imagens, PDFs)

## Fase 1 - Autenticacao e RBAC

1. Remover sistema de auth simulado (`src/lib/auth.ts` com senhas hardcoded)
2. Implementar auth real via Supabase Auth:
   - Pagina `/auth` com login e cadastro (email/senha)
   - Redirect automatico pos-login baseado na role
   - Listener `onAuthStateChange` para sessao persistente
3. Roles via tabela `user_roles` (nao no perfil):
   - super_admin: acesso total
   - tenant_admin: gerencia sua empresa
   - agent: inbox e respostas
   - viewer: somente leitura
4. Componente `ProtectedRoute` que valida role server-side

## Fase 2 - Layout e Navegacao

1. Limpar todas as paginas atuais (Dashboard, Chat, Sectors, Agents, admin/*)
2. Reconstruir sidebar dinamica baseada na role do usuario autenticado:
   - Super Admin: Dashboard global, Tenants, Planos, Logs, Configuracoes
   - Tenant Admin: Dashboard, Inbox, Agentes IA, Base de Conhecimento, Departamentos, Configuracoes (Z-API, horarios), Relatorios
   - Agent: Inbox (filtrado), Meus Atendimentos
   - Viewer: Dashboard (readonly), Relatorios
3. Header com info do usuario, notificacoes, logout

## Fase 3 - Paginas Principais (com dados reais persistidos)

### Dashboard
- Graficos de atendimentos por departamento (Recharts)
- Metricas: volume, tempo medio de resposta, conversoes
- Cards de status: conversas ativas, em espera, fechadas

### Inbox (Conversas WhatsApp)
- Lista de conversas com busca, filtros (status, departamento, agente)
- Chat em tempo real com Supabase Realtime
- Identificacao do atendente em cada mensagem
- Notas internas (nao enviadas ao WhatsApp)
- Botoes: Assumir conversa, Pausar/Retomar IA, Transferir departamento
- Suporte a audio, imagens, PDFs (storage)
- Tags e status de vendas (lead/negotiation/won/lost)

### Agentes IA
- CRUD de agentes com: nome, persona, system_prompt, modelo, temperatura
- Few-shot examples, moderacao (keywords bloqueadas)
- Toggle ativo/inativo por agente
- Configuracao de voz (futuro)

### Base de Conhecimento
- Upload de texto, PDF, URL
- Status de indexacao (processing/indexed)
- Usado como contexto RAG pela IA

### Departamentos
- CRUD de departamentos por tenant
- Vinculacao de agentes e atendentes

### Configuracoes
- Conexao Z-API (instance_id, token, client_token)
- Teste de conexao (GET /me na Z-API)
- Horarios comerciais com mensagem fora do expediente
- Moderacao global

### Relatorios
- Volume de mensagens por periodo
- Tempo de primeira resposta e resolucao
- Ranking por agente/departamento
- Conversoes e valores de deals

## Fase 4 - Integracao Z-API (Edge Functions)

1. **Edge Function: `zapi-webhook-received`** (public, sem JWT)
   - Recebe webhook `on-message-received`
   - Identifica tenant pela instance_id
   - Normaliza telefone, upsert contato
   - Cria/encontra conversation
   - Insere message no banco
   - Baixa midia para storage (antes de expirar)
   - Dispara IA se nao pausada

2. **Edge Function: `zapi-webhook-sent`** (public)
   - Recebe delivery status
   - Atualiza status da mensagem

3. **Edge Function: `zapi-send`** (autenticada)
   - Envia mensagem via Z-API
   - Registra no banco com status "queued"

4. **Edge Function: `zapi-test`** (autenticada)
   - Testa credenciais Z-API (GET /me)

5. **Edge Function: `zapi-register-webhooks`** (autenticada)
   - Registra URLs de webhook na Z-API

## Fase 5 - Motor de IA (Lovable AI Gateway)

1. **Edge Function: `ai-chat`**
   - Recebe mensagem + contexto da conversa
   - Carrega system_prompt do agente configurado
   - Busca RAG na base de conhecimento
   - Chama Lovable AI Gateway (google/gemini-3-flash-preview)
   - Guardrails: detecta dados sensiveis, abre handoff
   - Retorna resposta (streaming ou nao)

2. **Edge Function: `ai-suggest`** (Copiloto)
   - Gera sugestao de resposta para o atendente humano
   - Nao envia automaticamente

## Fase 6 - Super Admin

- Dashboard global com metricas de todos os tenants
- CRUD de tenants com planos e status
- Logs de sistema com filtros
- Gerenciamento de planos e limites
- Modo "impersonar" tenant (visualizar como tenant_admin)

## Fase 7 - Metering e Limites

- Contagem de mensagens por tenant/mes
- Verificacao de limites antes de enviar/receber
- Banner de upgrade quando atingir limite
- Webhook interno para atualizacao de plano

---

## Detalhes Tecnicos

### Stack
- Frontend: React + Vite + TypeScript + Tailwind (stack Lovable)
- Backend: Supabase (Lovable Cloud) + Edge Functions (Deno)
- Banco: PostgreSQL via Supabase
- IA: Lovable AI Gateway
- Realtime: Supabase Realtime para inbox
- Storage: Supabase Storage para midias

### Seguranca
- Tokens Z-API armazenados como secrets no Supabase
- RLS em todas as tabelas com isolamento por tenant
- Funcao `has_role()` SECURITY DEFINER para evitar recursao
- Rate limiting nos webhooks publicos
- Auditoria de acoes criticas

### Arquivos a Remover/Reescrever
- `src/lib/auth.ts` (auth simulado com senhas hardcoded - REMOVER)
- Todas as paginas atuais serao reescritas com dados reais
- `src/components/AppSidebar.tsx` - reescrever com roles reais

### Ordem de Implementacao
1. Lovable Cloud + migrations do banco + RLS
2. Auth real + roles + pagina /auth
3. Layout + sidebar dinamica
4. CRUD de departamentos e funcionarios
5. Inbox basico com dados do banco
6. Edge functions Z-API (webhooks + envio)
7. Motor de IA
8. Relatorios e metering
9. Super Admin panel

---

## Secrets Necessarios (serao solicitados na implementacao)
- Credenciais Z-API (instance_id, token, client_token) - armazenados como Supabase secrets
- LOVABLE_API_KEY - ja pre-configurado automaticamente

