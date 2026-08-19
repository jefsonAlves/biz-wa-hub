// Proxy seguro entre o painel e o backend próprio de WhatsApp (Baileys).
// Funciona sem n8n e sem Docker: o painel só fala com esta função.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { authenticate, corsHeaders, json, serviceClient } from "../_shared/n8n.ts";
import {
  backendCall,
  getBackend,
  humanizeBackendError,
  mapBackendStatus,
  normalizeBaseUrl,
  type BackendConfig,
} from "../_shared/whatsapp-backend.ts";

type Action =
  | "save_backend"
  | "test_backend"
  | "create_connection"
  | "start_session"
  | "refresh_status"
  | "disconnect"
  | "delete_session";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const auth = await authenticate(req);
    if ("error" in auth) return json({ error: auth.error }, 401);

    const body = await req.json().catch(() => null);
    const action = body?.action as Action | undefined;
    if (!action) return json({ error: "action é obrigatório" }, 400);

    const svc = serviceClient();
    const requestedTenantId = body?.tenant_id as string | undefined;
    if (!auth.isSuperAdmin && requestedTenantId && requestedTenantId !== auth.tenantId) {
      return json({ error: "tenant_forbidden" }, 403);
    }
    const tenantId = (auth.isSuperAdmin && requestedTenantId ? requestedTenantId : auth.tenantId) as
      | string
      | null;
    if (!tenantId) return json({ error: "tenant_id_required" }, 400);

    // ---------- Cadastro / teste do backend ----------
    if (action === "save_backend") {
      let baseUrl: string;
      try {
        baseUrl = normalizeBaseUrl(String(body?.base_url ?? ""));
      } catch {
        return json({ error: "URL do backend inválida." }, 400);
      }

      const patch: Record<string, unknown> = {
        tenant_id: tenantId,
        name: String(body?.name ?? "Backend WhatsApp").slice(0, 80),
        base_url: baseUrl,
        status: "unknown",
        last_error_message: null,
        session_token: null,
        session_token_expires_at: null,
      };
      if (typeof body?.api_token === "string" && body.api_token.trim()) {
        patch.api_token = body.api_token.trim();
      }
      if (typeof body?.auth_email === "string") patch.auth_email = body.auth_email.trim() || null;
      if (typeof body?.auth_password === "string" && body.auth_password) {
        patch.auth_password = body.auth_password;
      }

      const { error } = await svc
        .from("whatsapp_backends")
        .upsert(patch, { onConflict: "tenant_id" });
      if (error) return json({ error: "Falha ao salvar backend", details: error.message }, 500);
      return json({ success: true });
    }

    const backend = await getBackend(svc, tenantId);
    if (!backend) {
      return json(
        { error: "backend_not_configured", message: "Cadastre a URL do backend de WhatsApp." },
        400,
      );
    }

    if (action === "test_backend") {
      const started = Date.now();
      try {
        const { status, body: payload } = await backendCall(svc, backend, "/whatsapp/", {
          method: "GET",
          timeoutMs: 12000,
        });
        const reachable = status >= 200 && status < 500;
        const authorized = status >= 200 && status < 300;
        await svc
          .from("whatsapp_backends")
          .update({
            status: authorized ? "online" : "error",
            last_check_at: new Date().toISOString(),
            last_error_message: authorized ? null : `HTTP ${status}`,
          })
          .eq("id", backend.id);
        return json({
          success: authorized,
          reachable,
          authorized,
          http_status: status,
          duration_ms: Date.now() - started,
          sessions: Array.isArray(payload) ? payload.length : null,
        });
      } catch (e) {
        const message = humanizeBackendError(e instanceof Error ? e.message : "erro desconhecido");
        await svc
          .from("whatsapp_backends")
          .update({ status: "error", last_check_at: new Date().toISOString(), last_error_message: message })
          .eq("id", backend.id);
        return json({ success: false, reachable: false, error: message }, 200);
      }
    }

    // ---------- Criação de conexão (sessão no backend) ----------
    if (action === "create_connection") {
      const name = String(body?.name ?? "Novo número").slice(0, 80);
      try {
        const created = await backendCall(svc, backend, "/whatsapp/", {
          method: "POST",
          body: JSON.stringify({
            name,
            status: "OPENING",
            isDefault: false,
            queueIds: [],
            channel: "whatsapp",
            provider: "beta",
          }),
        });
        if (created.status < 200 || created.status >= 300) {
          return json(
            {
              error: "Backend recusou a criação da sessão",
              details: created.body?.error ?? `HTTP ${created.status}`,
            },
            502,
          );
        }
        const remote = created.body?.whatsapp ?? created.body;
        const remoteId = remote?.id != null ? String(remote.id) : null;

        const { data: connection, error } = await svc
          .from("whatsapp_connections")
          .insert({
            tenant_id: tenantId,
            name,
            provider_type: "baileys_backend",
            provider_instance_id: remoteId,
            provider_session_id: remoteId,
            provider_token: remote?.token ?? null,
            status: "connecting",
            qr_status: "requested",
          })
          .select("id")
          .single();
        if (error) return json({ error: "Falha ao registrar conexão", details: error.message }, 500);

        return json({ success: true, connection_id: connection.id, remote_id: remoteId });
      } catch (e) {
        return json(
          { error: humanizeBackendError(e instanceof Error ? e.message : "erro desconhecido"), cause: "backend_unreachable" },
          502,
        );
      }
    }

    // ---------- Ações sobre uma conexão existente ----------
    const connectionId = body?.connection_id as string | undefined;
    if (!connectionId) return json({ error: "connection_id é obrigatório" }, 400);

    let query = svc
      .from("whatsapp_connections")
      .select("id, tenant_id, name, provider_type, provider_instance_id, status")
      .eq("id", connectionId);
    if (!auth.isSuperAdmin) query = query.eq("tenant_id", auth.tenantId);
    const { data: connection } = await query.maybeSingle();
    if (!connection) return json({ error: "Conexão não encontrada" }, 404);
    if (connection.provider_type !== "baileys_backend") {
      return json({ error: "Esta conexão não usa o backend próprio." }, 400);
    }

    const remoteId = connection.provider_instance_id;
    if (!remoteId) return json({ error: "Conexão sem sessão no backend." }, 400);

    const applyRemoteState = async (remote: any) => {
      const status = mapBackendStatus(remote?.status);
      const qrcode: string | null = remote?.qrcode ? String(remote.qrcode) : null;
      const metadata: Record<string, unknown> = {
        qr_code: qrcode,
        qr_status: qrcode ? "available" : status === "connected" ? "idle" : "requested",
        connection_error: null,
        backend_status: remote?.status ?? null,
      };
      await svc
        .from("whatsapp_connections")
        .update({
          status,
          qr_status: metadata.qr_status as string,
          phone_number: remote?.number ?? undefined,
          connection_error: null,
          metadata,
          last_health_check_at: new Date().toISOString(),
          ...(status === "connected" ? { last_connected_at: new Date().toISOString() } : {}),
          ...(status === "disconnected" ? { last_disconnected_at: new Date().toISOString() } : {}),
        })
        .eq("id", connection.id);
      return { status, has_qr: !!qrcode };
    };

    const registerFailure = async (message: string) => {
      await svc
        .from("whatsapp_connections")
        .update({
          status: "error",
          connection_error: message,
          metadata: { connection_error: message },
          last_health_check_at: new Date().toISOString(),
        })
        .eq("id", connection.id);
    };

    try {
      if (action === "start_session") {
        const started = await backendCall(svc, backend, `/whatsappsession/${remoteId}`, {
          method: "POST",
        });
        if (started.status < 200 || started.status >= 300) {
          const message = `Backend respondeu HTTP ${started.status} ao iniciar a sessão.`;
          await registerFailure(message);
          return json({ error: message }, 502);
        }
        await svc
          .from("whatsapp_connections")
          .update({ status: "connecting", qr_status: "requested", connection_error: null })
          .eq("id", connection.id);
        return json({ success: true, message: "Sessão iniciada. O QR Code chega em segundos." });
      }

      if (action === "refresh_status") {
        const shown = await backendCall(svc, backend, `/whatsapp/${remoteId}`, { method: "GET" });
        if (shown.status < 200 || shown.status >= 300) {
          const message = `Backend respondeu HTTP ${shown.status} ao consultar a sessão.`;
          await registerFailure(message);
          return json({ error: message }, 502);
        }
        const state = await applyRemoteState(shown.body);
        return json({ success: true, ...state });
      }

      if (action === "disconnect") {
        const out = await backendCall(svc, backend, `/whatsappsession/${remoteId}`, {
          method: "DELETE",
        });
        await svc
          .from("whatsapp_connections")
          .update({
            status: "disconnected",
            qr_status: "idle",
            metadata: {},
            last_disconnected_at: new Date().toISOString(),
          })
          .eq("id", connection.id);
        return json({ success: true, http_status: out.status });
      }

      if (action === "delete_session") {
        await backendCall(svc, backend, `/whatsapp/${remoteId}`, { method: "DELETE" });
        return json({ success: true });
      }

      return json({ error: "action inválida" }, 400);
    } catch (e) {
      const message = humanizeBackendError(e instanceof Error ? e.message : "erro desconhecido");
      await registerFailure(message);
      return json({ error: message, cause: "backend_unreachable" }, 502);
    }
  } catch (error) {
    console.error("whatsapp-backend-proxy error:", error);
    return json(
      { error: "Erro interno", details: error instanceof Error ? error.message : "erro desconhecido" },
      500,
    );
  }
});
