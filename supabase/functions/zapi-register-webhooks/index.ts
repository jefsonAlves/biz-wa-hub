import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const GREEN_API_URL = "https://api.green-api.com";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { instance_id, token, webhook_base_url } = await req.json();
    console.log("Registering GREEN-API webhooks for instance:", instance_id);

    if (!instance_id || !token || !webhook_base_url) {
      return new Response(JSON.stringify({ error: "idInstance, apiTokenInstance e webhook_base_url são obrigatórios" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const url = `${GREEN_API_URL}/waInstance${instance_id}/setSettings/${token}`;

    const response = await fetch(url, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        webhookUrl: `${webhook_base_url}/functions/v1/zapi-webhook-received`,
        webhookUrlToken: "",
        delaySendMessagesMilliseconds: 1000,
        markIncomingMessagesReaded: "no",
        outgoingWebhook: "yes",
        outgoingMessageWebhook: "yes",
        outgoingAPIMessageWebhook: "no",
        incomingWebhook: "yes",
        deviceWebhook: "no",
        statusInstanceWebhook: "yes",
        stateWebhook: "yes",
        keepOnlineStatus: "yes",
      }),
    });

    const data = await response.json();
    console.log("GREEN-API setSettings response:", JSON.stringify(data));

    if (data.saveSettings) {
      return new Response(JSON.stringify({
        success: true,
        message: "Webhooks configurados com sucesso!",
        data,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    return new Response(JSON.stringify({
      success: false,
      error: data.message || "Erro ao configurar webhooks",
      data,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (error) {
    console.error("green-api-register-webhooks error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});