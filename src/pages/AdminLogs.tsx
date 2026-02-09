import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { FileText } from "lucide-react";

const levelColor = (l: string) => l === "error" || l === "critical" ? "destructive" : l === "warn" ? "secondary" : "default";

const AdminLogs = () => {
  const [levelFilter, setLevelFilter] = useState("all");
  const [search, setSearch] = useState("");

  const { data: logs = [], isLoading } = useQuery({
    queryKey: ["admin-logs", levelFilter],
    queryFn: async () => {
      let q = supabase.from("system_logs").select("*").order("created_at", { ascending: false }).limit(200);
      if (levelFilter !== "all") q = q.eq("level", levelFilter as "info" | "warn" | "error" | "critical");
      const { data, error } = await q;
      if (error) throw error;
      return data;
    },
  });

  const filtered = search ? logs.filter(l => l.action.toLowerCase().includes(search.toLowerCase())) : logs;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Logs do Sistema</h1>
        <p className="text-muted-foreground">Auditoria e logs de todas as ações</p>
      </div>
      <div className="flex gap-4">
        <Input placeholder="Buscar por ação..." value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-sm" />
        <Select value={levelFilter} onValueChange={setLevelFilter}>
          <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            <SelectItem value="info">Info</SelectItem>
            <SelectItem value="warn">Warn</SelectItem>
            <SelectItem value="error">Error</SelectItem>
            <SelectItem value="critical">Critical</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><FileText className="h-5 w-5" />Logs ({filtered.length})</CardTitle></CardHeader>
        <CardContent>
          {isLoading ? <p className="text-center py-8 text-muted-foreground">Carregando...</p> : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Data</TableHead>
                  <TableHead>Nível</TableHead>
                  <TableHead>Ação</TableHead>
                  <TableHead>Detalhes</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map(log => (
                  <TableRow key={log.id}>
                    <TableCell className="text-sm text-muted-foreground whitespace-nowrap">{new Date(log.created_at).toLocaleString("pt-BR")}</TableCell>
                    <TableCell><Badge variant={levelColor(log.level)}>{log.level}</Badge></TableCell>
                    <TableCell className="font-medium">{log.action}</TableCell>
                    <TableCell className="text-sm text-muted-foreground max-w-xs truncate">{log.details ? JSON.stringify(log.details) : "—"}</TableCell>
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

export default AdminLogs;
