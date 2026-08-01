import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";
import { listConnections } from "@/lib/whatsapp/provider";

export function WhatsAppStatusBadge() {
  const { profile } = useAuth();
  const tenantId = profile?.tenant_id;

  const { data } = useQuery({
    queryKey: ["whatsapp-status-badge", tenantId],
    queryFn: async () => {
      const connections = await listConnections();
      if (connections.length === 0) return { total: 0, online: 0 };
      return {
        total: connections.length,
        online: connections.filter((c) => c.status === "connected").length,
      };
    },
    enabled: !!tenantId,
    refetchInterval: 30000,
    staleTime: 25000,
  });

  if (!data || data.total === 0) return null;

  const isOnline = data.online > 0;

  return (
    <div className={cn(
      "flex items-center gap-1.5 text-xs px-2 py-1 rounded-full",
      isOnline ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"
    )}>
      <span className={cn("w-1.5 h-1.5 rounded-full", isOnline ? "bg-primary animate-pulse" : "bg-muted-foreground")} />
      WhatsApp {isOnline ? `${data.online}/${data.total} online` : "Offline"}
    </div>
  );
}
