# Biz WA Hub - System Health Check

- Finalidade: expor o estado sanitizado da automação local.
- Webhook: `GET /webhook/biz-wa-hub/health`.
- Entrada: nenhuma.
- Saída: disponibilidade do n8n e presença das configurações Supabase/Ollama, sem valores secretos.
- Credenciais: nenhuma.
- Variáveis: `SUPABASE_URL`, `OLLAMA_BASE_URL`, `EXECUTIONS_MODE`.
- Dependências: n8n.
- Teste: `curl http://localhost:5678/webhook/biz-wa-hub/health` após publicar o workflow.
