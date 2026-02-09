
# Correcao dos Campos Z-API e QR Code

## Problema Identificado

Os logs mostram dois problemas claros:

1. **O usuario esta colando a URL completa** no campo Instance ID:
   `https://api.z-api.io/instances/3EE79997AC1371EE03F0A6D7BDC71B5D/token/6AD8C50695CCEFB54D3343F8/send-text`
   Em vez de apenas `3EE79997AC1371EE03F0A6D7BDC71B5D`

2. **O Client-Token (API da Instancia) nao esta sendo enviado** -- a Z-API retorna:
   `"your client-token is not configured"`
   O campo esta marcado como "opcional" mas e OBRIGATORIO.

3. **Os nomes dos campos nao correspondem** ao painel da Z-API, causando confusao.

---

## Solucao

### 1. Renomear os campos no formulario para corresponder a Z-API

Os campos no painel Z-API sao:
- **API da Instancia** -- o que chamamos de "Client Token" (header `Client-Token`) -- OBRIGATORIO
- **ID da Instancia** -- o Instance ID na URL
- **Token da Instancia** -- o Token na URL

Vamos renomear os campos no `Settings.tsx` para usar esses nomes exatos.

### 2. Auto-extrair valores da URL colada

Se o usuario colar a URL completa em qualquer campo, o sistema vai automaticamente extrair o Instance ID e o Token da URL e preencher os campos corretos.

Regex de extracao: `https://api.z-api.io/instances/([A-F0-9]+)/token/([A-Za-z0-9]+)`

### 3. Tornar "API da Instancia" obrigatorio

Remover o texto "(opcional)" e adicionar validacao para que os 3 campos sejam obrigatorios.

### 4. Corrigir `zapi-test` para limpar o instance_id

Adicionar a mesma logica de limpeza de URL que ja existe no `zapi-qrcode`.

### 5. Corrigir todas as edge functions

Aplicar limpeza de instance_id consistente em `zapi-test`, `zapi-send`, `zapi-register-webhooks`.

---

## Arquivos a Modificar

- `src/pages/Settings.tsx` -- Renomear labels, auto-extracao de URL, campo obrigatorio
- `supabase/functions/zapi-test/index.ts` -- Adicionar limpeza de instance_id
- `supabase/functions/zapi-send/index.ts` -- Adicionar limpeza de instance_id
- `supabase/functions/zapi-register-webhooks/index.ts` -- Adicionar limpeza de instance_id
- `supabase/functions/zapi-qrcode/index.ts` -- Ja tem limpeza, manter

## Resultado Esperado

- Os campos vao corresponder exatamente ao painel Z-API
- Se o usuario colar a URL, o sistema extrai automaticamente os valores
- Todos os 3 campos sao obrigatorios
- O QR Code sera gerado corretamente com o Client-Token no header
