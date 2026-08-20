// Proxy seguro entre o painel e o backend próprio de WhatsApp.
// Fluxo: Frontend -> Edge Function -> Node.js Baileys/WuzAPI -> WhatsApp.
// n8n NÃO participa de sessão, QR Code, status, envio ou desconexão.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { authenticate, corsHeaders, json, serviceClient } from "../_shared/n8n.ts";
import {
  backendCall,
  getBackend,
  humanizeBackendError,
  mapBackendStatus,
} from "../_shared/whatsapp-backend.ts";

type Action =
  | "create_connection"
  | "start_session"
  | "refresh_status"
  | "disconnect"
  | "delete_session";

type BackendProvider = "baileys" | "wuzapi";

const normalizeProvider = (value: unknown): BackendProvider =>
  String(value ?? "baileys").toLowerCase() === "wuzapi" ? "wuzapi" : "baileys";

const providerTypeOf = (provider: BackendProvider) =>
  provider === "wuzapi" ? "wuzapi_backend" : "baileys_backend";

const providerFromType = (providerType: string): BackendProvider =>
  providerType === "wuzapi_backend" ? "wuzapi" : "baileys";

const backendUnavailable = (action: Action) =>
  json({
    success: false,
    backend_configured: false,
    status: "disconnected",
    has_qr: false,
    phone_number: null,
    action,
    message:
      "O serviço Node.js do WhatsApp ainda não está disponível. A conexão foi preservada e poderá gerar o QR Code assim que o serviço Baileys estiver publicado/configurado.",
  });

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const auth = await authenticate(req);
    if ("error" in auth) return json({ error: auth.error }, 401);

    const body = await req.json().catch(() => ({}));
    const action = body?.action as Action | undefined;
    if (!action) return json({ error: "action_required", message: "action é obrigatório" }, 400);

    const svc = serviceClient();
    const requestedTenantId = body?.tenant_id as string | undefined;

    if (!auth.isSuperAdmin && requestedTenantId && requestedTenantId !== auth.tenantId) {
      return json({ error: "tenant_forbidden" }, 403);
    }

    const tenantId = (auth.isSuperAdmin && requestedTenantId ? requestedTenantId : auth.tenantId) as
      | string
      | null;
    if (!tenantId) return json({ error: "tenant_id_required" }, 400);

    // Cadastro via Edge Function permanece suportado, embora o frontend atual
    // já faça o cadastro local diretamente no Supabase.
    if (action === "create_connection") {
      const name = String(body?.name ?? "WhatsApp").trim().slice(0, 80) || "WhatsApp";
      const provider = normalizeProvider(body?.provider);
      const backend = await getBackend(svc, tenantId);

      if (!backend) {
        const { data: connection, error } = await svc
          .from("whatsapp_connections")
          .insert({
            tenant_id: tenantId,
            name,
            provider_type: providerTypeOf(provider),
            status: "disconnected",
            qr_status: "idle",
            connection_error: null,
            metadata: { backend_provider: provider, backend_ready: false },
          })
          .select("id")
          .single();

        if (error) return json({ error: "connection_create_failed", message: error.message }, 500);

        return json({
          success: true,
          connection_id: connection.id,
          remote_id: null,
          backend_configured: false,
          auto_connect: false,
          provider,
        });
      }

      try {
        const created = await backendCall(svc, backend, "/whatsapp/", {
          method: "POST",
          body: JSON.stringify({
            name,
            status: "DISCONNECTED",
            isDefault: false,
            queueIds: [],
            channel: "whatsapp",
            provider: provider === "wuzapi" ? "wuzapi" : "beta",
          }),
        });

        if (created.status < 200 || created.status >= 300) {
          return json({
            success: false,
            error: "backend_create_failed",
            message: "O serviço de WhatsApp recusou a criação da sessão.",
          }, 502);
        }

        const remote = created.body?.whatsapp ?? created.body;
        const remoteId = remote?.id != null ? String(remote.id) : null;

        const { data: connection, error } = await svc
          .from("whatsapp_connections")
          .insert({
            tenant_id: tenantId,
            name,
            provider_type: providerTypeOf(provider),
            provider_instance_id: remoteId,
            provider_session_id: remoteId,
            provider_token: remote?.token ?? null,
            status: "disconnected",
            qr_status: "idle",
            connection_error: null,
            metadata: { backend_provider: provider, backend_ready: true },
          })
          .select("id")
          .single();

        if (error) return json({ error: "connection_create_failed", message: error.message }, 500);

        return json({
          success: true,
          connection_id: connection.id,
          remote_id: remoteId,
          provider,
          backend_configured: true,
          auto_connect: false,
        });
      } catch (error) {
        return json({
          success: false,
          error: "backend_unreachable",
          message: humanizeBackendError(error instanceof Error ? error.message : "erro desconhecido"),
        }, 502);
      }
    }

    const connectionId = body?.connection_id as string | undefined;
    if (!connectionId) return json({ error: "connection_id_required" }, 400);

    let query = svc
      .from("whatsapp_connections")
      .select("id, tenant_id, name, provider_type, provider_instance_id, provider_session_id, status, metadata")
      .eq("id", connectionId);

    if (!auth.isSuperAdmin) query = query.eq("tenant_id", auth.tenantId);

    const { data: connection } = await query.maybeSingle();
    if (!connection) return json({ error: "connection_not_found", message: "Conexão não encontrada" }, 404);

    if (!["baileys_backend", "wuzapi_backend"].includes(connection.provider_type)) {
      return json({ error: "unsupported_provider", message: "Esta conexão não usa o backend próprio." }, 400);
    }

    const backend = await getBackend(svc, connection.tenant_id);

    // Estado normal, não é Runtime Error. Atualizar QR/status nunca deve devolver
    // 409 ou fabricar stack trace quando o processo Baileys ainda não foi publicado.
    if (!backend) {
      await svc
        .from("whatsapp_connections")
        .update({
          status: "disconnected",
          qr_status: "idle",
          connection_error: null,
          metadata: {
            ...(connection.metadata ?? {}),
            backend_ready: false,
          },
          last_health_check_at: new Date().toISOString(),
        })
        .eq("id", connection.id);

      return backendUnavailable(action);
    }

    const provider = providerFromType(connection.provider_type);
    let remoteId = connection.provider_instance_id as string | null;

    // Criação preguiçosa da sessão remota para conexões cadastradas antes do deploy do backend.
    if (!remoteId && action === "start_session") {
      try {
        const created = await backendCall(svc, backend, "/whatsapp/", {
          method: "POST",
          body: JSON.stringify({
            name: connection.name,
            status: "DISCONNECTED",
            isDefault: false,
            queueIds: [],
            channel: "whatsapp",
            provider: provider === "wuzapi" ? "wuzapi" : "beta",
          }),
        });

        if (created.status < 200 || created.status >= 300) {
          return json({
            success: false,
            error: "backend_create_failed",
            message: "O serviço de WhatsApp recusou a criação da sessão.",
            backend_configured: true,
          }, 502);
        }

        const remote = created.body?.whatsapp ?? created.body;
        remoteId = remote?.id != null ? String(remote.id) : null;
        if (!remoteId) {
          return json({
            success: false,
            error: "session_id_missing",
            message: "O serviço não retornou o identificador da sessão.",
          }, 502);
        }

        await svc
          .from("whatsapp_connections")
          .update({
            provider_instance_id: remoteId,
            provider_session_id: remoteId,
            provider_token: remote?.token ?? null,
            metadata: { ...(connection.metadata ?? {}), backend_provider: provider, backend_ready: true },
          })
          .eq("id", connection.id);
      } catch (error) {
        return json({
          success: false,
          error: "backend_unreachable",
          backend_configured: true,
          message: humanizeBackendError(error instanceof Error ? error.message : "erro desconhecido"),
        }, 502);
      }
    }

    if (!remoteId) {
      if (action === "refresh_status") {
        return json({
          success: true,
          status: "disconnected",
          has_qr: false,
          phone_number: null,
          backend_configured: true,
        });
      }

      if (action === "disconnect" || action === "delete_session") {
        await svc.from("whatsapp_connections").update({ status: "disconnected", qr_status: "idle" }).eq("id", connection.id);
        return json({ success: true, status: "disconnected", backend_configured: true });
      }

      return json({
        success: false,
        status: "disconnected",
        backend_configured: true,
        message: "A sessão ainda não foi criada no serviço WhatsApp.",
      });
    }

    const applyRemoteState = async (remote: any) => {
      const status = mapBackendStatus(remote?.status);
      const qrcode = remote?.qrcode ? String(remote.qrcode) : null;
      const qrStatus = qrcode ? "available" : status === "connected" ? "idle" : "requested";

      await svc
        .from("whatsapp_connections")
        .update({
          status,
          qr_status: qrStatus,
          phone_number: remote?.number ?? undefined,
          connection_error: null,
          metadata: {
            ...(connection.metadata ?? {}),
            qr_code: qrcode,
            backend_status: remote?.status ?? null,
            backend_provider: provider,
            backend_ready: true,
          },
          last_health_check_at: new Date().toISOString(),
          ...(status === "connected" ? { last_connected_at: new Date().toISOString() } : {}),
          ...(status === "disconnected" ? { last_disconnected_at: new Date().toISOString() } : {}),
        })
        .eq("id", connection.id);

      return { status, has_qr: Boolean(qrcode), phone_number: remote?.number ?? null };
    };

    try {
      if (action === "start_session") {
        const started = await backendCall(svc, backend, `/whatsappsession/${remoteId}`, { method: "POST" });
        if (started.status < 200 || started.status >= 300) {
          return json({
            success: false,
            error: "session_start_failed",
            backend_configured: true,
            message: `O serviço respondeu HTTP ${started.status} ao iniciar a sessão.`,
          }, 502);
        }

        await svc
          .from("whatsapp_connections")
          .update({ status: "connecting", qr_status: "requested", connection_error: null })
          .eq("id", connection.id);

        return json({
          success: true,
          backend_configured: true,
          status: "connecting",
          message: "Sessão iniciada. Aguarde a geração do QR Code.",
        });
      }

      if (action === "refresh_status") {
        const shown = await backendCall(svc, backend, `/whatsapp/${remoteId}`, { method: "GET" });
        if (shown.status < 200 || shown.status >= 300) {
          return json({
            success: false,
            error: "status_failed",
            backend_configured: true,
            message: `O serviço respondeu HTTP ${shown.status} ao consultar a sessão.`,
          }, 502);
        }
        return json({ success: true, ...(await applyRemoteState(shown.body)), backend_configured: true });
      }

      if (action === "disconnect") {
        await backendCall(svc, backend, `/whatsappsession/${remoteId}`, { method: "DELETE" });
        await svc
          .from("whatsapp_connections")
          .update({
            status: "disconnected",
            qr_status: "idle",
            connection_error: null,
            last_disconnected_at: new Date().toISOString(),
          })
          .eq("id", connection.id);
        return json({ success: true, status: "disconnected", backend_configured: true });
      }

      if (action === "delete_session") {
        await backendCall(svc, backend, `/whatsapp/${remoteId}`, { method: "DELETE" });
        return json({ success: true, backend_configured: true });
      }

      return json({ error: "invalid_action" }, 400);
    } catch (error) {
      const message = humanizeBackendError(error instanceof Error ? error.message : "erro desconhecido");
      await svc
        .from("whatsapp_connections")
        .update({
          connection_error: null,
          metadata: { ...(connection.metadata ?? {}), backend_ready: false, backend_last_error: message },
          last_health_check_at: new Date().toISOString(),
        })
        .eq("id", connection.id);

      return json({
        success: false,
        backend_configured: true,
        status: "disconnected",
        message,
      });
    }
  } catch (error) {
    console.error("whatsapp-backend-proxy error:", error);
    return json({
      error: "internal_error",
      message: "Erro interno ao processar a conexão WhatsApp.",
      details: error instanceof Error ? error.message : "erro desconhecido",
    }, 500);
  }
});