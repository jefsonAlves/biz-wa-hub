
# AgentFlow - Refatoração Completa para WhatsApp SaaS

## Estado Atual

O projeto já tem uma base sólida:
- Auth com RBAC (super_admin, tenant_admin, agent, viewer)
- Tabelas: tenants, profiles, user_roles, conversations, messages, contacts, departments, agents_config, knowledge_items, whatsapp_connections, business_hours
- Edge functions GREEN-API: webhook recebido, envio, QR code, teste, registro de webhooks
- UI funcional mas simples

## O Que Precisa ser Construído

O objetivo é transformar o Inbox em uma experiência próxima ao WhatsApp Web, adicionar sincronização real de contatos/histórico, agendamento de mensagens, notas internas, modo sugestão de IA, relatórios reais e provedor de IA multi-tenant.

---

## FASE 1 - Banco de Dados (Migrations)

### Novas tabelas e colunas:

**1. `schedules`** - Agendamento de mensagens
```sql
CREATE TABLE public.schedules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  conversation_id uuid NOT NULL,
  to_chat_id text NOT NULL,
  message_body text,
  media jsonb,
  run_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'queued', -- queued|sent|failed|canceled
  fail_reason text,
  created_by_user_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
```

**2. `internal_notes`** - Notas internas da equipe (não vão pro WhatsApp)
```sql
CREATE TABLE public.internal_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  conversation_id uuid NOT NULL,
  user_id uuid NOT NULL,
  note_text text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
```

**3. `ai_providers`** - Provedor de IA por tenant ou global
```sql
CREATE TABLE public.ai_providers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid,  -- NULL = global
  scope text NOT NULL DEFAULT 'global', -- global|tenant
  provider text NOT NULL DEFAULT 'lovable_fallback', -- openai|gemini|lovable_fallback
  api_key_encrypted text,
  model text,
  config jsonb,
  is_active boolean DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
```

**4. Alterar `conversations`**: adicionar coluna `ai_mode` (text: 'auto'|'suggest'|'off') e `wa_chat_id` (text)

**5. Alterar `contacts`**: adicionar `wa_chat_id` (text), `last_message_preview` (text)

**6. Alterar `whatsapp_connections`**: adicionar `api_url` (text, default 'https://api.green-api.com'), `sync_status` (text)

**7. Alterar `messages`**: adicionar `direction` (text: 'incoming'|'outgoing'), `wa_message_id` (text), `delivery_status` atualizado

**8. Índices de performance:**
```sql
CREATE INDEX idx_conversations_last_message_at ON conversations(last_message_at DESC);
CREATE INDEX idx_messages_conversation_id_created ON messages(conversation_id, created_at);
CREATE INDEX idx_contacts_tenant_wa_chat ON contacts(tenant_id, wa_chat_id);
CREATE INDEX idx_schedules_run_at_status ON schedules(run_at, status);
```

**9. RLS policies** para as novas tabelas (schedules, internal_notes, ai_providers) seguindo o mesmo padrão multi-tenant existente.

---

## FASE 2 - Edge Functions

### 2.1 `green-api-sync` (NOVA)
Sincronização de contatos e histórico inicial.
- Chama `GET /waInstance{id}/getContacts/{token}` → upsert em `contacts` + cria `conversations`
- Para cada conversa, chama `POST getChatHistory` com count=20
- Insere mensagens históricas no DB (direction=incoming/outgoing)
- Atualiza `last_message_preview` no `contacts`

### 2.2 `green-api-status` (NOVA)
- Chama `GET /waInstance{id}/getStatusInstance/{token}`
- Retorna `statusInstance` e `stateInstance` (authorized/notAuthorized)
- Cache no DB (campo `sync_status` em whatsapp_connections)

### 2.3 `green-api-schedule-worker` (NOVA) 
Worker de agendamentos (chamado via cron a cada 1 minuto):
- SELECT schedules WHERE status='queued' AND run_at <= now()
- Para cada: envia via GREEN-API, atualiza status=sent, insere em messages (direction=outgoing)
- Em caso de erro: status=failed, registra fail_reason

### 2.4 `zapi-webhook-received` (ATUALIZAR)
Melhorar o handler existente:
- Salvar `wa_chat_id` e `direction=incoming` nas mensagens
- Processar status de entrega (outgoingMessage → update delivery_status)
- Atualizar `last_message_preview` e `last_message_at` em contacts
- Disparar realtime notification

### 2.5 `zapi-send` (ATUALIZAR)
- Salvar mensagem no DB com `direction=outgoing` antes de enviar
- Suportar modo `suggest` (salva como rascunho, não envia)
- Retornar o `idMessage` da GREEN-API e atualizar `wa_message_id`

---

## FASE 3 - Frontend

### 3.1 Inbox Completo (estilo WhatsApp Web)
Reescrever completamente `src/pages/Inbox.tsx`:

**Layout:**
```
┌──────────────────────────────────────────────────────────┐
│ SIDEBAR (320px)         │  CHAT PANEL (flex-1)           │
│                         │                                │
│ [🔍 Busca]              │  [Avatar] Nome Tel Dept Agente │
│ [Filtros: Meu/Todos/..] │  [Tags] [IA: ON/OFF toggle]   │
│                         │  [Status: ● Online]            │
│ ┌─ Conversa 1 ────────┐ │  ─────────────────────────    │
│ │ Avatar Nome   10:30 │ │  [Histórico com scroll]        │
│ │ Preview msg   [3]   │ │  [Separadores de data]         │
│ │ [tag] [dept]        │ │  [Bolhas: cliente/IA/agente]   │
│ └─────────────────────┘ │  [Status ✓ ✓✓]               │
│ ┌─ Conversa 2 ────────┐ │  ─────────────────────────    │
│ │ ...                 │ │  [Aba: Mensagem | Interno]    │
│ └─────────────────────┘ │  [+] [Input] [Enviar]         │
└──────────────────────────────────────────────────────────┘
```

