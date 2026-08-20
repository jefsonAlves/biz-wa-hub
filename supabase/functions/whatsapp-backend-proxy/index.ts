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
      "sincronizar novamente com a main e Preciso adequar a integração WhatsApp do projeto considerando a arquitetura atual.\n\nIMPORTANTE:\n\nO projeto usa Supabase/Lovable para banco, autenticação e Edge Functions, porém o Baileys precisa rodar em um processo Node.js persistente.\n\nPortanto:\n\nNÃO tente executar Baileys dentro de Supabase Edge Function.\n\nNÃO use n8n para manter sessão WhatsApp.\n\nNÃO torne Docker obrigatório.\n\nNÃO recrie Evolution API.\n\nUse o serviço Node já criado no repositório em:\n\nservices/whatsapp-baileys\n\n\nA arquitetura correta deve ser:\n\nFrontend Lovable\n      ↓\nSupabase / Edge Functions\n      ↓\nBackend Node.js Baileys\n      ↓\nWhatsApp\n\n\n1. O que o Supabase deve fazer\n\nO Supabase continua responsável por:\n\nautenticação;\n\ntenants/empresas;\n\nconexões cadastradas;\n\ncontatos;\n\nconversas;\n\nmensagens;\n\npermissões;\n\nEdge Functions;\n\npersistência dos dados da aplicação.\n\nO Supabase NÃO deve manter o socket do WhatsApp.\n\n2. O que o serviço Node.js Baileys deve fazer\n\nO serviço localizado em:\n\nservices/whatsapp-baileys\n\n\ndeve ser responsável por:\n\niniciar sessão;\n\ngerar QR Code;\n\nmanter conexão ativa;\n\npersistir credenciais;\n\nrestaurar sessões;\n\nenviar mensagens;\n\ndesconectar;\n\nconsultar status;\n\nsuportar múltiplas sessões.\n\n3. Configuração necessária no Supabase\n\nAdicione como secret do projeto:\n\nWHATSAPP_BACKEND_URL\n\n\nEssa variável deve apontar para a URL pública do serviço Node.js Baileys.\n\nExemplo:\n\nWHATSAPP_BACKEND_URL=https://whatsapp.meudominio.com.br\n\n\nOpcionalmente, se for utilizada autenticação no serviço:\n\nWHATSAPP_BACKEND_TOKEN=meu_token_seguro\n\n\n4. Não pedir esses dados ao usuário final\n\nA URL do backend e o token são configurações da plataforma.\n\nNão apresentar na interface:\n\nURL do backend;\n\ntoken;\n\ne-mail;\n\nsenha;\n\nconfiguração Baileys.\n\nO usuário final deve apenas ver:\n\nAdicionar WhatsApp\nConectar WhatsApp\nQR Code\nStatus\nDesconectar\n\n\n5. Fluxo de conexão\n\nAo clicar em:\n\nConectar WhatsApp\n\n\no frontend deve chamar a Edge Function:\n\nwhatsapp-backend-proxy\n\n\ncom:\n\n{\n  \"action\": \"start_session\",\n  \"connection_id\": \"...\"\n}\n\n\nA Edge Function deve obter:\n\nWHATSAPP_BACKEND_URL\n\n\ne então chamar o serviço Node.js.\n\nExemplo conceitual:\n\nPOST https://whatsapp.meudominio.com.br/whatsappsession/{sessionId}\n\n\n6. Consulta do QR Code\n\nA atualização deve chamar:\n\n{\n  \"action\": \"refresh_status\",\n  \"connection_id\": \"...\"\n}\n\n\nA Edge Function consulta o backend Node.js.\n\nO backend deverá retornar algo como:\n\n{\n  \"status\": \"QRCODE\",\n  \"qrcode\": \"conteudo_do_qr\",\n  \"number\": null\n}\n\n\nDepois o Supabase deve atualizar:\n\nwhatsapp_connections.status\nwhatsapp_connections.qr_status\nwhatsapp_connections.metadata.qr_code\n\n\n7. Não gerar erro se backend estiver ausente\n\nSe WHATSAPP_BACKEND_URL não estiver configurado:\n\nNÃO retornar:\n\n409\n503\nRUNTIME_ERROR\nblank screen\n\n\nRetornar HTTP 200 com:\n\n{\n  \"success\": false,\n  \"backend_configured\": false,\n  \"status\": \"disconnected\",\n  \"has_qr\": false,\n  \"message\": \"Serviço WhatsApp ainda não configurado.\"\n}\n\n\nO frontend deve mostrar somente uma mensagem amigável.\n\n8. O que não fazer\n\nNão usar:\n\nFrontend → n8n → WhatsApp\n\n\nNão usar:\n\nFrontend → Supabase Edge Function → Baileys\n\n\ncomo processo persistente.\n\nEdge Function apenas atua como proxy seguro.\n\n9. n8n\n\nn8n permanece opcional para automações.\n\nExemplo:\n\nMensagem recebida\n      ↓\nBackend\n      ↓\nSupabase\n      ↓\nn8n opcional\n\n\nA conexão principal do WhatsApp deve funcionar sem n8n.\n\n10. Critério de funcionamento\n\nSó considerar concluído quando:\n\nusuário cadastra conexão;\n\ncadastro é salvo no Supabase;\n\nusuário clica em Conectar;\n\nEdge Function chama o serviço Node;\n\nBaileys inicia sessão;\n\nQR Code é retornado;\n\nQR aparece no Lovable;\n\nusuário escaneia;\n\nstatus muda para Conectado;\n\nmensagens podem ser recebidas e enviadas.\n\n11. Muito importante\n\nO serviço Node.js precisa ser publicado em um ambiente que execute processos persistentes, como:\n\nVPS;\n\nRailway;\n\nRender;\n\nFly.io;\n\nservidor Node próprio.\n\nO Supabase não substitui esse processo persistente.\n\nPortanto, o Lovable deve adaptar o projeto para consumir esse serviço, não tentar reimplementar Baileys dentro das Edge Functions. faça no final um sheklist para ver se foi implementado tudo descrito aqui e agindo conforme pedido",
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