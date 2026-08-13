# Plano de Otimização e Sustentabilidade SaaS (Zappro/Whaticket Flow)

Este plano visa adequar a arquitetura atual para ser mais leve, segura e eficiente, removendo redundâncias e preparando a plataforma para rodar com o menor consumo de recursos possível (VPS otimizada), conforme solicitado.

## Diagnóstico Técnico
- **Redundância**: O sistema atual usa n8n para orquestração de WhatsApp. O código fornecido (Zappro/Whaticket) usa `wuzapi` e `baileys` diretamente no Node.js.
- **Eficiência**: No modelo SaaS real, não podemos subir uma instância do n8n para cada tenant. Precisamos de um orquestrador central ou uma integração direta mais leve.
- **Segurança**: As chaves de WhatsApp e segredos de IA devem permanecer estritamente no backend/Edge Functions.

## Fases de Implementação

### Fase 1: Ajuste de Branding e Interface (Imediato)
- Corrigir referências de texto e logos remanescentes para "Chat Zap Flow IA".
- Melhorar a visibilidade de erros de conexão no dashboard.

### Fase 2: Otimização de Backend (Edge Functions)
- **Centralização n8n**: Consolidar a integração n8n para que uma única instância (Global) gerencie todos os webhooks de entrada.
- **Tratamento de Erros**: Melhorar a captura de logs do n8n nas Edge Functions para que o usuário final receba feedbacks claros (ex: "Sessão expirada", "Aparelho desconectado").
- **Limpeza de Outbox**: Implementar política de retenção para as tabelas `event_outbox` e `inbound_events` para evitar crescimento infinito do banco.

### Fase 3: Integração de Funcionalidades Zappro/Whaticket
- **Replicação de UI**: Trazer componentes de "Fluxo de Chatbot" e "Tags de Contato" inspirados no Whaticket para o React moderno.
- **Isolamento RLS**: Garantir que as funcionalidades de "Atendimento por Setores" (Setorização) funcionem via RLS, impedindo que um agente de um setor veja conversas de outro.

### Fase 4: Automação de Provisionamento (Checkout)
- **Webhook Asaas**: Finalizar a Edge Function de recepção do Asaas para ativar automaticamente o tenant e liberar as funcionalidades de IA após o pagamento.

## Detalhes Técnicos (SaaS)
- **Isolamento**: Cada tenant (empresa) terá seu próprio namespace de mensagens e contatos.
- **Economia de Recursos**: Uso intensivo de Edge Functions (Serverless) em vez de processos Node.js pesados rodando 24/7.
- **Escalabilidade**: Filas de processamento no Supabase (pg_cron) garantem que picos de mensagens não derrubem o sistema.

---
**Próximo Passo**: Iniciar a atualização dos metadados e correção de textos de UI para alinhar com o "mínimo recurso necessário".
