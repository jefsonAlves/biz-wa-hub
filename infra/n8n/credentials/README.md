# Credenciais do n8n

Este diretório contém apenas documentação. Nenhuma credencial exportada deve ser salva aqui.

- Crie credenciais pelo painel do n8n para Supabase, OpenAI e Gemini.
- Use `SUPABASE_SERVICE_ROLE_KEY` somente em operações administrativas internas.
- Nunca inclua chaves, tokens ou o segredo HMAC em workflows JSON, payloads ou logs.
- `N8N_API_KEY` é opcional e exclusiva para administração da instância; webhooks usam HMAC.
- Faça backup do volume `n8n_data` junto com o PostgreSQL: as credenciais são cifradas com `N8N_ENCRYPTION_KEY`.
- A rotação de `N8N_ENCRYPTION_KEY` exige procedimento oficial de exportação/recriptografia; não troque diretamente em produção.
