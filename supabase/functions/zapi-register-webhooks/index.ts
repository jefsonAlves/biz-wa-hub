import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { instance_id, token, client_token, webhook_base_url } = await req.json();
    console.log("Registering webhooks for instance:", instance_id);

    if (!instance_id || !token || !webhook_base_url) {
      return new Response(JSON.stringify({ error: "instance_id, token e webhook_base_url são obrigatórios" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (client_token) headers["Client-Token"] = client_token;

    const baseUrl = `https://api.z-api.io/instances/${instance_id}/token/${token}`;

    // Register received webhook
    const receivedRes = await fetch(`${baseUrl}/update-webhook-received`, {
      method: "PUT", headers,
      body: JSON.stringify({ value: `${webhook_base_url}/functions/v1/zapi-webhook-received` }),
    });
    const receivedData = await receivedRes.json();
    console.log("Received webhook:", JSON.stringify(receivedData));

    // Register delivery webhook
    const sentRes = await fetch(`${baseUrl}/update-webhook-delivery`, {
      method: "PUT", headers,
      body: JSON.stringify({ value: `${webhook_base_url}/functions/v1/zapi-webhook-sent` }),
    });
    const sentData = await sentRes.json();
    console.log("Sent webhook:", JSON.stringify(sentData));

    return new Response(JSON.stringify({
      success: true,
      received: receivedData,
      sent: sentData,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (error) {
    console.error("zapi-register-webhooks error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
