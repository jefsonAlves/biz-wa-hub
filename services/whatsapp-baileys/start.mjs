const DEFAULT_WEBHOOK_URL = "https://uyaapytraftbnfwhxajr.supabase.co/functions/v1/whatsapp-baileys-webhook";

if (!process.env.WHATSAPP_WEBHOOK_URL) {
  process.env.WHATSAPP_WEBHOOK_URL = DEFAULT_WEBHOOK_URL;
}

await import("./server.mjs");
