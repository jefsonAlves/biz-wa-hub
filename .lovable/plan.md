

## Sincronizacao Otimizada + Paginacao e Busca no Inbox

### Resumo
Tres grandes mudancas: (1) reescrever a sincronizacao para trazer apenas conversas dos ultimos 30 dias sem criar contatos desnecessarios, (2) adicionar paginacao na lista de conversas do Inbox, e (3) corrigir o sync_status travado.

---

### 1. Reescrever `green-api-sync` - Apenas ultimos 30 dias

**Arquivo:** `supabase/functions/green-api-sync/index.ts`

Estrategia completamente diferente - ao inves de buscar todos os contatos e depois criar conversas, vamos:

1. Buscar `getChats` primeiro (lista de chats recentes da GREEN-API)
2. Filtrar apenas `@c.us` (sem grupos)
3. Para cada chat recente, buscar `getContactInfo` para nome e avatar
4. Fazer upsert do contato (criar se nao existe, atualizar se existe)
5. Criar conversa se nao existir
6. Buscar historico de mensagens (`getChatHistory` com count: 30)
7. Filtrar mensagens dos ultimos 30 dias apenas
8. Limitar a 100 chats para evitar timeout da edge function

Mudancas especificas:
- Remover a chamada `getContacts` (que traz 540+ contatos)
- Usar `getChats` como fonte primaria (apenas conversas ativas)
- Adicionar filtro de 30 dias no historico de mensagens
- Garantir que `sync_status` SEMPRE volta para `synced` ou `error` (com try/finally)
- Adicionar `last_connected_at` ao finalizar sync

### 2. Limpeza de dados antigos (SQL)

- Resetar `sync_status` de "syncing" para "idle" (esta travado)
- Remover contatos sem nome e sem nenhuma conversa associada (lixo da sincronizacao anterior)

### 3. Paginacao no Inbox

**Arquivo:** `src/components/inbox/ConversationList.tsx`

- Adicionar estado de paginacao: `page` e `pageSize` (20 conversas por pagina)
- Mostrar botoes "Anterior" / "Proxima" no rodape da lista
- Exibir contador "Mostrando X-Y de Z conversas"
- A busca e filtros continuam funcionando, mas agora paginados

**Arquivo:** `src/pages/Inbox.tsx`

- Adicionar paginacao na query de conversas usando `.range(from, to)` no Supabase
- Passar `page` e `setPage` para o ConversationList
- Adicionar contagem total de conversas com `count: "exact"`

### 4. Busca avancada no Inbox

**Arquivo:** `src/components/inbox/ConversationList.tsx`

Melhorar a busca existente para incluir:
- Busca por nome do contato
- Busca por numero de telefone
- Busca por tag
- Busca por departamento
- Filtro adicional por status de vendas (`sales_status`)

---

### Detalhes Tecnicos

**`supabase/functions/green-api-sync/index.ts`** - Reescrita completa:

```text
Fluxo novo:
1. getChats -> lista de conversas ativas no WhatsApp
2. Filtrar @c.us, limitar a 100
3. Para cada chat:
   a. getContactInfo -> nome + avatar
   b. Upsert contato no banco
   c. Criar conversa se nao existe
   d. getChatHistory (count: 30)
   e. Filtrar msgs dos ultimos 30 dias
   f. Inserir msgs novas
4. sync_status = "synced" (em finally)
```

**`src/pages/Inbox.tsx`** - Query com paginacao:
- Adicionar estado `page` (default 0)
- Query passa a usar `.range(page * 20, (page + 1) * 20 - 1)` 
- Adicionar `{ count: "exact" }` na query para saber total

**`src/components/inbox/ConversationList.tsx`** - UI de paginacao:
- Props novas: `page`, `onPageChange`, `totalCount`
- Botoes de navegacao no rodape
- Filtros de busca avancada (tags, departamento, status venda)

**Nenhuma mudanca de banco de dados necessaria.**

