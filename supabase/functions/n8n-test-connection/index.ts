import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { authenticate, corsHeaders, getIntegration, json, serviceClient, deliverEvent, buildEvent } from "../_shared/n8n.ts";

/**
 * Edge Function: n8n-test-connection
 * Permite que um super_admin ou tenant_admin valide a conectividade com o n8n.
 * Tenta disparar um evento de "ping" imediato para o n8n ignorando a fila do outbox.
 */
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const auth = await authenticate(req);
    if ("error" in auth) return json({ error: auth.error }, 401);

    const svc = serviceClient();
    
    // Verificar permissão
    const { data: roleData } = await svc
      .from("user_roles")
      .select("role")
      .eq("user_id", auth.userId)
      .maybeSingle();
      
    const isAdmin = roleData?.role === 'super_admin' || roleData?.role === 'admin' || roleData?.role === 'tenant_admin';
    if (!isAdmin) return json({ error: "Permissões insuficientes" }, 403);

    const integration = await getIntegration(svc, auth.tenantId);
    if (!integration) {
      return json({ 
        success: false, 
        error: "Nenhuma configuração de n8n ativa encontrada." 
      }, 404);
    }

    // Criar um evento de teste
    const testEvent = buildEvent({
      event_type: "platform.ping",
      tenant_id: auth.tenantId,
      data: {
        timestamp: new Date().toISOString(),
        triggered_by: auth.userId,
        test: true
      }
    });

    // Tentar entrega imediata (ignora outbox para feedback instantâneo)
    const result = await deliverEvent(svc, testEvent, integration);

    return json({
      success: result.success,
      status: result.status,
      error: result.error,
      body: result.body,
      target: integration.base_url
    });
  } catch (error) {
    console.error("n8n-test-connection error:", error);
    return json({ error: error instanceof Error ? error.message : "Erro interno" }, 500);
  }
});
