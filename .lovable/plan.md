

## Correcao da Sincronizacao de Contatos e Melhorias no Inbox

### Problemas Identificados

1. **Contatos sem nomes**: 540 contatos importados, mas apenas 52 tem nome. A API `getContacts` do GREEN-API nao retorna nomes para todos os contatos. Precisa usar `getContactInfo` para buscar nome e avatar individualmente.

2. **Grupos importados indevidamente**: 3 contatos com `@g.us` (grupos) foram importados e nao deveriam estar na lista.

3. **sync_status travado em "syncing"**: O status nunca voltou para "synced", possivelmente por timeout da edge function ao processar 540+ contatos.

4. **Conversas mostram apenas numeros**: O Inbox nao mostra nomes porque os contatos nao tem `name` preenchido.

5. **Falta de avatar/imagem**: A tabela `contacts` tem campo `avatar_url` mas o sync nunca preenche.

6. **Conversas inativas dominam a lista**: Todas as conversas tem `status: open` mesmo sem mensagens recentes.

---

### Plano de Correcao

#### 1. Reescrever `supabase/functions/green-api-sync/index.ts`

Mudancas principais:

- **Filtrar grupos**: Remover contatos com `@g.us` ja existentes no banco e impedir novos
- **Buscar nomes com `getContactInfo`**: Para cada contato sem nome, chamar `POST /waInstance{id}/getContactInfo/{token}` com `{ chatId: "phone@c.us" }` para obter `name`, `contactName` e `avatar`
- **Buscar avatar com `getContactInfo`**: O endpoint retorna campo `avatar` com URL da foto do perfil
- **Limitar contatos processados**: Processar apenas contatos que tem chats recentes (priorizar os ultimos 100 contatos com atividade)
- **Otimizar com batch processing**: Adicionar delay de 300ms entre chamadas `getContactInfo` para evitar rate limiting
- **Atualizar sync_status corretamente**: Garantir que muda para "synced" ou "error" no final
- **Criar conversas apenas para contatos com historico**: Nao criar conversa para contatos que nunca trocaram mensagens

Fluxo revisado:
```text
1. Fetch getContacts -> lista de todos os contatos
2. Filtrar apenas @c.us (ignorar grupos @g.us)
3. Para cada contato SEM nome:
   - Chamar getContactInfo para obter name + avatar
   - Delay 300ms entre chamadas
4. Upsert contatos no banco (com nome e avatar)
5. Fetch historico de mensagens (getChatHistory) 
   - Apenas para contatos com atividade recente
6. Criar conversas apenas para quem tem mensagens
7. Atualizar sync_status = "synced"
```

#### 2. Limpar dados incorretos (migracao SQL)

- Remover contatos que sao grupos (`wa_chat_id LIKE '%@g.us'`)
- Remover conversas orfas (sem contato valido)

#### 3. Melhorar o ConversationList (`src/components/inbox/ConversationList.tsx`)

- Mostrar avatar do contato quando disponivel (usar `avatar_url` da tabela contacts)
- Fallback para iniciais do nome/numero quando sem avatar

#### 4. Melhorar o Inbox Header (`src/pages/Inbox.tsx`)

- Mostrar avatar do contato no cabecalho da conversa quando disponivel

#### 5. Atualizar webhook para salvar avatar (`supabase/functions/zapi-webhook-received/index.ts`)

- Quando receber mensagem de novo contato, buscar avatar via `getContactInfo` e salvar

---

### Detalhes Tecnicos

**Arquivos modificados:**

1. `supabase/functions/green-api-sync/index.ts` - Reescrever logica de sync com getContactInfo para nomes e avatares
2. `src/components/inbox/ConversationList.tsx` - Adicionar exibicao de avatar do contato
3. `src/pages/Inbox.tsx` - Mostrar avatar no header do chat
4. `supabase/functions/zapi-webhook-received/index.ts` - Buscar avatar ao receber msg de novo contato

**Migracao SQL:**
- Deletar contatos de grupo (`wa_chat_id LIKE '%@g.us'`) e conversas/mensagens associadas
- Atualizar `sync_status` de "syncing" para "idle" para desbloquear

**API GREEN-API utilizada:**
- `POST /waInstance{id}/getContactInfo/{token}` - body: `{ chatId: "phone@c.us" }` - retorna `name`, `contactName`, `avatar`

**Nenhuma nova tabela ou coluna necessaria** - o campo `avatar_url` ja existe na tabela `contacts`.

