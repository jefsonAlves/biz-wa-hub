import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const GREEN_API_URL = "https://api.green-api.com";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { instance_id, token } = await req.json();

    if (!instance_id || !token) {
      return new Response(JSON.stringify({ connected: false, error: "idInstance e apiTokenInstance são obrigatórios" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log("Testing GREEN-API connection for instance:", instance_id);

    const url = `${GREEN_API_URL}/waInstance${instance_id}/getStateInstance/${token}`;
    
    let response: Response;
    let data: any;
    
    try {
      response = await fetch(url, { method: "GET" });
    } catch (fetchError) {
      console.error("Fetch error:", fetchError);
      return new Response(JSON.stringify({ connected: false, error: "Não foi possível conectar à GREEN-API. Verifique sua conexão." }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const rawText = await response.text();
    console.log("GREEN-API raw response:", rawText);

    try {
      data = JSON.parse(rawText);
    } catch (_) {
      console.error("GREEN-API returned non-JSON:", rawText.substring(0, 200));
      return new Response(JSON.stringify({ 
        connected: false, 
        error: `GREEN-API retornou resposta inválida (HTTP ${response.status}). Verifique o idInstance e o token.` 
      }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log("GREEN-API state response:", JSON.stringify(data));

    if (response.ok && data.stateInstance === "authorized") {
      return new Response(JSON.stringify({
        connected: true,
        phone: data.phone || null,
        name: data.displayName || null,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    return new Response(JSON.stringify({
      connected: false,
      error: data.stateInstance === "notAuthorized" 
        ? "WhatsApp não autorizado. Escaneie o QR Code." 
        : data.message || `Estado: ${data.stateInstance || "desconhecido"}`,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (error) {
    console.error("green-api-test error:", error);
    return new Response(JSON.stringify({ connected: false, error: error.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});