import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: req.headers.get("Authorization")! } } }
    );

    const { data: { user }, error: authError } = await supabaseClient.auth.getUser();
    if (authError || !user) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const body = await req.json();
    const apiKey = Deno.env.get("ASAAS_API_KEY");
    
    if (!apiKey) {
      return new Response(JSON.stringify({ error: "Configuração do Asaas ausente no servidor." }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const ASAAS_URL = "https://www.asaas.com/api/v3";
    
    // 1. Criar ou buscar cliente
    const customerResponse = await fetch(`${ASAAS_URL}/customers`, {
      method: "POST",
      headers: {
        "access_token": apiKey,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        name: body.customer.name,
        email: body.customer.email,
        cpfCnpj: body.customer.cpfCnpj
      })
    });

    const customer = await customerResponse.json();
    if (customer.errors) throw new Error(customer.errors[0].description);

    // 2. Fetch plan from database instead of hard-coding
    const { data: planData, error: planError } = await supabaseClient
      .from("plans")
      .select("price, name")
      .eq("name", body.planId.charAt(0).toUpperCase() + body.planId.slice(1))
      .eq("is_active", true)
      .maybeSingle();

    if (planError || !planData) {
      throw new Error(`Plano ${body.planId} não encontrado ou inativo.`);
    }
    
    const value = planData.price;

    // 2. Criar a cobrança
    const paymentResponse = await fetch(`${ASAAS_URL}/payments`, {
      method: "POST",
      headers: {
        "access_token": apiKey,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        customer: customer.id,
        billingType: body.paymentMethod === "PIX" ? "PIX" : "CREDIT_CARD",
        value: value,
        dueDate: new Date(Date.now() + 86400000).toISOString().split('T')[0],
        description: `Assinatura Chat Zap Flow IA - Plano ${body.planId.toUpperCase()}`,
        externalReference: `plan_${body.planId}_${Date.now()}_user_${user.id}`
      })
    });

    const payment = await paymentResponse.json();
    if (payment.errors) throw new Error(payment.errors[0].description);

    return new Response(JSON.stringify({ 
      success: true,
      paymentUrl: payment.invoiceUrl || payment.bankSlipUrl,
      paymentId: payment.id
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 400,
    });
  }
});
