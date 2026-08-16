import { supabase } from "@/integrations/supabase/client";

/**
 * Provider-agnostic WhatsApp layer.
 * The frontend never talks to a WhatsApp provider directly — every call goes
 * through a secure Edge Function that dispatches events to n8n.
 */

export type ConnectionCommand =
  | "create_session"
  | "generate_qr"
  | "get_status"
  | "disconnect"
  | "reconnect"
  | "logout"
  | "health_check"
  | "sync_messages";

export interface SafeConnection {
  id: string;
  name: string;
  phone_number: string | null;
  provider_type: string;
  status: string;
  qr_status: string | null;
  qr_code: string | null;
  qr_expires_at: string | null;
  webhook_status: string | null;
  has_credentials: boolean;
  last_connected_at: string | null;
  last_disconnected_at: string | null;
  last_health_check_at: string | null;
  connection_error: string | null;
  created_at: string;
}

/** Lists the tenant's connections with credentials masked server-side. */
export async function listConnections({ queryKey }: any): Promise<SafeConnection[]> {
  const [_, tenantId] = queryKey;
  const { data, error } = await supabase.rpc("get_whatsapp_connections_safe", {
    _tenant_id: tenantId || null
  });
  if (error) throw error;
  return (data ?? []) as SafeConnection[];
}

export async function sendConnectionCommand(
  connectionId: string,
  command: ConnectionCommand,
  options?: { confirmDisconnect?: boolean },
) {
  const { data, error } = await supabase.functions.invoke("whatsapp-connection-command", {
    body: {
      connection_id: connectionId,
      command,
      confirm_disconnect: options?.confirmDisconnect === true,
    },
  });
  if (error) throw error;
  if (data?.error) throw new Error(data.error);
  return data as { success: boolean; event_id?: string; warning?: string };
}

export async function deleteConnection(connectionId: string, options?: { confirmDelete?: boolean }) {
  const { data, error } = await supabase.functions.invoke("whatsapp-connection-command", {
    body: {
      connection_id: connectionId,
      command: "delete_connection",
      confirm_delete: options?.confirmDelete === true,
    },
  });
  if (error) throw error;
  if (data?.error) throw new Error(data.details || data.error);
  return data as { success: boolean; deleted_id?: string };
}

export interface N8nDiagnostics {
  tenant_id: string;
  integration:
    | { found: false }
    | {
        found: true;
        name: string;
        status: string;
        scope: "tenant" | "global";
        target: string | null;
        last_success_at: string | null;
        last_error_at: string | null;
        last_error_message: string | null;
      };
  secret_configured: boolean;
  outbox?: { 
    pending: number; 
    processing: number;
    sent: number;
    failed: number; 
    dead: number;
    total_active: number;
  };
  last_delivery?: {
    created_at: string;
    success: boolean;
    http_status: number | null;
    error_message: string | null;
    duration_ms: number | null;
  } | null;
  last_inbound_event?: { received_at: string; event_type: string; processing_status: string } | null;
  webhook?: {
    reachable: boolean;
    http_status?: number | null;
    duration_ms?: number;
    error?: string | null;
    response_excerpt?: string | null;
    target?: string | null;
  };
}

export async function diagnoseN8n(tenantId?: string | null) {
  const { data, error } = await supabase.functions.invoke("n8n-test-connection", {
    body: { tenant_id: tenantId ?? null },
  });
  if (error) throw error;
  if (data?.error) throw new Error(data.error);
  return data as { success: boolean; diagnostics: N8nDiagnostics };
}


export async function sendMessage(params: {
  conversationId: string;
  content: string;
  messageType?: string;
  mediaUrl?: string | null;
  connectionId?: string | null;
  mode?: "send" | "suggest";
}) {
  const { data, error } = await supabase.functions.invoke("whatsapp-send-message", {
    body: {
      conversation_id: params.conversationId,
      content: params.content,
      message_type: params.messageType ?? "text",
      media_url: params.mediaUrl ?? null,
      connection_id: params.connectionId ?? null,
      mode: params.mode ?? "send",
    },
  });
  if (error) throw error;
  if (data?.error) throw new Error(data.error);
  return data as { success: boolean; message_id?: string; warning?: string };
}

export async function testN8nIntegration(params?: { 
  tenant_id?: string | null; 
  use_global?: boolean;
  action?: "reprocess_queue" | "archive_dead";
  days?: number;
}) {
  const { data, error } = await supabase.functions.invoke("n8n-test-connection", {
    body: {
      tenant_id: params?.tenant_id ?? null,
      use_global: params?.use_global ?? false,
      action: params?.action,
      days: params?.days
    },
  });
  if (error) throw error;
  if (data?.error) throw new Error(data.error);
  return data as { success?: boolean; diagnostics?: N8nDiagnostics; http_status?: number; target?: string; affected_count?: number; message?: string };
}

export async function dispatchEvent(payload: {
  event_type: string;
  connection_id?: string | null;
  conversation_id?: string | null;
  data?: Record<string, unknown>;
}) {
  const { data, error } = await supabase.functions.invoke("n8n-dispatch-event", { body: payload });
  if (error) throw error;
  if (data?.error) throw new Error(data.error);
  return data;
}

export const CONNECTION_STATUS_LABELS: Record<string, string> = {
  connected: "Conectado",
  connecting: "Conectando",
  disconnecting: "Desconectando",
  disconnected: "Desconectado",
  qr_pending: "Aguardando QR",
  error: "Erro",
};
