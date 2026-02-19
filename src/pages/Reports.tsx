import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, LineChart, Line, PieChart, Pie, Cell } from "recharts";
import { MessageSquare, Clock, TrendingUp, Bot, Users, CheckCircle } from "lucide-react";
import { useState } from "react";

const periods = [
  { key: "7", label: "7 dias" },
  { key: "30", label: "30 dias" },
  { key: "90", label: "90 dias" },
];

const Reports = () => {
  const { profile } = useAuth();
  const tenantId = profile?.tenant_id;
  const [period, setPeriod] = useState("7");

  const { data: stats } = useQuery({
    queryKey: ["reports-stats", tenantId, period],
    queryFn: async () => {
      if (!tenantId) return null;
      const since = new Date();
      since.setDate(since.getDate() - parseInt(period));
      const sinceStr = since.toISOString();

      const [convRes, msgRes, closedRes, aiRes] = await Promise.all([
        supabase.from("conversations").select("id, status, ai_paused, created_at")
          .eq("tenant_id", tenantId).gte("created_at", sinceStr),
        supabase.from("messages").select("id, role, created_at, conversation_id")
          .gte("created_at", sinceStr),
        supabase.from("conversations").select("id, created_at, closed_at")
          .eq("tenant_id", tenantId).eq("status", "closed").gte("created_at", sinceStr),
        supabase.from("conversations").select("id, ai_paused")
          .eq("tenant_id", tenantId),
      ]);

      const conversations = convRes.data || [];
      const messages = msgRes.data || [];
      const closed = closedRes.data || [];
      const allConvs = aiRes.data || [];

      const incomingMsgs = messages.filter(m => m.role === "contact").length;
      const outgoingMsgs = messages.filter(m => m.role !== "contact").length;
      const aiReplies = messages.filter(m => m.role === "ai").length;
      const agentReplies = messages.filter(m => m.role === "agent").length;

      const aiActive = allConvs.filter(c => !c.ai_paused).length;
      const aiPaused = allConvs.filter(c => c.ai_paused).length;

      // Avg first response time (minutes)
      let avgResponseTime = 0;
      if (closed.length > 0) {
        const times = closed.filter(c => c.closed_at).map(c => {
          const diff = new Date(c.closed_at!).getTime() - new Date(c.created_at).getTime();
          return diff / 1000 / 60; // minutes
        });
        avgResponseTime = times.length > 0 ? Math.round(times.reduce((a, b) => a + b, 0) / times.length) : 0;
      }

      return {
        totalConversations: conversations.length,
        openConversations: conversations.filter(c => c.status === "open").length,
        closedConversations: closed.length,
        incomingMsgs,
        outgoingMsgs,
        aiReplies,
        agentReplies,
        aiActive,
        aiPaused,
        avgResponseTime,
      };
    },
    enabled: !!tenantId,
  });

  const { data: dailyData = [] } = useQuery({
    queryKey: ["reports-daily", tenantId, period],
    queryFn: async () => {
      if (!tenantId) return [];
      const since = new Date();
      since.setDate(since.getDate() - parseInt(period));

      const { data: messages } = await supabase
        .from("messages")
        .select("created_at, role")
        .gte("created_at", since.toISOString());

      if (!messages) return [];

      const grouped: Record<string, { date: string; recebidas: number; enviadas: number; ia: number }> = {};
      messages.forEach(m => {
        const date = new Date(m.created_at).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
        if (!grouped[date]) grouped[date] = { date, recebidas: 0, enviadas: 0, ia: 0 };
        if (m.role === "contact") grouped[date].recebidas++;
        else if (m.role === "agent") grouped[date].enviadas++;
        else if (m.role === "ai") grouped[date].ia++;
      });

      return Object.values(grouped).sort((a, b) => a.date.localeCompare(b.date));
    },
    enabled: !!tenantId,
  });

  const aiPieData = [
    { name: "IA Ativa", value: stats?.aiActive || 0, color: "hsl(var(--primary))" },
    { name: "IA Pausada", value: stats?.aiPaused || 0, color: "hsl(var(--muted-foreground))" },
  ];

  const msgPieData = [
    { name: "IA", value: stats?.aiReplies || 0, color: "hsl(var(--primary))" },
    { name: "Agente", value: stats?.agentReplies || 0, color: "hsl(var(--secondary))" },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-bold">Relatórios</h1>
          <p className="text-muted-foreground">Visão geral do atendimento</p>
        </div>
        <div className="flex gap-1">
          {periods.map(p => (
            <button
              key={p.key}
              onClick={() => setPeriod(p.key)}
              className={`px-3 py-1.5 text-sm rounded-lg transition-colors ${
                period === p.key ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-accent"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {[
          { label: "Conversas", value: stats?.totalConversations ?? 0, icon: MessageSquare, color: "text-primary" },
          { label: "Abertas", value: stats?.openConversations ?? 0, icon: TrendingUp, color: "text-primary" },
          { label: "Fechadas", value: stats?.closedConversations ?? 0, icon: CheckCircle, color: "text-primary" },
          { label: "Recebidas", value: stats?.incomingMsgs ?? 0, icon: Users, color: "text-primary" },
          { label: "Respostas IA", value: stats?.aiReplies ?? 0, icon: Bot, color: "text-primary" },
          { label: "Tempo médio", value: stats?.avgResponseTime ? `${stats.avgResponseTime}m` : "--", icon: Clock, color: "text-primary" },
        ].map(({ label, value, icon: Icon, color }) => (
          <Card key={label} className="bg-card">
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-1">
                <p className="text-xs text-muted-foreground">{label}</p>
                <Icon className={`h-4 w-4 ${color}`} />
              </div>
              <p className="text-2xl font-bold">{value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Tabs defaultValue="messages">
        <TabsList>
          <TabsTrigger value="messages">Mensagens</TabsTrigger>
          <TabsTrigger value="ai">IA vs Agente</TabsTrigger>
        </TabsList>

        <TabsContent value="messages">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Mensagens por dia</CardTitle>
            </CardHeader>
            <CardContent>
              {dailyData.length === 0 ? (
                <div className="h-[200px] flex items-center justify-center text-muted-foreground">
                  <p className="text-sm">Nenhum dado no período</p>
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={250}>
                  <BarChart data={dailyData}>
                    <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Bar dataKey="recebidas" name="Recebidas" fill="hsl(var(--muted-foreground))" radius={[3, 3, 0, 0]} />
                    <Bar dataKey="enviadas" name="Enviadas (Agente)" fill="hsl(var(--primary))" radius={[3, 3, 0, 0]} />
                    <Bar dataKey="ia" name="Enviadas (IA)" fill="hsl(var(--secondary))" radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="ai">
          <div className="grid md:grid-cols-2 gap-4">
            <Card>
              <CardHeader><CardTitle className="text-base">Conversas: IA ativa vs pausada</CardTitle></CardHeader>
              <CardContent>
                {stats && (stats.aiActive + stats.aiPaused) > 0 ? (
                  <ResponsiveContainer width="100%" height={200}>
                    <PieChart>
                      <Pie data={aiPieData} cx="50%" cy="50%" outerRadius={70} dataKey="value" label={({ name, value }) => `${name}: ${value}`}>
                        {aiPieData.map((entry, index) => (
                          <Cell key={index} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-[200px] flex items-center justify-center text-muted-foreground text-sm">Sem dados</div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle className="text-base">Respostas: IA vs Agente</CardTitle></CardHeader>
              <CardContent>
                {stats && (stats.aiReplies + stats.agentReplies) > 0 ? (
                  <ResponsiveContainer width="100%" height={200}>
                    <PieChart>
                      <Pie data={msgPieData} cx="50%" cy="50%" outerRadius={70} dataKey="value" label={({ name, value }) => `${name}: ${value}`}>
                        {msgPieData.map((entry, index) => (
                          <Cell key={index} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-[200px] flex items-center justify-center text-muted-foreground text-sm">Sem dados</div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default Reports;
