// Proxy seguro entre o painel e o backend próprio de WhatsApp.
// Fluxo principal: Frontend -> Edge Function -> Backend Node.js -> Baileys/WuzAPI -> WhatsApp.
// n8n é opcional e NÃO participa de sessão, QR Code, status, envio ou desconexão.
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

    // -----------------------------------------------------------------------
    // CADASTRO LOCAL DA CONEXÃO
    // -----------------------------------------------------------------------
    // Cadastrar um número/empresa no painel NÃO depende de n8n e também não
    // deve falhar caso o processo Node.js/Baileys ainda não esteja publicado.
    // A sessão remota é criada imediatamente quando o backend está disponível;
    // caso contrário, é criada de forma preguiçosa no primeiro "Conectar".
    if (action === "create_connection") {
      const name = String(body?.name ?? "Novo número").trim().slice(0, 80) || "Novo número";
      const provider = normalizeProvider(body?.provider);
      const providerType = providerTypeOf(provider);
      const backend = await getBackend(svc, tenantId);

      if (!backend) {
        const { data: connection, error } = await svc
          .from("whatsapp_connections")
          .insert({
            tenant_id: tenantId,
            name,
            provider_type: providerType,
            provider_instance_id: null,
            provider_session_id: null,
            provider_token: null,
            status: "disconnected",
            qr_status: "idle",
            connection_error: null,
            metadata: {
              backend_provider: provider,
              backend_ready: false,
            },
          })
          .select("id")
          .single();

        if (error) {
          return json({ error: "Falha ao registrar conexão", details: error.message }, 500);
        }

        return json({
          success: true,
          connection_id: connection.id,
          remote_id: null,
          provider,
          backend_configured: false,
          auto_connect: false,
          message:
            "Conexão cadastrada. O serviço Baileys/WuzAPI ainda não está disponível; configure o backend da plataforma para gerar o QR Code.",
        });
      }

      const createPayload: Record<string, unknown> = {
        name,
        status: "DISCONNECTED",
        isDefault: false,
        queueIds: [],
        channel: "whatsapp",
        provider: provider === "wuzapi" ? "wuzapi" : "beta",
      };

      if (provider === "wuzapi") {
        if (body?.wuzapi_url) createPayload.wuzapiUrl = String(body.wuzapi_url);
        if (body?.wuzapi_token) createPayload.wuzapiToken = String(body.wuzapi_token);
      }

      try {
        const created = await backendCall(svc, backend, "/whatsapp/", {
          method: "POST",
          body: JSON.stringify(createPayload),
        });

        if (created.status < 200 || created.status >= 300) {
          return json(
            {
              error: "backend_create_failed",
              message: "O serviço de WhatsApp recusou a criação da sessão.",
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
            provider_type: providerType,
            provider_instance_id: remoteId,
            provider_session_id: remoteId,
            provider_token: remote?.token ?? null,
            status: "connecting",
            qr_status: "requested",
            connection_error: null,
            metadata: {
              backend_provider: provider,
              backend_ready: true,
            },
          })
          .select("id")
          .single();

        if (error) {
          return json({ error: "Falha ao registrar conexão", details: error.message }, 500);
        }

        if (remoteId) {
          await backendCall(svc, backend, `/whatsappsession/${remoteId}`, { method: "POST" }).catch(
            () => null,
          );
        }

        return json({
          success: true,
          connection_id: connection.id,
          remote_id: remoteId,
          provider,
          backend_configured: true,
          auto_connect: true,
          delivered_via: "direct_backend",
        });
      } catch (e) {
        // Mesmo quando o backend está cadastrado mas temporariamente fora do ar,
        // preservamos o cadastro no painel e deixamos a conexão como desconectada.
        const message = humanizeBackendError(e instanceof Error ? e.message : "erro desconhecido");
        const { data: connection, error } = await svc
          .from("whatsapp_connections")
          .insert({
            tenant_id: tenantId,
            name,
            provider_type: providerType,
            status: "disconnected",
            qr_status: "idle",
            connection_error: null,
            metadata: {
              backend_provider: provider,
              backend_ready: false,
              backend_last_error: message,
            },
          })
          .select("id")
          .single();

        if (error) {
          return json({ error: "Falha ao registrar conexão", details: error.message }, 500);
        }

        return json({
          success: true,
          connection_id: connection.id,
          remote_id: null,
          provider,
          backend_configured: true,
          auto_connect: false,
          message: `Conexão cadastrada, mas o serviço de WhatsApp está temporariamente indisponível: ${message}`,
        });
      }
    }

    // -----------------------------------------------------------------------
    // AÇÕES EM CONEXÃO EXISTENTE
    // -----------------------------------------------------------------------
    const connectionId = body?.connection_id as string | undefined;
    if (!connectionId) return json({ error: "connection_id é obrigatório" }, 400);

    let query = svc
      .from("whatsapp_connections")
      .select("id, tenant_id, name, provider_type, provider_instance_id, provider_session_id, status, metadata")
      .eq("id", connectionId);

    if (!auth.isSuperAdmin) query = query.eq("tenant_id", auth.tenantId);

    const { data: connection } = await query.maybeSingle();
    if (!connection) return json({ error: "Conexão não encontrada" }, 404);

    const supportedProviders = ["baileys_backend", "wuzapi_backend"];
    if (!supportedProviders.includes(connection.provider_type)) {
      return json({ error: "Esta conexão não usa o backend próprio de WhatsApp." }, 400);
    }

    const backend = await getBackend(svc, connection.tenant_id);
    if (!backend) {
      return json(
        {
          error: "backend_service_unavailable",
          message: "atualize para deixar funcionando com o upgrade aplicado7",
          backend_configured: false,
        },
        409,
      );
    }

    const provider = providerFromType(connection.provider_type);
    let remoteId = connection.provider_instance_id as string | null;

    // Conexões cadastradas enquanto o backend estava ausente recebem a sessão
    // remota no primeiro clique em "Conectar".
    if (!remoteId && action === "start_session") {
      const createPayload: Record<string, unknown> = {
        name: connection.name,
        status: "DISCONNECTED",
        isDefault: false,
        queueIds: [],
        channel: "whatsapp",
        provider: provider === "wuzapi" ? "wuzapi" : "beta",
      };

      try {
        const created = await backendCall(svc, backend, "/whatsapp/", {
          method: "POST",
          body: JSON.stringify(createPayload),
        });

        if (created.status < 200 || created.status >= 300) {
          return json(
            {
              error: "backend_create_failed",
              message: "O serviço de WhatsApp recusou a criação da sessão.",
              details: created.body?.error ?? `HTTP ${created.status}`,
            },
            502,
          );
        }

        const remote = created.body?.whatsapp ?? created.body;
        remoteId = remote?.id != null ? String(remote.id) : null;

        if (!remoteId) {
          return json({ error: "O backend não retornou o identificador da sessão." }, 502);
        }

        await svc
          .from("whatsapp_connections")
          .update({
            provider_instance_id: remoteId,
            provider_session_id: remoteId,
            provider_token: remote?.token ?? null,
            metadata: {
              ...(connection.metadata ?? {}),
              backend_provider: provider,
              backend_ready: true,
            },
          })
          .eq("id", connection.id);
      } catch (e) {
        const message = humanizeBackendError(e instanceof Error ? e.message : "erro desconhecido");
        return json(
          {
            error: "backend_unreachable",
            message,
            backend_configured: true,
          },
          502,
        );
      }
    }

    if (!remoteId) {
      // refresh/disconnect de uma sessão que nunca foi iniciada é um estado válido.
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
        await svc
          .from("whatsapp_connections")
          .update({ status: "disconnected", qr_status: "idle" })
          .eq("id", connection.id);
        return json({ success: true, status: "disconnected" });
      }

      return json({ error: "Conexão ainda não possui sessão no backend." }, 409);
    }

    const applyRemoteState = async (remote: any) => {
      const status = mapBackendStatus(remote?.status);
      const qrcode: string | null = remote?.qrcode ? String(remote.qrcode) : null;
      const metadata: Record<string, unknown> = {
        ...(connection.metadata ?? {}),
        qr_code: qrcode,
        qr_status: qrcode ? "available" : status === "connected" ? "idle" : "requested",
        connection_error: null,
        backend_status: remote?.status ?? null,
        backend_provider: provider,
        backend_ready: true,
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

      return { status, has_qr: !!qrcode, phone_number: remote?.number ?? null };
    };

    const registerFailure = async (message: string) => {
      await svc
        .from("whatsapp_connections")
        .update({
          connection_error: message,
          last_health_check_at: new Date().toISOString(),
          metadata: {
            ...(connection.metadata ?? {}),
            backend_last_error: message,
          },
        })
        .eq("id", connection.id);
    };

    try {
      if (action === "start_session") {
        const started = await backendCall(svc, backend, `/whatsappsession/${remoteId}`, {
          method: "POST",
        });

        if (started.status < 200 || started.status >= 300) {
          const message = `O serviço de WhatsApp respondeu HTTP ${started.status} ao iniciar a sessão.`;
          await registerFailure(message);
          return json({ error: "session_start_failed", message }, 502);
        }

        await svc
          .from("whatsapp_connections")
          .update({
            status: "connecting",
            qr_status: "requested",
            connection_error: null,
          })
          .eq("id", connection.id);

        return json({
          success: true,
          message: "Sessão iniciada. Aguarde a geração do QR Code.",
          backend_configured: true,
        });
      }

      if (action === "refresh_status") {
        const shown = await backendCall(svc, backend, `/whatsapp/${remoteId}`, { method: "GET" });
        if (shown.status < 200 || shown.status >= 300) {
          const message = `O serviço de WhatsApp respondeu HTTP ${shown.status} ao consultar a sessão.`;
          await registerFailure(message);
          return json({ error: "status_failed", message }, 502);
        }
        const state = await applyRemoteState(shown.body);
        return json({ success: true, ...state, backend_configured: true });
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
            connection_error: null,
            last_disconnected_at: new Date().toISOString(),
          })
          .eq("id", connection.id);

        return json({ success: true, http_status: out.status, status: "disconnected" });
      }

      if (action === "delete_session") {
        await backendCall(svc, backend, `/whatsapp/${remoteId}`, { method: "DELETE" });
        return json({ success: true });
      }

      return json({ error: "action inválida" }, 400);
    } catch (e) {
      const message = humanizeBackendError(e instanceof Error ? e.message : "erro desconhecido");
      await registerFailure(message);
      return json({ error: "backend_unreachable", message }, 502);
    }
  } catch (error) {
    console.error("whatsapp-backend-proxy error:", error);
    return json(
      {
        error: "internal_error",
        message: "Erro interno ao processar a conexão WhatsApp.",
        details: error instanceof Error ? error.message : "erro desconhecido",
      },
      500,
    );
  }
});
