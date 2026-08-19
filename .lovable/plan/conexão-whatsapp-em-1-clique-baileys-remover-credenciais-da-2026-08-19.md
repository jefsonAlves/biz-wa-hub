# Conexão WhatsApp em 1 clique (Baileys) — remover credenciais da tela

Objetivo: o usuário final abre a tela de WhatsApp, clica em "Conectar WhatsApp", lê o QR Code e vê "Conectado". Nada de URL, e-mail, senha ou token na interface. n8n e Docker deixam de aparecer no fluxo principal.

## O que muda na tela

Fluxo novo em `src/pages/Connections.tsx`:

```text
WhatsApp Comercial
Status: Desconectado
[ Conectar WhatsApp ]
        ↓
Escaneie o QR Code  (QR + instruções: WhatsApp > Aparelhos conectados)
        ↓
Status: Conectado · Número: (XX) XXXXX-XXXX
[ Abrir conversas ]   [ Desconectar ]
```

- Remover o card "Backend próprio (Baileys)" com URL / e-mail admin / senha / Bearer token (`src/components/connections/BackendConfigCard.tsx` é excluído).
- Remover o seletor de provedor na criação: "Adicionar WhatsApp" pede apenas o nome e já cria a conexão Baileys.
- Estados visuais únicos: Desconectado, Conectando..., Aguardando leitura do QR Code, Conectado, Erro na conexão.
- Blocos de n8n (diagnóstico, alertas de outbox/túnel) saem da tela do usuário e ficam apenas na área de Super Admin, como automação opcional.
- Autenticação: apenas a sessão do usuário já logado no sistema. Nenhum segundo login.

## Onde ficam URL e token do backend

Um único endereço para toda a plataforma, configurado uma vez por você (não por empresa) e guardado como segredo do servidor — o navegador nunca recebe URL nem token. Vou abrir o formulário seguro para salvar `WHATSAPP_BACKEND_URL` e `WHATSAPP_BACKEND_TOKEN` quando a implementação começar.

A tabela `whatsapp_backends` deixa de ser preenchida pela interface; o proxy passa a usar os segredos, com fallback para a linha existente do tenant (compatibilidade com o que já está salvo).

## Detalhes técnicos

- `whatsapp-backend-proxy`: remover a ação `save_backend`; resolver base URL/token a partir dos segredos; manter `create_connection`, `start_session`, `refresh_status`, `disconnect`, `delete_session`, e passar a retornar também o número conectado.
- Reutilizar os serviços Baileys já existentes no backend Node (rotas de sessão/QR/status). Nenhuma sessão ou listener novo é criado; o proxy só encaminha.
- QR e status: o painel atualiza sozinho por polling curto (2s) enquanto a sessão está em `QRCODE`/`CONNECTING`, mais Realtime do banco quando o webhook do backend grava a mudança. Socket.IO direto do navegador não é usado porque o token do backend não pode ir para o cliente.
- Envio/recebimento continuam pelo backend Baileys (`whatsapp-send-message` já roteia por provedor); n8n só recebe espelho de eventos quando estiver configurado.
- `src/lib/whatsapp/backend.ts`: remover `saveBackendConfig`/`getBackendConfig`/`testBackendConfig` da superfície usada pela tela do usuário.

## Critério de validação

Com n8n desligado e sem preencher nenhum campo de URL/login/token: clicar em "Conectar WhatsApp" → QR aparece → escanear → status "Conectado" → mensagem recebida aparece no Inbox → resposta enviada pelo painel chega no WhatsApp.

## O que preciso de você

A URL pública HTTPS do backend Node com Baileys (e o token de API interno, se ele exigir) — pedirei pelo formulário seguro logo após a aprovação.
