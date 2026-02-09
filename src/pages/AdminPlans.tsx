import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { CreditCard, Pencil } from "lucide-react";

const AdminPlans = () => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<any>(null);

  const { data: plans = [], isLoading } = useQuery({
    queryKey: ["admin-plans"],
    queryFn: async () => {
      const { data, error } = await supabase.from("plan_configs").select("*").order("tier");
      if (error) throw error;
      return data;
    },
  });

  const updateMutation = useMutation({
    mutationFn: async () => {
      if (!editing) return;
      const { error } = await supabase.from("plan_configs").update({
        max_messages_per_month: editing.max_messages_per_month,
        max_agents: editing.max_agents,
        max_departments: editing.max_departments,
        max_knowledge_items: editing.max_knowledge_items,
      }).eq("id", editing.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-plans"] });
      toast({ title: "Plano atualizado!" });
      setEditing(null);
    },
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Planos</h1>
        <p className="text-muted-foreground">Gerencie os limites de cada plano</p>
      </div>
      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><CreditCard className="h-5 w-5" />Planos</CardTitle></CardHeader>
        <CardContent>
          {isLoading ? <p className="text-center py-8 text-muted-foreground">Carregando...</p> : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>Tier</TableHead>
                  <TableHead>Msgs/Mês</TableHead>
                  <TableHead>Agentes</TableHead>
                  <TableHead>Departamentos</TableHead>
                  <TableHead>Knowledge</TableHead>
                  <TableHead className="w-[80px]">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {plans.map(plan => (
                  <TableRow key={plan.id}>
                    <TableCell className="font-medium">{plan.name}</TableCell>
                    <TableCell>{plan.tier}</TableCell>
                    <TableCell>{plan.max_messages_per_month}</TableCell>
                    <TableCell>{plan.max_agents}</TableCell>
                    <TableCell>{plan.max_departments}</TableCell>
                    <TableCell>{plan.max_knowledge_items}</TableCell>
                    <TableCell>
                      <Button variant="ghost" size="icon" onClick={() => setEditing({ ...plan })}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Editar Plano: {editing?.name}</DialogTitle></DialogHeader>
          {editing && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Mensagens/Mês</Label>
                <Input type="number" value={editing.max_messages_per_month} onChange={(e) => setEditing({ ...editing, max_messages_per_month: parseInt(e.target.value) })} />
              </div>
              <div className="space-y-2">
                <Label>Máx. Agentes</Label>
                <Input type="number" value={editing.max_agents} onChange={(e) => setEditing({ ...editing, max_agents: parseInt(e.target.value) })} />
              </div>
              <div className="space-y-2">
                <Label>Máx. Departamentos</Label>
                <Input type="number" value={editing.max_departments} onChange={(e) => setEditing({ ...editing, max_departments: parseInt(e.target.value) })} />
              </div>
              <div className="space-y-2">
                <Label>Máx. Knowledge Items</Label>
                <Input type="number" value={editing.max_knowledge_items} onChange={(e) => setEditing({ ...editing, max_knowledge_items: parseInt(e.target.value) })} />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>Cancelar</Button>
            <Button onClick={() => updateMutation.mutate()} disabled={updateMutation.isPending}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AdminPlans;
