# Sincronização Baileys → Inbox

O serviço usa `WHATSAPP_WEBHOOK_URL` quando configurado. Se a variável não existir, `start.mjs` usa automaticamente a Edge Function `whatsapp-baileys-webhook` do projeto Supabase vinculado ao repositório.

Fluxo: WhatsApp → Baileys → `whatsapp-baileys-webhook` → `contacts` / `conversations` / `messages` → Inbox via Supabase Realtime.

O `BACKEND_TOKEN` do Northflank deve continuar igual ao Secret `WHATSAPP_BACKEND_TOKEN` do Supabase.
