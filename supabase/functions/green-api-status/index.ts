import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });
    }

    const jwtToken = authHeader.replace("Bearer ", "");
    const authClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );
    const { data: claimsData, error: authError } = await authClient.auth.getClaims(jwtToken);
    const user = claimsData?.claims ? { id: claimsData.claims.sub } : null;

    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });
    }

    const { instance_id, token: apiToken, api_url } = await req.json();
    const greenUrl = `${api_url || "https://api.green-api.com"}/waInstance${instance_id}/getStatusInstance/${apiToken}`;

    const resp = await fetch(greenUrl);
    const rawText = await resp.text();
    let data: any;
    try {
      data = JSON.parse(rawText);
    } catch (_) {
      return new Response(JSON.stringify({ error: "GREEN-API returned invalid response", is_connected: false, is_online: false }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log("GREEN-API status response:", JSON.stringify(data));

    const stateInstance = data.stateInstance;
    const statusInstance = data.statusInstance;
    const isConnected = stateInstance === "authorized";
    const isOnline = statusInstance === "online";

    return new Response(JSON.stringify({
      success: true,
      state: stateInstance,
      status: statusInstance,
      is_connected: isConnected,
      is_online: isOnline,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (error) {
    console.error("green-api-status error:", error);
    return new Response(JSON.stringify({ error: error.message, is_connected: false, is_online: false }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
