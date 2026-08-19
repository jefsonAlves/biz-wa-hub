# Conexão WhatsApp via Backend Próprio (Baileys) — n8n e Docker como complemento

Objetivo: permitir conectar o WhatsApp, ver o QR Code, receber e responder mensagens **sem n8n e sem Docker**. O n8n passa a ser opcional, usado apenas para automações extras.

## Como vai funcionar

O Baileys precisa de um processo Node persistente, que o app Lovable não hospeda. Por isso o app passa a falar direto com o backend Node/TypeScript que você já tem (o dos arquivos enviados), pelas rotas `whatsappRoutes` / `WhatsAppSessionController`.

```text
Frontend  ->  Edge Function (proxy seguro)  ->  Backend Baileys  ->  WhatsApp
Backend Baileys  ->  Edge Function (webhook)  ->  Banco  ->  Inbox em tempo real
n8n (opcional)   ->  apenas automações/IA
```

Nenhum segredo do backend fica no navegador: URL e token ficam guardados no banco/segredos e só as Edge Functions os usam.

## Fase 1 — Cadastro do backend por empresa

- Nova tabela `whatsapp_backends`: `tenant_id`, `name`, `base_url`, `api_token` (criptografado), `status`, `last_check_at`, com RLS por tenant + acesso do Super Admin, e GRANTs.
- Novo tipo de provedor `baileys_backend` em `whatsapp_connections` (n8n continua existindo).
- Tela de Configurações/Conexões: campo "URL do backend WhatsApp" + token, botão "Testar backend" (ping em `/version` ou `/whatsapp`).

## Fase 2 — Conexão e QR Code sem n8n

- Nova Edge Function `whatsapp-backend-proxy` (autenticada, valida tenant e RBAC) com ações:
  - `create` → cria/registra a sessão no backend
  - `start` / `qrcode` → dispara sessão e devolve o QR (base64) para exibir na hora
  - `status`, `disconnect`, `delete`
- `src/lib/whatsapp/provider.ts` ganha um adapter: se a conexão for `baileys_backend`, chama o proxy; se for `n8n_unofficial`, mantém o fluxo de outbox atual; Meta segue como está.
- Página de Conexões: seletor de provedor ao criar a conexão (Backend próprio | n8n | Meta) e polling curto do QR/status enquanto pendente. Cores e layout atuais preservados.

## Fase 3 — Receber e enviar mensagens

- Nova Edge Function `whatsapp-backend-webhook` (HMAC SHA-256, mesma convenção já usada): recebe `message.received`, `message.ack`, `connection.update`, grava contato/conversa/mensagem com deduplicação e salva mídia no Storage.
- Envio: `whatsapp-send-message` passa a rotear por provedor — `baileys_backend` faz POST direto no backend (`/messages`), sem enfileirar no outbox.
- Inbox continua em tempo real pelo Realtime do banco, sem mudanças visuais.

## Fase 4 — n8n como complemento e diagnóstico

- Remover a obrigatoriedade de integração n8n: sem n8n configurado, conexões `baileys_backend` funcionam normalmente e nenhum alerta bloqueia a UI.
- Diagnóstico passa a mostrar duas seções independentes: "Backend WhatsApp" (alcance, versão, sessão) e "n8n (opcional)".
- Eventos continuam sendo espelhados para o n8n quando ele existir, para automações/IA.

## Detalhes técnicos

- Token do backend criptografado; nunca retornado ao frontend (apenas `has_credentials`).
- Todo acesso do proxy valida `tenant_id` da conexão + permissão do usuário; Super Admin pode operar qualquer tenant.
- Migrations SQL versionadas por fase, com RLS e GRANTs em toda tabela nova.
- Docker deixa de ser requisito: é apenas uma opção de deploy do seu backend.

## Critério de validação

Com n8n desligado: criar conexão → "Conectar WhatsApp" → QR aparece → escanear → status "Conectado" → mensagem recebida aparece no Inbox → responder pelo painel chega no WhatsApp.

## O que preciso de você (após aprovar)

A URL pública HTTPS do seu backend e um token de API — vou pedir pelo formulário seguro na hora certa.
