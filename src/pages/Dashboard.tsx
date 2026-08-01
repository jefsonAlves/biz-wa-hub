import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/hooks/useAuth";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { MessageSquare, Users, Clock, TrendingUp } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";

const Dashboard = () => {
  const { profile, isSuperAdmin, isTenantAdmin } = useAuth();
  const tenantId = profile?.tenant_id;

  const { data: stats } = useQuery({
    queryKey: ["dashboard-stats", tenantId],
    queryFn: async () => {
      if (!tenantId) return { conversations: 0, contacts: 0, messagesToday: 0 };
      const [convRes, contactRes, msgRes] = await Promise.all([
        supabase.from("conversations").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId).in("status", ["open", "waiting"]),
        supabase.from("contacts").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId),
        supabase.from("messages").select("id, conversation_id").eq("role", "contact"),
      ]);
      return {
        conversations: convRes.count || 0,
        contacts: contactRes.count || 0,
        messagesToday: 0,
      };
    },
    enabled: !!tenantId,
  });

  const { data: chartData = [] } = useQuery({
    queryKey: ["dashboard-chart", tenantId],
    queryFn: async () => {
      if (!tenantId) return [];
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      const { data } = await supabase
        .from("messages")
        .select("created_at")
        .gte("created_at", sevenDaysAgo.toISOString());
      if (!data) return [];
      const grouped: Record<string, number> = {};
      data.forEach(m => {
        const day = new Date(m.created_at).toLocaleDateString("pt-BR", { weekday: "short" });
        grouped[day] = (grouped[day] || 0) + 1;
      });
      return Object.entries(grouped).map(([name, total]) => ({ name, total }));
    },
    enabled: !!tenantId,
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Dashboard</h1>
        <p className="text-muted-foreground">Bem-vindo, {profile?.full_name || "Usuário"}!</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Conversas Ativas</CardTitle>
            <MessageSquare className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.conversations ?? 0}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Contatos</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.contacts ?? 0}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Tempo Médio</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">--</div>
            <p className="text-xs text-muted-foreground">Tempo de resposta</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Mensagens Hoje</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.messagesToday ?? 0}</div>
          </CardContent>
        </Card>
      </div>

      {chartData.length > 0 && (
        <Card>
          <CardHeader><CardTitle>Mensagens nos últimos 7 dias</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={chartData}>
                <XAxis dataKey="name" />
                <YAxis />
                <Tooltip />
                <Bar dataKey="total" fill="hsl(142 76% 36%)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader><CardTitle>Primeiros Passos</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <p className="text-muted-foreground">Configure sua conta para começar:</p>
          <ol className="list-decimal list-inside space-y-2 text-sm text-muted-foreground">
            {(isSuperAdmin || isTenantAdmin) && (
              <>
                <li>Conecte seu WhatsApp via Z-API nas Configurações</li>
                <li>Configure os departamentos</li>
                <li>Adicione agentes IA</li>
                <li>Convide membros da equipe</li>
              </>
            )}
            <li>Comece a atender pelo Inbox</li>
          </ol>
        </CardContent>
      </Card>
    </div>
  );
};

export default Dashboard;
