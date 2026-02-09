import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { instance_id, token, client_token } = await req.json();

    if (!instance_id || !token) {
      return new Response(JSON.stringify({ connected: false, error: "instance_id e token são obrigatórios" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Clean instance_id - extract just the ID if user pasted full URL
    let cleanInstanceId = instance_id.trim();
    const urlMatch = cleanInstanceId.match(/instances\/([A-F0-9]+)/i);
    if (urlMatch) cleanInstanceId = urlMatch[1];

    // Clean token from URL if needed
    let cleanToken = token.trim();
    const tokenMatch = cleanToken.match(/token\/([A-Za-z0-9]+)/i);
    if (tokenMatch) cleanToken = tokenMatch[1];

    console.log("Testing Z-API connection for instance:", cleanInstanceId);

    const url = `https://api.z-api.io/instances/${cleanInstanceId}/token/${cleanToken}/me`;
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
