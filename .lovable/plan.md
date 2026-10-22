# WhatsApp em tempo real (adaptado a este projeto)

O documento enviado foi escrito para outro sistema (NAVRY). Aqui as mesmas ideias são aplicadas às tabelas deste projeto: contatos, conversas e mensagens.

## O que já foi verificado
- Contatos, conversas e mensagens já estão ligados ao tempo real.
- Existem 33 mensagens duplicadas (mesmo ID do WhatsApp gravado mais de uma vez).
- Os índices principais já existem; falta um índice por conexão de WhatsApp nas conversas.

## O que será feito

### 1. Banco de dados (sem apagar nada útil)
- Remover só as cópias repetidas das 33 mensagens duplicadas, mantendo a mais antiga.
- Depois disso, impedir que a mesma mensagem entre duas vezes (webhook, histórico ou reconexão).
- Criar índices que faltam: conversas por conexão + contato, e por tenant + data de atualização.
- Configurar o tempo real para enviar a linha completa nas atualizações (nome, foto, não lidas, status).
- Conferir as regras de acesso: cada usuário recebe ao vivo só o que já pode ver no painel. Nada de "liberar tudo".

### 2. Receptor de mensagens do WhatsApp
- Aceitar também os formatos de evento: histórico (`history.sync` / `messaging-history.set`), atualização de contatos, atualização de grupos e presença.
- Mídias: áudio, imagem, vídeo, documento e figurinha passam a ser gravados com o tipo certo.
- Grupos: nome sempre pelo "assunto" do grupo, nunca pelo nome de quem enviou.
- Fotos: gravar automaticamente quando vier; nunca apagar uma foto válida quando o WhatsApp não devolver nenhuma.
- Histórico: criar conversas privadas a partir das próprias mensagens, sem limite de 300.
- Duplicadas são ignoradas silenciosamente.

### 3. Caixa de entrada
- Tempo real continua como principal; adicionar atualização de segurança a cada 3s (lista) e 2s (conversa aberta).
- Botões manuais ficam apenas como emergência.

### 4. Testes
- Enviar uma mensagem de teste ao receptor e confirmar contato, conversa e mensagem criados, sem duplicar no reenvio.

## Detalhes técnicos
- Migração: deduplicar `messages` por `wa_message_id`, depois índice único parcial `(wa_message_id) WHERE wa_message_id IS NOT NULL`; `REPLICA IDENTITY FULL` em conversations/contacts; índices `conversations(whatsapp_connection_id, contact_id)` e `conversations(tenant_id, updated_at desc)`.
- Webhook `whatsapp-baileys-webhook`: tratar conflito 23505 como duplicado; normalizar payload de histórico em lote; `avatar_url` só atualiza quando não nulo.
- `Inbox.tsx` / `ConversationList.tsx`: `refetchInterval` 3000/2000 como fallback.

## Atenção
- Vou supor que contato pode ter foto em `contacts.avatar_url`.
- O serviço Baileys no Northflank precisa estar com o código mais novo para enviar esses eventos — isso eu não consigo fazer daqui.
