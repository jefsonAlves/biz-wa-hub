

## Melhorias na Aba WhatsApp das Configurações

### Contexto
A aba WhatsApp ja tem o botao "Sincronizar Agora" funcionando, o webhook `zapi-webhook-received` ja processa mensagens recebidas com auto-resposta IA integrada, e a pagina `AgentsConfig` permite configurar agentes IA. O que falta e uma experiencia mais completa e integrada na tela de Configuracoes.

### Mudancas Planejadas

#### 1. Card "Agente IA" na aba WhatsApp (Settings.tsx)
Adicionar um novo Card abaixo do card de sincronizacao com:
- Status do agente IA (ativo/inativo) baseado na existencia de um `agents_config` ativo para o tenant
- Botao **"Ativar Agente IA"** que redireciona para `/agents-config` se nao houver agente, ou toggle rapido se ja houver um configurado
- Resumo do agente ativo: nome, modelo, persona
- Switch para ativar/desativar rapidamente o agente sem sair da tela

#### 2. Melhorar o Card de Sincronizacao
- Mostrar data/hora da ultima sincronizacao (campo `last_connected_at` ou `sync_status`)
- Adicionar texto explicativo sobre o que o sync faz (contatos, conversas, historico de ate 30 mensagens por conversa)

#### 3. Card de Status Geral do WhatsApp
- Consolidar informacoes: conexao, webhooks, sync, IA -- tudo visivel de uma vez
- Mostrar checklist visual: Credenciais salvas, WhatsApp conectado, Webhooks registrados, Contatos sincronizados, Agente IA ativo

---

### Detalhes Tecnicos

**Arquivo modificado:** `src/pages/Settings.tsx`

**Nova query adicionada:**
- Buscar `agents_config` do tenant para verificar se ha agente IA ativo
- Query: `supabase.from("agents_config").select("*").eq("tenant_id", tenantId).eq("is_active", true).limit(1).maybeSingle()`

**Nova mutation:**
- Toggle `is_active` do agente diretamente do card
- Update: `supabase.from("agents_config").update({ is_active: !current }).eq("id", agentId)`

**Novo Card "Agente IA":**
- Exibe nome, modelo e persona do agente ativo
- Switch para ativar/desativar
- Link "Configurar Agente" que navega para `/agents-config`
- Se nenhum agente existir, mostra botao "Criar Agente IA" que navega para `/agents-config`

**Checklist de Setup (dentro do Card de Conexao existente):**
- Credenciais salvas (check se `connection` existe)
- WhatsApp conectado (check se `isConnected`)
- Webhooks registrados (check se `connection.webhook_url` existe)
- Contatos sincronizados (check se `connection.sync_status === "synced"`)
- Agente IA ativo (check se ha agente ativo)

Nenhuma mudanca de banco de dados e necessaria -- todas as tabelas ja existem.
