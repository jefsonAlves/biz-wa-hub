
## Diagnóstico

O WhatsApp está conectado mas o banco de dados está vazio (0 contatos, 0 conversas). Há 3 problemas a resolver:

**Problema 1 — Bug de autenticação no `green-api-sync`**
A função usa `SUPABASE_PUBLISHABLE_KEY` para validar o usuário, mas esse secret não existe no ambiente da função. O correto é `SUPABASE_ANON_KEY` (mesmo fix já aplicado em `green-api-status`).

**Problema 2 — Sem botão de sincronização na UI**
A página de Configurações não tem um botão para disparar o `green-api-sync` e trazer os contatos/conversas da GREEN-API para o banco de dados.

**Problema 3 — Schedule worker sem cron job**
A função `green-api-schedule-worker` existe, mas nunca é chamada automaticamente. Sem um cron job, mensagens agendadas ficam presas em status `queued` para sempre.

---

## Plano de Implementação

### Passo 1 — Corrigir `green-api-sync/index.ts`
Substituir `SUPABASE_PUBLISHABLE_KEY` por `SUPABASE_ANON_KEY` na validação do usuário (linha 26), idêntico ao fix aplicado nas outras funções.

### Passo 2 — Adicionar botão "Sincronizar Contatos" na Settings
Na aba WhatsApp da página `src/pages/Settings.tsx`, adicionar um Card de sincronização abaixo do card de conexão, com:
- Botão **"Sincronizar Contatos e Conversas"** que chama `green-api-sync`
- Indicador de progresso durante a sincronização
- Exibição do resultado: quantos contatos, conversas e mensagens foram importados
- Estado do sync (`sync_status` da conexão: `idle`, `syncing`, `synced`, `error`)

### Passo 3 — Configurar cron job para o schedule worker
Usando `pg_cron` + `pg_net`, criar um job que chama `green-api-schedule-worker` a cada minuto, para que mensagens agendadas sejam enviadas automaticamente no horário configurado.

---

## Arquivos a modificar

| Arquivo | Mudança |
|---|---|
| `supabase/functions/green-api-sync/index.ts` | Trocar `SUPABASE_PUBLISHABLE_KEY` → `SUPABASE_ANON_KEY` |
| `src/pages/Settings.tsx` | Adicionar Card com botão de sync + status |
| SQL (insert via tool) | Criar cron job para o schedule worker |

---

## Resultado esperado

Após a implementação:
1. Clicar em "Sincronizar" nas Configurações → contatos e conversas aparecem no Inbox
2. Mensagens agendadas via ActionMenu são enviadas automaticamente no horário definido
3. O Inbox mostrará conversas reais do WhatsApp com histórico de mensagens
