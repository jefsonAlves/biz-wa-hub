import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { instance_id, token, client_token } = await req.json();
    console.log("Testing Z-API connection for instance:", instance_id);

    if (!instance_id || !token) {
      return new Response(JSON.stringify({ connected: false, error: "instance_id e token são obrigatórios" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const url = `https://api.z-api.io/instances/${instance_id}/token/${token}/me`;
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (client_token) headers["Client-Token"] = client_token;

    const response = await fetch(url, { method: "GET", headers });
    const data = await response.json();
    console.log("Z-API response:", JSON.stringify(data));

    if (response.ok && data.connected !== false) {
      return new Response(JSON.stringify({
        connected: true,
        phone: data.phone || data.id?.user || null,
        name: data.displayName || null,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    return new Response(JSON.stringify({ connected: false, error: data.message || "Não conectado" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("zapi-test error:", error);
    return new Response(JSON.stringify({ connected: false, error: error.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
