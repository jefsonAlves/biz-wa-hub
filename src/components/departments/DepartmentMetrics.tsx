import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { BarChart3, Clock, MessageSquare, Send, Sparkles, Timer } from "lucide-react";

type Range = "today" | "7d" | "30d";

interface Row {
  department_id: string | null;
  department_name: string;
  conversations_count: number;
  messages_sent: number;
  messages_received: number;
  new_conversations: number;
  new_inbound_conversations: number;
  awaiting_response: number;
  avg_wait_seconds: number;
  max_wait_seconds: number;
}

const rangeLabels: Record<Range, string> = {
  today: "Hoje",
  "7d": "7 dias",
  "30d": "30 dias",
};

const formatDuration = (seconds: number) => {
  if (!seconds || seconds <= 0) return "—";
  const s = Math.round(seconds);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${s % 60}s`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
};

const getRange = (range: Range) => {
  const to = new Date();
  const from = new Date();
  if (range === "today") {
    from.setHours(0, 0, 0, 0);
  } else {
    from.setDate(from.getDate() - (range === "7d" ? 7 : 30));
  }
  return { from: from.toISOString(), to: to.toISOString() };
};

export const DepartmentMetrics = () => {
  const [range, setRange] = useState<Range>("today");
  const { from, to } = useMemo(() => getRange(range), [range]);

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["department-metrics", from, to],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_department_metrics", { _from: from, _to: to });
      if (error) throw error;
      return (data ?? []) as Row[];
    },
    refetchInterval: 60_000,
  });

  const totals = useMemo(
    () =>
      rows.reduce(
        (acc, r) => ({
          conversations: acc.conversations + Number(r.conversations_count),
          sent: acc.sent + Number(r.messages_sent),
          received: acc.received + Number(r.messages_received),
          newLeads: acc.newLeads + Number(r.new_inbound_conversations),
          awaiting: acc.awaiting + Number(r.awaiting_response),
          waitSum: acc.waitSum + Number(r.avg_wait_seconds) * Number(r.new_inbound_conversations),
          waitWeight: acc.waitWeight + Number(r.new_inbound_conversations),
        }),
        { conversations: 0, sent: 0, received: 0, newLeads: 0, awaiting: 0, waitSum: 0, waitWeight: 0 },
      ),
    [rows],
  );

  const avgWait = totals.waitWeight > 0 ? totals.waitSum / totals.waitWeight : 0;

  const cards = [
    { label: "Atendimentos", value: totals.conversations, icon: BarChart3 },
    { label: "Mensagens enviadas", value: totals.sent, icon: Send },
    { label: "Mensagens recebidas", value: totals.received, icon: MessageSquare },
    { label: "Novas mensagens (potenciais clientes)", value: totals.newLeads, icon: Sparkles },
    { label: "Aguardando resposta", value: totals.awaiting, icon: Clock },
    { label: "Espera média até 1ª resposta", value: formatDuration(avgWait), icon: Timer },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold">Desempenho por setor</h2>
          <p className="text-sm text-muted-foreground">
            Toda conversa que recebeu mensagem do contato no período conta como nova mensagem / potencial cliente.
          </p>
        </div>
        <div className="flex gap-2">
          {(Object.keys(rangeLabels) as Range[]).map((r) => (
            <Button key={r} size="sm" variant={range === r ? "default" : "outline"} onClick={() => setRange(r)}>
              {rangeLabels[r]}
            </Button>
          ))}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map(({ label, value, icon: Icon }) => (
          <Card key={label}>
            <CardContent className="flex items-center gap-3 p-4">
              <div className="rounded-md bg-muted p-2">
                <Icon className="h-4 w-4 text-muted-foreground" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">{label}</p>
                <p className="text-2xl font-bold">{value}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Detalhamento por setor — {rangeLabels[range]}</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {isLoading ? (
            <p className="py-8 text-center text-muted-foreground">Carregando métricas...</p>
          ) : rows.length === 0 ? (
            <p className="py-8 text-center text-muted-foreground">Sem dados no período.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Setor</TableHead>
                  <TableHead className="text-right">Atendimentos</TableHead>
                  <TableHead className="text-right">Enviadas</TableHead>
                  <TableHead className="text-right">Recebidas</TableHead>
                  <TableHead className="text-right">Novas mensagens</TableHead>
                  <TableHead className="text-right">Aguardando</TableHead>
                  <TableHead className="text-right">Espera média</TableHead>
                  <TableHead className="text-right">Maior espera</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.department_id ?? "none"}>
                    <TableCell className="font-medium">
                      {r.department_name}
                      {!r.department_id && (
                        <Badge variant="outline" className="ml-2">
                          não atribuído
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right">{r.conversations_count}</TableCell>
                    <TableCell className="text-right">{r.messages_sent}</TableCell>
                    <TableCell className="text-right">{r.messages_received}</TableCell>
                    <TableCell className="text-right font-semibold">{r.new_inbound_conversations}</TableCell>
                    <TableCell className="text-right">
                      {Number(r.awaiting_response) > 0 ? (
                        <Badge variant="destructive">{r.awaiting_response}</Badge>
                      ) : (
                        0
                      )}
                    </TableCell>
                    <TableCell className="text-right">{formatDuration(Number(r.avg_wait_seconds))}</TableCell>
                    <TableCell className="text-right">{formatDuration(Number(r.max_wait_seconds))}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default DepartmentMetrics;
