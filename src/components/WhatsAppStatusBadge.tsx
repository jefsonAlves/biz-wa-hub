import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";

export function WhatsAppStatusBadge() {
  const { profile } = useAuth();
  const tenantId = profile?.tenant_id;

  const { data } = useQuery({
    queryKey: ["whatsapp-status-badge", tenantId],
    queryFn: async () => {
      if (!tenantId) return null;
      const { data: conn } = await supabase
        .from("whatsapp_connections")
        .select("zapi_instance_id, zapi_token, api_url, status")
        .eq("tenant_id", tenantId)
        .maybeSingle();
      if (!conn || conn.status !== "connected") return { isOnline: false, status: conn?.status };

      try {
        const { data: statusData } = await supabase.functions.invoke("green-api-status", {
          body: {
            instance_id: conn.zapi_instance_id,
            token: conn.zapi_token,
            api_url: conn.api_url || "https://api.green-api.com",
          },
        });
        return { isOnline: statusData?.is_online, isConnected: statusData?.is_connected, status: statusData?.state };
      } catch {
        return { isOnline: false };
      }
    },
    enabled: !!tenantId,
    refetchInterval: 30000, // poll every 30s
    staleTime: 25000,
  });

  if (!data) return null;

  return (
    <div className={cn(
      "flex items-center gap-1.5 text-xs px-2 py-1 rounded-full",
      data.isOnline ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"
    )}>
      <span className={cn("w-1.5 h-1.5 rounded-full", data.isOnline ? "bg-primary animate-pulse" : "bg-muted-foreground")} />
      WhatsApp {data.isOnline ? "Online" : "Offline"}
    </div>
  );
}
