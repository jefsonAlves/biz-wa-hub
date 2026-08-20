# Serviço WhatsApp Baileys

Este diretório contém o processo Node.js persistente que gera o QR Code e mantém as sessões do WhatsApp.

**Não usa n8n. Docker não é obrigatório.**

## Requisitos

- Node.js 20+
- um servidor/processo que permaneça ligado
- um diretório persistente para `WHATSAPP_DATA_DIR`

## Executar sem Docker

```bash
cd services/whatsapp-baileys
npm install
cp .env.example .env
npm start
```

Teste:

```bash
curl http://localhost:3001/health
```

Resposta esperada:

```json
{"ok":true,"service":"biz-wa-hub-baileys"}
```

## Produção

Publique este diretório em qualquer ambiente que execute Node.js continuamente, por exemplo VPS com PM2, Railway, Render ou similar.

Exemplo com PM2:

```bash
npm install -g pm2
cd services/whatsapp-baileys
npm install
pm2 start server.mjs --name biz-wa-hub-baileys
pm2 save
```

Depois exponha o serviço por HTTPS, por exemplo:

```text
https://whatsapp.seudominio.com.br
```

## Ligar o Supabase ao serviço

Nas secrets das Edge Functions configure:

```text
WHATSAPP_BACKEND_URL=https://whatsapp.seudominio.com.br
```

Se definir `BACKEND_TOKEN` no serviço Node, defina exatamente o mesmo valor no Supabase:

```text
WHATSAPP_BACKEND_TOKEN=seu-token-forte
```

O usuário final não preenche esses valores. São configurações da infraestrutura da plataforma.

## Fluxo

```text
Lovable / Frontend
        |
        v
Supabase Edge Function
        |
        v
serviço Node.js deste diretório
        |
        v
Baileys
        |
        v
WhatsApp
```

O n8n fica fora desse fluxo e pode ser usado somente para automações opcionais.

## Rotas implementadas

- `GET /health`
- `POST /whatsapp/` — cria uma sessão
- `POST /whatsappsession/:id` — inicia sessão / gera QR
- `GET /whatsapp/:id` — status e QR
- `DELETE /whatsappsession/:id` — desconecta
- `DELETE /whatsapp/:id` — remove sessão
- `POST /api/send` — envia mensagem pela sessão indicada em `sessionId`

## Persistência

As credenciais ficam em `WHATSAPP_DATA_DIR`. Em produção, esse diretório deve estar em disco persistente para que o WhatsApp continue conectado depois de reiniciar o processo.
