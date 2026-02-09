import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { instance_id, token, client_token } = await req.json();
    console.log("Fetching QR Code for instance:", instance_id);

    if (!instance_id || !token) {
      return new Response(JSON.stringify({ error: "instance_id e token são obrigatórios" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const url = `https://api.z-api.io/instances/${instance_id}/token/${token}/qr-code`;
    const headers: Record<string, string> = {};
    if (client_token) headers["Client-Token"] = client_token;

    const response = await fetch(url, { method: "GET", headers });

    if (!response.ok) {
      const text = await response.text();
      console.error("Z-API QR Code error:", response.status, text);

      // Try parsing as JSON for error message
      try {
        const errData = JSON.parse(text);
        if (errData.connected || errData.value === "É necessário desconectar antes de ler o QR-Code") {
          return new Response(JSON.stringify({ 
            already_connected: true, 
            message: "WhatsApp já está conectado! Não é necessário escanear o QR Code." 
          }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }
        return new Response(JSON.stringify({ error: errData.message || errData.value || "Erro ao obter QR Code" }), {
          status: response.status, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      } catch {
        return new Response(JSON.stringify({ error: "Erro ao obter QR Code" }), {
          status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // Check content type - Z-API returns image/png bytes
    const contentType = response.headers.get("content-type") || "";

    if (contentType.includes("application/json")) {
      const data = await response.json();
      // Might return { value: "base64..." } or { connected: true }
      if (data.connected) {
        return new Response(JSON.stringify({ already_connected: true, message: "WhatsApp já conectado!" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (data.value) {
        return new Response(JSON.stringify({ qr_code: data.value }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ error: "Resposta inesperada da Z-API" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Binary image response - convert to base64
    const imageBuffer = await response.arrayBuffer();
    const base64 = btoa(String.fromCharCode(...new Uint8Array(imageBuffer)));
    const dataUrl = `data:image/png;base64,${base64}`;

    console.log("QR Code fetched successfully, size:", imageBuffer.byteLength);

    return new Response(JSON.stringify({ qr_code: dataUrl }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("zapi-qrcode error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
