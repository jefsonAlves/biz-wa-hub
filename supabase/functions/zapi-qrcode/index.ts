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
    console.log("Fetching QR Code for GREEN-API instance:", instance_id);

    if (!instance_id || !token) {
      return new Response(JSON.stringify({ error: "idInstance e apiTokenInstance são obrigatórios" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const url = `${GREEN_API_URL}/waInstance${instance_id}/qr/${token}`;
    const response = await fetch(url, { method: "GET" });

    if (!response.ok) {
      const text = await response.text();
      console.error("GREEN-API QR Code error:", response.status, text);
      try {
        const errData = JSON.parse(text);
        return new Response(JSON.stringify({ error: errData.message || errData.value || "Erro ao obter QR Code" }), {
          status: response.status, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      } catch {
        return new Response(JSON.stringify({ error: `Erro ${response.status} ao obter QR Code` }), {
          status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    const data = await response.json();
    console.log("GREEN-API QR response type:", data.type);

    // GREEN-API returns { type: "qrCode", message: "base64..." }
    // or { type: "alreadyLogged", message: "..." }
    // or { type: "accountData", ... }
    if (data.type === "alreadyLogged" || data.type === "accountData") {
      return new Response(JSON.stringify({
        already_connected: true,
        message: "WhatsApp já está conectado! Não é necessário escanear o QR Code.",
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (data.type === "qrCode" && data.message) {
      // data.message is base64 image
      const qrDataUrl = data.message.startsWith("data:") ? data.message : `data:image/png;base64,${data.message}`;
      return new Response(JSON.stringify({ qr_code: qrDataUrl }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (data.type === "error") {
      return new Response(JSON.stringify({ error: data.message || "Erro da GREEN-API" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Resposta inesperada da GREEN-API", raw: data }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("green-api-qrcode error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});