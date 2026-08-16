# Plano de Correção e Estabilização da Integração n8n/WhatsApp

Este plano visa resolver as falhas de comunicação entre a plataforma e o n8n, melhorando o diagnóstico de erros (evitando `[object Object]`), garantindo a entrega confiável de mensagens via fila (outbox) e corrigindo o fluxo de geração de QR Code.

## Diagnóstico Técnico
- **Erro DNS/Cloudflare**: A URL `trycloudflare.com` expira frequentemente, causando falhas silenciosas ou erros genéricos 500.
- **Outbox Stalling**: Eventos ficam presos na fila quando o n8n está inacessível, e a interface não fornece feedback claro sobre o estado da fila.
- **Serialização de Erros**: A Edge Function `n8n-test-connection` não está tratando corretamente a captura de erros, resultando em objetos não serializados na resposta.
- **Fluxo de Comandos**: Alguns comandos esperam execução síncrona, o que falha quando há latência ou túneis lentos.

## Ações Propostas

### 1. Edge Function: `n8n-test-connection`
- **Melhoria do Erro**: Adicionar bloco `try/catch` robusto para capturar e serializar erros específicos (DNS, HTTP, Auth, DB).
- **Feedback de Túnel**: Identificar erros `dns error: failed to lookup address` e sugerir explicitamente a renovação do túnel trycloudflare.
- **Segurança**: Garantir que segredos e URLs completas nunca sejam expostos.

### 2. Edge Function: `n8n-webhook-receiver`
- **Registro de Eventos**: Garantir que todo evento recebido seja registrado na tabela `inbound_events` para auditoria.
- **Status da Conexão**: Mapear corretamente `whatsapp.connection.qr.generated` para atualizar o campo `qr_code` e o status na tabela `whatsapp_connections`.
- **Deduplicação**: Refinar a lógica de idempotência para evitar processamento duplicado de mensagens.

### 3. Edge Function: `whatsapp-connection-command`
- **Serverless Priority**: Transformar comandos em eventos assíncronos na `event_outbox`. Responder `202 Accepted` imediatamente.
- **Segurança de Desconexão**: Exigir `confirm_disconnect=true` para comandos de logout, evitando desconexões acidentais.
- **Tipagem de Eventos**: Mapear `sync_messages` para `whatsapp.messages.sync.request`.

### 4. Edge Function: `process-event-outbox`
- **Resiliência**: Melhorar a lógica de retentativa (backoff) e marcação de eventos "mortos" (dead).
- **Visibilidade**: Atualizar `connection_error` na tabela de conexões quando houver falha na entrega ao n8n, para que o usuário veja o erro no painel.

### 5. Frontend (UI)
- **Diagnóstico Claro**: Se o teste de conexão falhar com erro de DNS, mostrar o alerta: "URL pública do n8n expirada ou inacessível. Gere novo túnel e salve novamente."
- **Feedback de QR Code**: Se o QR Code demorar, mostrar o último erro registrado na fila de saída em vez de um spinner infinito.
- **Fluxo Pós-Conexão**: Fechar automaticamente o modal e redirecionar para o Inbox após a conexão ser bem-sucedida.

## Detalhes Técnicos
- Nenhuma alteração de schema (tabelas) é necessária.
- Uso estrito de `service_role` nas Edge Functions para bypass de RLS administrativo.
- Manutenção dos caminhos de webhook: `/webhook/biz-wa-hub/platform`.
- Manutenção da assinatura HMAC SHA-256.

## Critérios de Sucesso
1. O botão "Diagnosticar n8n" reporta erros legíveis (não `[object Object]`).
2. O QR Code gerado pelo n8n aparece no frontend em até 10 segundos após a solicitação (se o túnel estiver ok).
3. Mensagens de erro de conexão são exibidas diretamente no card do WhatsApp.
4. Conexões conectadas não são perdidas sem ação explícita do usuário.
