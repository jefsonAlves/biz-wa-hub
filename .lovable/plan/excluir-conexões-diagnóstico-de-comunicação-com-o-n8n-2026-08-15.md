# Excluir conexões + Diagnóstico de comunicação com o n8n

Duas novas capacidades na tela **Conexões de WhatsApp**: apagar conexões criadas por engano e verificar, antes de gerar o QR Code, se a comunicação com o n8n está realmente funcionando.

## 1. Excluir conexão

- Botão de excluir (ícone de lixeira) em cada cartão de conexão, com diálogo de confirmação mostrando o nome do número.
- A exclusão passa pela Edge Function `whatsapp-connection-command` num novo comando `delete_connection` (mesmo caminho seguro já usado na criação):
  - Super Admin pode excluir conexões de qualquer empresa; usuário comum apenas da própria empresa.
  - Antes de excluir, desvincula as conversas ligadas ao número (`conversations.whatsapp_connection_id` passa a nulo) e remove vínculos de setor/acesso, para o histórico do Inbox não ser perdido.
  - Se a conexão estiver conectada, exige confirmação explícita e enfileira o `disconnect` antes de remover.
- Após excluir, a lista é atualizada e um aviso de sucesso é exibido.

## 2. Diagnóstico de comunicação com o n8n

Novo botão **"Diagnosticar n8n"** no topo da tela, abrindo um painel com o resultado de cada checagem:

| Checagem | O que mostra |
| --- | --- |
| Integração ativa | Se existe integração n8n habilitada para a empresa selecionada (global ou específica) |
| Segredo HMAC | Se o segredo de assinatura está configurado no servidor |
| Alcance do webhook | Resultado real da chamada de teste ao n8n: código HTTP, tempo de resposta e erro (URL sempre mascarada) |
| Fila de eventos | Quantos eventos estão pendentes/falhos na fila de saída da empresa |
| Última entrega | Data, status e mensagem da última tentativa de entrega ao n8n |
| Retorno do n8n | Data do último evento recebido do n8n (callback assinado) |

Cada item aparece como verde (ok), amarelo (atenção) ou vermelho (falha), com uma frase de orientação em português. Se o diagnóstico falhar no alcance do webhook, o painel avisa que o QR Code não será gerado até o n8n responder.

Além disso, no cartão de cada conexão, o botão de gerar QR Code passa a exibir um alerta claro quando o comando é apenas enfileirado por falta de integração ativa (hoje isso aparece só como aviso genérico).

## Detalhes técnicos

- **Edge Function `whatsapp-connection-command`**: novo comando `delete_connection` com validação de permissão via `authenticate()` (`isSuperAdmin` / `tenantId`), limpeza de referências e `delete` pelo cliente de serviço. Retorna erros descritivos (`details`) como já feito na criação.
- **Edge Function `n8n-test-connection`**: passa a aceitar `tenant_id` opcional (respeitado só para Super Admin) e a retornar um objeto de diagnóstico completo: `integration` (existe/ativa/escopo), `secret_configured`, `webhook` (`http_status`, `duration_ms`, `error`, `target` mascarado), `outbox` (pendentes/falhos), `last_delivery`, `last_inbound_event`. Nenhum segredo ou URL completa é retornado.
- **`src/lib/whatsapp/provider.ts`**: `deleteConnection(connectionId, { confirm })` e `diagnoseN8n(tenantId?)` tipados; `testN8nIntegration` é substituído/estendido pelo diagnóstico.
- **`src/pages/Connections.tsx`**: novo `useMutation` de exclusão invalidando `["whatsapp_connections_safe", effectiveTenantId]`; diálogo de confirmação; novo diálogo de diagnóstico usando os componentes shadcn já presentes (Dialog, Badge, Card) e tokens semânticos de cor.
- Redeploy de `whatsapp-connection-command` e `n8n-test-connection`.
