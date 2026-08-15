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

export async function testN8nIntegration() {
  const { data, error } = await supabase.functions.invoke("n8n-test-connection", { body: {} });
  if (error) throw error;
  return data as { success?: boolean; error?: string; http_status?: number; target?: string };
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
