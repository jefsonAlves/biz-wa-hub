# Correção: conexão criada não aparece / QR Code não gera

## Diagnóstico (confirmado)

A conexão **é criada com sucesso** no backend (a função `whatsapp-connection-command` retornou `success: true` com o id da nova conexão). O problema está na **leitura da lista**: toda chamada de `get_whatsapp_connections_safe` falha com erro 400:

```text
42804: Returned type provider_type does not match expected type text in column 5
```

A coluna `provider_type` (e provavelmente `status`) da tabela de conexões é um tipo enumerado, mas a função declara essas colunas como `text` e as retorna sem conversão. Resultado: a tela nunca lista a conexão criada, então não há como abrir o pareamento e gerar o QR Code.

## Correção

### Migration nova
Recriar `public.get_whatsapp_connections_safe(_tenant_id uuid DEFAULT NULL)` com conversão explícita para texto nas colunas de tipo enumerado:

- `wc.provider_type::text`
- `wc.status::text`
- demais colunas e regras de acesso permanecem exatamente como hoje (Super Admin pode filtrar por empresa; usuário comum vê só o próprio tenant; credenciais continuam mascaradas, QR exposto apenas via `metadata`).
- manter `SECURITY DEFINER`, `SET search_path = public`, `ORDER BY created_at DESC` e os `GRANT EXECUTE` atuais para `authenticated`.

### Verificação
- Executar a RPC como consulta de teste e confirmar retorno sem erro 42804.
- Na tela de Conexões WhatsApp, confirmar que a conexão recém-criada (`62982094069`) aparece na lista e que o botão de gerar QR Code fica disponível.

## Observações
Nenhuma alteração de frontend é necessária — `src/pages/Connections.tsx` e `src/lib/whatsapp/provider.ts` já enviam e invalidam o `tenant_id` corretamente. O erro é exclusivamente na tipagem da função do banco.