**Funcionalidades:**
- Busca full-text por nome/telefone/conteúdo
- Filtros: "Meus", "Não atribuídos", "Abertos", "Pendentes", por departamento
- Badge de não-lidas por conversa
- Status de entrega nas mensagens (✓ enviado, ✓✓ entregue, ✓✓ azul lido)
- Indicador "digitando..." (via realtime)
- Scroll infinito com paginação de histórico
- Separadores de data entre mensagens
- Aba "Mensagem" vs "Interno" no input
- Botão "+" com menu suspenso (agendar, nota interna, transferir, tag, mudar status)
- Toggle IA ativa/pausada por conversa
- Botão "Sugerir resposta" (IA sugere, agente aprova)
- Header com avatar, nome, telefone, tags editáveis, departamento, agente atribuído

### 3.2 Painel de Ações (Menu "+")
Componente `src/components/inbox/ActionMenu.tsx`:
- Agendar mensagem → Dialog com date/time picker + texto/mídia
- Nota interna → Input rápido que insere em `internal_notes`
- Marcar como (pendente/fechado/aberto)
- Transferir para departamento → Select departments
- Adicionar tag → Input com sugestões

### 3.3 Página de Relatórios (`src/pages/Reports.tsx`) - NOVA
- KPIs: mensagens recebidas/enviadas por dia, tempo médio 1ª resposta
- Gráfico de barras por departamento/agente
- % IA ativa vs pausada
- Falhas de envio e IA
- Seletor de período (últimos 7, 30, 90 dias)

### 3.4 Settings - aba "Providers IA" (NOVA aba)
- Modo Global: usar chave global do SaaS (LOVABLE_API_KEY - sem custo para tenant)
- Modo BYO: tenant cadastra sua chave OpenAI/Gemini
- Formulário para inserir/editar `ai_providers`

### 3.5 Settings - aba "Sincronização WhatsApp"
- Botão "Sincronizar Contatos/Histórico" → chama `green-api-sync`
- Exibe progresso e status
- Instrução step-by-step para logout+reauthorize do histórico antigo
- Status "Online/Offline" da instância em tempo real (polling a cada 30s)

### 3.6 Dashboard - melhorias
- KPIs reais: conversas abertas, pendentes, fechadas hoje
- Tempo médio de 1ª resposta calculado do DB
- Gráfico 7 dias corrigido (filtrar por tenant)

### 3.7 AppSidebar - indicador de status WhatsApp
- Badge dinâmico "🟢 WhatsApp Online" ou "🔴 Offline" no sidebar
- Atualizado via polling/realtime

---

## FASE 4 - Cron de Agendamentos

Usando pg_cron + pg_net para chamar `green-api-schedule-worker` a cada minuto:
```sql
SELECT cron.schedule(
  'process-schedules',
  '* * * * *',
  $$ SELECT net.http_post(url:='https://...functions/v1/green-api-schedule-worker', ...) $$
);
```

---

## FASE 5 - Realtime

Habilitar realtime nas tabelas críticas:
```sql
ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.conversations;
ALTER PUBLICATION supabase_realtime ADD TABLE public.contacts;
ALTER PUBLICATION supabase_realtime ADD TABLE public.internal_notes;
```

O hook de realtime no Inbox já existe, será aprimorado para cobrir notes e contact updates.

---

## Sequência de Implementação

1. Migration: novas tabelas + colunas + índices + RLS
2. Edge functions: `green-api-sync`, `green-api-status`, atualizar `zapi-webhook-received` e `zapi-send`
3. Inbox completo reescrito (componente principal + subcomponentes)
4. `Reports.tsx` nova página
5. Settings: novas abas (Sync + AI Providers)
6. Dashboard melhorado + AppSidebar com status WhatsApp
7. Cron de agendamentos
8. Rota `/reports` adicionada ao App.tsx e sidebar

---

## Arquivos a Criar/Modificar

**Criar:**
- `src/pages/Reports.tsx`
- `src/components/inbox/ConversationList.tsx`
- `src/components/inbox/ChatPanel.tsx`
- `src/components/inbox/ActionMenu.tsx`
- `src/components/inbox/MessageBubble.tsx`
- `src/components/inbox/InternalNotes.tsx`
- `src/components/inbox/ScheduleDialog.tsx`
- `src/components/WhatsAppStatusBadge.tsx`
- `supabase/functions/green-api-sync/index.ts`
- `supabase/functions/green-api-status/index.ts`
- `supabase/functions/green-api-schedule-worker/index.ts`

**Modificar:**
- `src/pages/Inbox.tsx` (reescrever como orquestrador dos subcomponentes)
- `src/pages/Settings.tsx` (novas abas: Sync + AI Providers)
- `src/pages/Dashboard.tsx` (KPIs reais)
- `src/components/AppSidebar.tsx` (badge WhatsApp status)
- `src/layouts/DashboardLayout.tsx` (rota reports)
- `src/App.tsx` (rota /reports → Reports)
- `supabase/functions/zapi-webhook-received/index.ts` (direction, wa_chat_id, preview)
- `supabase/functions/zapi-send/index.ts` (direction=outgoing, suggest mode)

**Migrations:**
- `supabase/migrations/XXXX_schedules_notes_providers.sql`
- `supabase/migrations/XXXX_add_columns_performance.sql`
- `supabase/migrations/XXXX_realtime.sql`
