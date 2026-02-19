
## Problema Diagnosticado

### Causa Raiz do Erro "Sem tenant"
Os triggers `on_auth_user_created` e `on_auth_user_created_tenant` **nunca foram criados** no banco — as funções existem mas não estão vinculadas à tabela `auth.users`. O resultado: o usuário `jefson.ti@gmail.com` existe em `auth.users` mas não tem nenhuma linha em `profiles`, `tenants` ou `user_roles`.

### O que está faltando visualmente (imagem de referência)
A imagem mostra o menu lateral com: Dashboard, Inbox, Agentes IA, Base de Conhecimento, Departamentos, Equipe, Relatórios, Configurações. Estas rotas já existem no código, mas o usuário não consegue acessar porque o `profile` está nulo (sem tenant_id), então o `useAuth` não consegue determinar os roles e o menu não renderiza corretamente.

---

## Plano de Correção

### 1. Nova Migration: Corrigir Triggers + Backfill do usuário existente

A migration vai:

**a) Recriar os triggers na tabela `auth.users`:**
```sql
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

DROP TRIGGER IF EXISTS on_auth_user_created_tenant ON auth.users;
CREATE TRIGGER on_auth_user_created_tenant
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user_tenant();
```

**b) Backfill do usuário `jefson.ti@gmail.com` (id: `888b8e33-7a27-4d5f-8ba9-6725c15f247f`):**
- Criar tenant com nome "Workspace de jefson de Souza Alves"
- Criar profile com tenant_id vinculado
- Inserir role `tenant_admin` em `user_roles`
- Criar business_hours padrão para o tenant

Tudo idempotente (com verificações `IF NOT EXISTS`/`ON CONFLICT DO NOTHING`).

### 2. Ajustes Defensivos no `useAuth.tsx`

Adicionar retry: se após `fetchProfile` o `tenant_id` vier `null`, aguardar 1s e tentar novamente (cobre race condition do trigger em novos cadastros).

### 3. Ajuste Defensivo no `Settings.tsx`

Em vez de lançar erro imediato quando `tenantId` é null, mostrar um estado de "carregando perfil..." com retry automático.

### 4. Verificar e garantir que `handle_new_user_tenant` cria `tenant_admin`

A função atual pode não estar atribuindo corretamente o role. Vamos garantir que ela:
- Cria o tenant
- Atualiza o profile com o tenant_id
- Insere `tenant_admin` em `user_roles`

---

## Arquivos a Modificar

**Nova migration** — fix triggers + backfill:
- Recria os dois triggers em `auth.users`
- Backfilla o usuário existente com tenant + profile + role + business_hours

**`src/hooks/useAuth.tsx`** — retry defensivo:
- Se `profile` veio sem `tenant_id`, fazer nova tentativa após 1.5s

**`src/pages/Settings.tsx`** — estado defensivo:
- Mostrar "Aguardando perfil..." em vez de lançar erro quando `tenantId` é null

---

## Resultado Esperado

Após a correção:
1. Login com `jefson.ti@gmail.com` funcionará normalmente
2. O menu lateral mostrará Dashboard, Inbox, Agentes IA, Base de Conhecimento, Departamentos, Equipe, Relatórios, Configurações (igual à imagem)
3. A página Configurações não jogará mais o erro "Sem tenant"
4. Novos cadastros criarão automaticamente o tenant e o perfil via trigger
5. As funcionalidades de IA (Agentes IA, Base de Conhecimento) estarão acessíveis
