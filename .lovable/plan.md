

# Implementacao Completa: Paginas CRUD + Edge Functions Z-API + Fix Auth

## Problema Atual

O sistema tem apenas a estrutura basica: banco de dados criado, pagina de auth e sidebar. Porem:
- **Auth quebrado**: email confirmation esta ativo, impedindo login apos cadastro
- **Todas as paginas sao placeholders** com texto "Em breve"
- **Nenhuma edge function existe** - Z-API nao esta integrada
- **Nenhum CRUD funcional** - departamentos, agentes, configuracoes sao stubs

---

## 1. Corrigir Autenticacao

- Habilitar auto-confirm de email no Supabase Auth para que usuarios possam logar imediatamente apos cadastro
- Criar um tenant automaticamente no signup (trigger ou logica no frontend) para que novos usuarios tenham tenant_id
- Atribuir role `tenant_admin` automaticamente ao primeiro usuario de um tenant

## 2. Paginas CRUD Completas

### 2.1 Departamentos (`/departments`)
- Lista de departamentos do tenant com tabela
- Dialog para criar/editar departamento (nome, descricao)
- Botao de excluir com confirmacao
- Dados persistidos via Supabase (`departments` table)

### 2.2 Agentes IA (`/agents`)
- Lista de agentes com cards ou tabela
- Formulario completo: nome, persona, system_prompt, modelo (select com opcoes), temperatura (slider), few-shot examples (textarea JSON), keywords bloqueadas (tags input)
- Toggle ativo/inativo
- Vinculacao opcional com departamento
- Dados persistidos via Supabase (`agents_config` table)

### 2.3 Base de Conhecimento (`/knowledge`)
- Lista de itens com status (processing/indexed)
- Upload de texto (textarea), URL, ou arquivo PDF
- Armazenamento de arquivos no bucket `media`
- Dados persistidos via Supabase (`knowledge_items` table)

### 2.4 Configuracoes (`/settings`)
- **Aba Z-API**: campos para instance_id, token, client_token + botao "Testar Conexao"
- **Aba Horarios**: configuracao de dias/horarios + mensagem fora do expediente
- **Aba Geral**: nome da empresa, configuracoes do tenant
- Dados persistidos via Supabase (`whatsapp_connections`, `business_hours`, `tenants`)

### 2.5 Equipe (`/team`)
- Lista de membros do tenant com roles
- Convidar novo membro (email + role)
- Alterar role de membros existentes

### 2.6 Inbox (`/inbox`)  
- Lista de conversas do tenant (lado esquerdo)
- Painel de chat (lado direito) com mensagens em tempo real
- Botoes: Assumir, Pausar/Retomar IA, Transferir departamento
- Suporte a notas internas
- Realtime via Supabase subscriptions

### 2.7 Dashboard (`/dashboard`)
- Cards com metricas reais do banco (count de conversas, contatos, mensagens)
- Grafico de mensagens por dia (Recharts)

## 3. Edge Functions Z-API

### 3.1 `zapi-webhook-received` (publica, sem JWT)
- Recebe POST do webhook Z-API `on-message-received`
- Identifica tenant pelo `instanceId` no payload
- Normaliza telefone, faz upsert do contato
- Cria ou encontra conversa existente
- Insere mensagem no banco
- Baixa midia (se houver) para o bucket `media`
- Dispara resposta IA se `ai_paused = false`

### 3.2 `zapi-webhook-sent` (publica, sem JWT)
- Recebe delivery status do Z-API
- Atualiza `delivery_status` da mensagem no banco

### 3.3 `zapi-send` (autenticada)
- Recebe conversation_id + conteudo
- Busca credenciais Z-API do tenant
- Envia via API Z-API (text/audio/document)
- Registra mensagem no banco com status "queued"

### 3.4 `zapi-test` (autenticada)
- Recebe instance_id, token, client_token
- Faz GET na Z-API `/me` para validar credenciais
- Retorna status da conexao

### 3.5 `zapi-register-webhooks` (autenticada)
- Registra URLs de webhook na Z-API para o tenant
- Configura received, sent e connected webhooks

## 4. Paginas Admin (Super Admin)

### 4.1 Tenants (`/admin/tenants`)
- Lista de todos os tenants com plano, status, contagem de mensagens
- Editar plano/status de um tenant

### 4.2 Logs (`/admin/logs`)
- Tabela de system_logs com filtros por level, tenant, acao

### 4.3 Planos (`/admin/plans`)
- Lista de plan_configs com edicao de limites

---

## Detalhes Tecnicos

### Ordem de Implementacao
1. Fix auth (auto-confirm + auto-create tenant/role)
2. Migration para trigger de auto-tenant no signup
3. Paginas CRUD: Departamentos, Agentes, Knowledge, Settings, Team
4. Edge Functions: zapi-test, zapi-send, zapi-webhook-received, zapi-webhook-sent, zapi-register-webhooks
5. Inbox com realtime
6. Dashboard com metricas reais
7. Paginas admin

### Arquivos a Criar
- `src/pages/Departments.tsx` - CRUD departamentos
- `src/pages/AgentsConfig.tsx` - CRUD agentes IA
- `src/pages/Knowledge.tsx` - CRUD base de conhecimento
- `src/pages/Settings.tsx` - Configuracoes Z-API + horarios
- `src/pages/Team.tsx` - Gerenciamento de equipe
- `src/pages/Inbox.tsx` - Inbox com chat realtime
- `src/pages/AdminTenants.tsx` - Gestao de tenants
- `src/pages/AdminLogs.tsx` - Logs do sistema
- `src/pages/AdminPlans.tsx` - Gestao de planos
- `supabase/functions/zapi-webhook-received/index.ts`
- `supabase/functions/zapi-webhook-sent/index.ts`
- `supabase/functions/zapi-send/index.ts`
- `supabase/functions/zapi-test/index.ts`
- `supabase/functions/zapi-register-webhooks/index.ts`

### Arquivos a Modificar
- `src/App.tsx` - Substituir stubs pelas paginas reais
- `supabase/config.toml` - Adicionar configuracao das edge functions
- Migration SQL para trigger de auto-criacao de tenant + role no signup

### Stack das Edge Functions
- Deno runtime (padrao Supabase)
- Supabase client com service_role_key para operacoes admin
- CORS headers padrao
- Logging detalhado

