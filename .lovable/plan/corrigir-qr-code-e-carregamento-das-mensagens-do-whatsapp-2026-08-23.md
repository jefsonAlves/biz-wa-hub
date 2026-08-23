# Corrigir QR Code e carregamento das mensagens do WhatsApp

## O que eu verifiquei agora

- O serviço Baileys está **online**: `GET /health` responde `200` com `{"ok":true,"sessions":5,"messageSync":true}`.
- Os endpoints protegidos (`/health/secure`, `/whatsapp/:id`) respondem `401 unauthorized` sem token — comportamento esperado.
- O código do serviço **nunca retorna 503**. Logo, o `backend_status: 503` do erro veio da camada de rede/roteador do serviço (instância reiniciando / cold start), ou seja: uma indisponibilidade **temporária**.
- Hoje o proxy transforma qualquer 5xx do backend em `502` para o frontend, o que estoura como erro fatal da Edge Function e leva à tela branca.
- Causa provável de "não carrega mensagens": o serviço Baileys envia os eventos para a Edge Function de **outro projeto de backend**. O fallback em `services/whatsapp-baileys/start.mjs` e o `project_id` em `supabase/config.toml` apontam para um projeto antigo (`uyaapytraftbnfwhxajr`), enquanto o backend atual deste app é outro. Com isso, `contacts` / `conversations` / `messages` nunca recebem os dados.
- Existe apenas 1 conexão cadastrada, com `status: disconnected` e `qr_status: requested` — nunca completou o pareamento.

## O que será feito

### 1. Nunca mais tela branca por indisponibilidade temporária
No `whatsapp-backend-proxy`:
- `refresh_status` passa a devolver **HTTP 200** com `success: false`, `retryable: true` e o status atual conhecido quando o backend responde 5xx (502/503/504) ou dá timeout, em vez de 502.
- Mensagem amigável: "O serviço do WhatsApp está reiniciando. Tentando novamente…".
- `start_session` faz **retry automático** (até 3 tentativas com espera curta) quando recebe 5xx, antes de reportar falha.

### 2. Frontend resiliente e QR Code confiável (`src/pages/Connections.tsx`)
- Respostas `retryable` não mostram erro destrutivo: exibem aviso "reconectando" e reagendam o polling (backoff 3s → 10s).
- Enquanto `qr_status = requested` sem QR, continua o polling até o QR aparecer ou expirar, com botão "Gerar novo QR Code".
- Nenhum estado de erro derruba a tela (sem blank screen).

### 3. Corrigir o destino dos eventos do WhatsApp (mensagens no Inbox)
- Ajustar o fallback de `WHATSAPP_WEBHOOK_URL` em `services/whatsapp-baileys/start.mjs` para a URL da função `whatsapp-baileys-webhook` **deste** backend, e alinhar `project_id` em `supabase/config.toml`.
- Redeploy de `whatsapp-baileys-webhook`, `whatsapp-backend-proxy` e `whatsapp-send-message`.
- Validar com uma mensagem real: conferir criação em `contacts`, `conversations`, `messages` e a chegada no Inbox via Realtime.

### 4. Reduzir ruído que atrapalha o diagnóstico
Os jobs `n8n-poll-events` e `n8n-webhook-receiver` estão falhando com `500` continuamente nos logs. Vou investigar e, como o WhatsApp não usa mais n8n, desativar/silenciar esses jobs para os logs voltarem a ser úteis.

## Detalhes técnicos

- Arquivos: `supabase/functions/whatsapp-backend-proxy/index.ts`, `supabase/functions/_shared/whatsapp-backend.ts` (helper de retry/classificação de erro), `src/pages/Connections.tsx`, `services/whatsapp-baileys/start.mjs`, `supabase/config.toml`.
- Nenhuma mudança de arquitetura: fluxo continua WhatsApp → Baileys → `whatsapp-baileys-webhook` → banco → Inbox em Realtime.
- Isolamento por tenant e autenticação JWT preservados.

## Ponto de atenção

O `start.mjs` deste repositório só vale se o serviço no Northflank for redeployado a partir dele. Se o serviço lá tiver `WHATSAPP_WEBHOOK_URL` configurada manualmente apontando para o projeto antigo, essa variável precisa ser atualizada no painel do Northflank — eu não tenho acesso a ele.
