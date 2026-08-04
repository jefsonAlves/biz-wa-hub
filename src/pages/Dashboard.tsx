import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/hooks/useAuth";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { MessageSquare, Users, Clock, TrendingUp, Shield, Bot } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";

const startOfTodayIso = () => {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  return date.toISOString();
};

const Dashboard = () => {
  const { profile, isSuperAdmin, isTenantAdmin } = useAuth();
  const tenantId = profile?.tenant_id;

  const { data: stats } = useQuery({
    queryKey: ["dashboard-stats", tenantId],
    queryFn: async () => {
      if (!tenantId) return { conversations: 0, contacts: 0, messagesToday: 0 };

      const [convRes, contactRes, msgRes] = await Promise.all([
        supabase
          .from("conversations")
          .select("id", { count: "exact", head: true })
          .eq("tenant_id", tenantId)
          .in("status", ["open", "waiting"]),
        supabase
          .from("contacts")
          .select("id", { count: "exact", head: true })
          .eq("tenant_id", tenantId),
        supabase
          .from("messages")
          .select("id, conversations!inner(tenant_id)", { count: "exact", head: true })
          .eq("conversations.tenant_id", tenantId)
          .gte("created_at", startOfTodayIso()),
      ]);

      if (convRes.error) throw convRes.error;
      if (contactRes.error) throw contactRes.error;
      if (msgRes.error) throw msgRes.error;

      return {
        conversations: convRes.count ?? 0,
        contacts: contactRes.count ?? 0,
        messagesToday: msgRes.count ?? 0,
      };
    },
    enabled: !!tenantId,
    refetchInterval: 15000,
  });

  const { data: chartData = [] } = useQuery({
    queryKey: ["dashboard-chart", tenantId],
    queryFn: async () => {
      if (!tenantId) return [];
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6);
      sevenDaysAgo.setHours(0, 0, 0, 0);

      const { data, error } = await supabase
        .from("messages")
        .select("created_at, conversations!inner(tenant_id)")
        .eq("conversations.tenant_id", tenantId)
        .gte("created_at", sevenDaysAgo.toISOString())
        .order("created_at", { ascending: true });

      if (error) throw error;

      const grouped = new Map<string, number>();
      for (let index = 0; index < 7; index += 1) {
        const day = new Date(sevenDaysAgo);
        day.setDate(sevenDaysAgo.getDate() + index);
        const key = day.toISOString().slice(0, 10);
        grouped.set(key, 0);
      }

      for (const message of data ?? []) {
        const key = new Date(message.created_at).toISOString().slice(0, 10);
        grouped.set(key, (grouped.get(key) ?? 0) + 1);
      }

      return Array.from(grouped.entries()).map(([date, total]) => ({
        name: new Date(`${date}T12:00:00`).toLocaleDateString("pt-BR", { weekday: "short" }),
        total,
      }));
    },
    enabled: !!tenantId,
    refetchInterval: 30000,
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900">Dashboard Operational</h1>
          <p className="text-slate-500">Visão consolidada de performance, SLA e atendimentos em tempo real.</p>
        </div>
        <div className="flex gap-1 bg-white p-1 rounded-lg border border-slate-200 shadow-sm">
          {["24h", "7d", "30d", "90d"].map(t => (
            <button key={t} className={`px-4 py-1.5 text-xs font-medium rounded-md transition-colors ${t === "7d" ? "bg-primary text-white" : "text-slate-600 hover:bg-slate-50"}`}>
              {t}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="border-none shadow-sm overflow-hidden group">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-slate-500">Total de Atendimentos</CardTitle>
            <div className="bg-blue-50 p-2 rounded-full text-blue-600 group-hover:bg-blue-600 group-hover:text-white transition-colors">
              <MessageSquare className="h-4 w-4" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-slate-900">{stats?.conversations ?? 1855}</div>
            <div className="flex items-center gap-1 mt-1 text-xs font-medium text-emerald-600">
              <TrendingUp className="h-3 w-3" />
              <span>+14,2%</span>
            </div>
          </CardContent>
        </Card>
        <Card className="border-none shadow-sm overflow-hidden group">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-slate-500">Tempo Médio 1ª Resposta</CardTitle>
            <div className="bg-emerald-50 p-2 rounded-full text-emerald-600 group-hover:bg-emerald-600 group-hover:text-white transition-colors">
              <Clock className="h-4 w-4" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-slate-900">1m 56s</div>
            <div className="flex items-center gap-1 mt-1 text-xs font-medium text-emerald-600">
              <TrendingUp className="h-3 w-3 rotate-180" />
              <span>-24%</span>
            </div>
          </CardContent>
        </Card>
        <Card className="border-none shadow-sm overflow-hidden group">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-slate-500">SLA Cumprido</CardTitle>
            <div className="bg-emerald-50 p-2 rounded-full text-emerald-600 group-hover:bg-emerald-600 group-hover:text-white transition-colors">
              <Shield className="h-4 w-4" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-slate-900">94,8%</div>
            <div className="flex items-center gap-1 mt-1 text-xs font-medium text-emerald-600">
              <TrendingUp className="h-3 w-3" />
              <span>+2.1%</span>
            </div>
          </CardContent>
        </Card>
        <Card className="border-none shadow-sm overflow-hidden group">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-slate-500">Respostas por IA (RAG)</CardTitle>
            <div className="bg-cyan-50 p-2 rounded-full text-cyan-600 group-hover:bg-cyan-600 group-hover:text-white transition-colors">
              <Bot className="h-4 w-4" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-slate-900">62,4%</div>
            <div className="flex items-center gap-1 mt-1 text-xs font-medium text-emerald-600">
              <TrendingUp className="h-3 w-3" />
              <span>+18,5%</span>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2 border-none shadow-sm">
          <CardHeader>
            <CardTitle className="text-lg font-bold text-slate-900">Volume de Atendimentos & Resoluções por IA</CardTitle>
            <p className="text-xs text-slate-500">Evolução diária de atendimentos totais, SLA OK e respostas por IA</p>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={chartData.length > 0 ? chartData : [
                { name: "Seg", total: 240 },
                { name: "Ter", total: 300 },
                { name: "Qua", total: 280 },
                { name: "Qui", total: 350 },
                { name: "Sex", total: 400 },
                { name: "Sáb", total: 200 },
                { name: "Dom", total: 150 },
              ]}>
                <defs>
                  <linearGradient id="colorTotal" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(217 91% 47%)" stopOpacity={0.8}/>
                    <stop offset="95%" stopColor="hsl(217 91% 47%)" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fill: '#64748b', fontSize: 12}} dy={10} />
                <YAxis axisLine={false} tickLine={false} tick={{fill: '#64748b', fontSize: 12}} />
                <Tooltip 
                  contentStyle={{backgroundColor: '#fff', borderRadius: '8px', border: '1px solid #e2e8f0', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)'}}
                />
                <Bar dataKey="total" fill="url(#colorTotal)" radius={[6, 6, 0, 0]} barSize={40} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="border-none shadow-sm">
          <CardHeader>
            <CardTitle className="text-lg font-bold text-slate-900">SLA Geral de Atendimento</CardTitle>
            <p className="text-xs text-slate-500">Conformidade de prazos no período</p>
          </CardHeader>
          <CardContent className="flex flex-col items-center justify-center py-6">
            <div className="relative h-48 w-48 flex items-center justify-center">
              <svg className="w-full h-full transform -rotate-90">
                <circle cx="96" cy="96" r="80" stroke="currentColor" strokeWidth="12" fill="transparent" className="text-slate-100" />
                <circle cx="96" cy="96" r="80" stroke="currentColor" strokeWidth="12" fill="transparent" strokeDasharray={502.4} strokeDashoffset={502.4 * (1 - 0.94)} className="text-primary transition-all duration-1000" />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-4xl font-black text-slate-900">94%</span>
                <span className="text-xs font-bold text-slate-500 uppercase tracking-widest">SLA OK</span>
              </div>
            </div>
            <div className="w-full mt-8 space-y-4">
              <div className="flex justify-between items-center text-sm">
                <span className="text-slate-500">Tempo Médio Atendimento</span>
                <span className="font-semibold text-emerald-600 flex items-center gap-1">↓ 5m 54s</span>
              </div>
              <div className="flex justify-between items-center text-sm">
                <span className="text-slate-500">Tempo 1ª Resposta</span>
                <span className="font-semibold text-emerald-600 flex items-center gap-1">↓ 1m 56s</span>
              </div>
              <div className="flex justify-between items-center text-sm">
                <span className="text-slate-500">CSAT Médio</span>
                <span className="font-semibold text-slate-900">4.7 / 5.0 ⭐</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="border-none shadow-sm">
          <CardHeader>
            <CardTitle className="text-lg font-bold text-slate-900">Evolução do Tempo de Atendimento (Semanas)</CardTitle>
            <p className="text-xs text-slate-500">TMA (minutos) vs TMR (minutos)</p>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={[
                { name: "Sem 1", tma: 8, tmr: 2 },
                { name: "Sem 2", tma: 7, tmr: 1.5 },
                { name: "Sem 3", tma: 6.5, tmr: 2.2 },
                { name: "Sem 4", tma: 5.8, tmr: 1.8 },
              ]}>
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fill: '#64748b', fontSize: 12}} />
                <YAxis axisLine={false} tickLine={false} tick={{fill: '#64748b', fontSize: 12}} />
                <Tooltip />
                <Bar dataKey="tma" fill="hsl(217 91% 47%)" radius={[4, 4, 0, 0]} barSize={30} />
                <Bar dataKey="tmr" fill="hsl(199 100% 50%)" radius={[4, 4, 0, 0]} barSize={30} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="border-none shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-lg font-bold text-slate-900">Consumo do Plano Pro</CardTitle>
            </div>
            <button className="text-xs font-semibold text-primary hover:underline">Ver consumo →</button>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-slate-600">Usuários Ativos</span>
                <span className="font-bold text-slate-900">8 / 20</span>
              </div>
              <div className="w-full bg-slate-100 rounded-full h-2">
                <div className="bg-primary h-2 rounded-full" style={{width: '40%'}}></div>
              </div>
            </div>
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-slate-600">Números WhatsApp</span>
                <span className="font-bold text-slate-900">3 / 5</span>
              </div>
              <div className="w-full bg-slate-100 rounded-full h-2">
                <div className="bg-primary h-2 rounded-full" style={{width: '60%'}}></div>
              </div>
            </div>
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-slate-600">Tokens de IA (RAG)</span>
                <span className="font-bold text-slate-900">142.800 / 500.000</span>
              </div>
              <div className="w-full bg-slate-100 rounded-full h-2">
                <div className="bg-primary h-2 rounded-full" style={{width: '28%'}}></div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default Dashboard;
