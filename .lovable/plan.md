

## Correcao da Sincronizacao e IA Condicionada a Base de Conhecimento

### Problema 1: Sincronizacao falhando
A funcao `green-api-sync` usa `authClient.auth.getClaims(jwtToken)` que nao existe no Supabase JS SDK, causando erro "Failed to send a request to the Edge Function". Alem disso, o arquivo `config.toml` nao tem `verify_jwt = false` para essa funcao, entao o gateway rejeita o request antes mesmo de chegar no codigo.

**Correcao:**
- Adicionar `[functions.green-api-sync] verify_jwt = false` no `config.toml`
- Trocar `getClaims` por `supabase.auth.getUser(jwtToken)` que e o metodo correto do SDK
- Aplicar a mesma correcao para todas as edge functions que usam autenticacao manual

### Problema 2: IA so deve ficar ativa quando houver base de conhecimento
Atualmente o agente IA pode ser ativado livremente pelo toggle. O usuario quer que a IA so funcione quando existir pelo menos 1 item na base de conhecimento (`knowledge_items`).

**Correcao no webhook (`zapi-webhook-received`):**
- Antes de chamar a IA, verificar se existem `knowledge_items` com status "indexed" para o tenant
- Se nao houver nenhum, pular a auto-resposta IA

**Correcao na UI (`Settings.tsx`):**
- O toggle do agente IA so fica habilitado se houver itens na base de conhecimento
- Adicionar query para contar `knowledge_items` do tenant
- Se nao houver itens, mostrar mensagem "Adicione itens a Base de Conhecimento primeiro" com link para `/knowledge`
- No checklist, atualizar o item "Agente IA ativo" para tambem considerar a existencia de knowledge items

---

### Detalhes Tecnicos

**Arquivos modificados:**

1. **`supabase/config.toml`** - Nao pode ser editado manualmente (gerenciado automaticamente). A verificacao JWT sera tratada no codigo.

2. **`supabase/functions/green-api-sync/index.ts`**
   - Substituir bloco de autenticacao:
   ```typescript
   // ANTES (quebrado)
   const { data: claimsData, error: authError } = await authClient.auth.getClaims(jwtToken);
   
   // DEPOIS (correto)
   const { data: { user }, error: authError } = await supabase.auth.getUser(jwtToken);
   ```
   - Remover criacao do `authClient` (usar o `supabase` com service role para `getUser`)
   - Adicionar delays entre requests de historico para evitar rate limiting da GREEN-API

3. **`supabase/functions/zapi-webhook-received/index.ts`**
   - Adicionar verificacao de knowledge_items antes da auto-resposta IA:
   ```typescript
   const { count: knowledgeCount } = await supabase
     .from("knowledge_items")
     .select("id", { count: "exact", head: true })
     .eq("tenant_id", tenantId);
   
   if (!knowledgeCount || knowledgeCount === 0) {
     console.log("No knowledge base - skipping AI response");
     // pular toda a logica de IA
   }
   ```

4. **`src/pages/Settings.tsx`**
   - Adicionar query para contar knowledge_items:
   ```typescript
   const { data: knowledgeCount } = useQuery({
     queryKey: ["knowledge_count", tenantId],
     queryFn: async () => {
       const { count } = await supabase
         .from("knowledge_items")
         .select("id", { count: "exact", head: true })
         .eq("tenant_id", tenantId);
       return count || 0;
     },
     enabled: !!tenantId,
   });
   ```
   - Desabilitar Switch do agente IA quando `knowledgeCount === 0`
   - Mostrar alerta: "Adicione conteudo a Base de Conhecimento para ativar o agente IA"
   - Adicionar botao "Ir para Base de Conhecimento" linkando para `/knowledge`
   - Atualizar checklist: item "Agente IA ativo" so fica verde se `is_active && knowledgeCount > 0`

**Nenhuma mudanca de banco de dados necessaria.**

