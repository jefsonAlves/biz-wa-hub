# Backend Improvement Plan - Modular Integration

The following analysis is based on the `backend-modular.zip` structure provided, focusing on migrating logic to the current Serverless (Edge Functions + n8n) architecture while maintaining the visual appearance (colors and theme).

## 1. Modular Services Analysis
The provided backend uses a service-oriented pattern in Express/Sequelize. Our goal is to map these to Edge Functions and n8n workflows.

### Message Services
- `CreateMessageService`: To be implemented in `n8n` as the primary message router.
- `TranscribeAudioMessageService`: Integration with OpenAI/Groq via Edge Functions.
- `ListMessagesService`: Already handled by Supabase Realtime/REST API.

### WhatsApp & Facebook Services
- `facebookMessageListener`: To be mapped to `meta-webhook-receiver` Edge Function.
- `whatsappMessageListener`: Already handled via `n8n-webhook-receiver`.

### AI & Integration Services
- `OpenAiService` & `QueryDialogflow`: To be unified under the AI Gateway in Edge Functions.

## 2. Technical Mapping
| Original Service | Current Architecture Component |
|------------------|-------------------------------|
| `AuthUserService` | Lovable Cloud Auth (Managed) |
| `CreateMessage` | `process-event-outbox` -> `n8n` |
| `uploadMedia` | Supabase Storage (Private Bucket) |
| `ReportService` | RPCs (`get_department_metrics`) |

## 3. UI/UX Consistency (Colors)
The directive is to "Mantenha as Cores" (Keep the Colors).
- **Theme**: Dark Mode by default.
- **Primary**: Using semantic tokens from `index.css`.
- **Layout**: WhatsApp Web style (Sidebar + Chat).

## 4. Next Steps
1. Refactor `process-event-outbox` to support multi-channel (WhatsApp + Facebook) based on the provided structure.
2. Enhance `n8n` workflows to include "Queue/Setores" logic found in `UserQueueServices`.
3. Implement `PromptServices` logic for AI personas in the Edge Function layer.
