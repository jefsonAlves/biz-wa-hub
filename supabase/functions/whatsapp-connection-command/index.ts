import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { authenticate, buildEvent, corsHeaders, enqueueEvent, getIntegration, json, serviceClient } from "../_shared/n8n.ts";

const COMMAND_EVENTS: Record<string, string> = {
  create_session: "whatsapp.connection.create",
  generate_qr: "whatsapp.connection.qr.request",
  get_status: "whatsapp.connection.status.request",
  disconnect: "whatsapp.connection.disconnect",
  reconnect: "whatsapp.connection.reconnect",
  logout: "whatsapp.connection.disconnect",
  health_check: "whatsapp.connection.status.request",
  sync_messages: "whatsapp.messages.sync.request",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const auth = await authenticate(req);
    if ("error" in auth) return json({ error: auth.error }, 401);

    const body = await req.json().catch(() => null);
    const command = body?.command as string | undefined;
    const connectionId = body?.connection_id as string | undefined;
    const svc = serviceClient();

    // Determine the effective tenant ID for creation or lookup
    const requestedTenantId = body?.tenant_id;
    const effectiveTenantId = auth.isSuperAdmin && requestedTenantId 
      ? requestedTenantId 
      : auth.tenantId;

    // SPECIAL COMMAND: Create a new connection entry
    if (command === "create_connection_entry") {
      if (!effectiveTenantId) return json({ error: "tenant_id_required" }, 400);

      const providerType = body?.provider_type || "n8n_unofficial";
      const { data, error } = await svc.from("whatsapp_connections").insert({
        tenant_id: effectiveTenantId,
        name: body?.name || "Novo número",
        provider_type: providerType,
        provider_session_id: body?.provider_session_id || null,
        provider_token: body?.provider_token || null,
        phone_number_id: body?.phone_number_id || null,
        waba_id: body?.waba_id || null,
        status: "disconnected",
      }).select("id").single();

      if (error) {
        console.error("Error creating connection entry:", error);
        return json({ error: "Falha ao criar entrada de conexão no banco." }, 500);
      }
      return json({ success: true, connection_id: data.id });
    }

    if ((command === "disconnect" || command === "logout") && body?.confirm_disconnect !== true) {
      return json({ error: "confirm_disconnect_required" }, 409);
    }

    if (!command || !COMMAND_EVENTS[command]) return json({ error: "Comando inválido" }, 400);
    if (!connectionId) return json({ error: "connection_id é obrigatório" }, 400);

    // Lookup connection - Super Admin can access any connection
    let query = svc.from("whatsapp_connections")
      .select("id, tenant_id, provider_type, provider_instance_id, provider_session_id, status")
      .eq("id", connectionId);

    if (!auth.isSuperAdmin) {
      query = query.eq("tenant_id", auth.tenantId);
    }

    const { data: connection } = await query.maybeSingle();
    if (!connection) return json({ error: "Conexão não encontrada" }, 404);

    if (connection.provider_type === "meta") {
      if (command === "get_status" || command === "health_check") {
        return json({ success: true, status: connection.status });
      }
      return json({ error: "Comandos Meta Cloud API são processados via webhook" }, 400);
    }

    if (connection.provider_type !== "n8n_unofficial" && connection.provider_type !== "n8n") {
      return json({ error: `Provedor ${connection.provider_type} ainda não suportado para comandos` }, 400);
    }

    // Optimistic local state so the UI has feedback
    const patch: Record<string, unknown> = { last_health_check_at: new Date().toISOString() };
    if (command === "generate_qr" || command === "create_session") patch.qr_status = "requested";
    if (command === "disconnect" || command === "logout") patch.status = "disconnecting";
    if (command === "reconnect") patch.status = "connecting";
    await svc.from("whatsapp_connections").update(patch).eq("id", connection.id);

    // Build the event using the REAL tenant_id of the connection
    const event = buildEvent({
      event_type: COMMAND_EVENTS[command],
      tenant_id: connection.tenant_id,
      connection_id: connection.id,
      data: {
        command,
        provider_instance_id: connection.provider_instance_id,
        provider_session_id: connection.provider_session_id,
        requested_by: auth.userId,
      },
    });

    await enqueueEvent(svc, event, { type: "whatsapp_connection", id: connection.id });

    // Use the connection's tenant_id to find the correct integration
    const integration = await getIntegration(svc, connection.tenant_id);
    
    return json({
      success: true,
      queued: true,
      event_id: event.event_id,
      message: command === "sync_messages" ? "Sincronização enfileirada" : "Comando enfileirado",
      warning: integration ? undefined : "Integração n8n não configurada",
    }, 202);
  } catch (error) {
    console.error("whatsapp-connection-command error:", error);
    return json({ error: error instanceof Error ? error.message : "erro interno" }, 500);
  }
});