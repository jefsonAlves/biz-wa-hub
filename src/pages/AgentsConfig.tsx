import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { Plus, Bot, Pencil, Trash2 } from "lucide-react";

const MODELS = [
  { value: "google/gemini-3-flash-preview", label: "Gemini 3 Flash (Rápido)" },
  { value: "google/gemini-2.5-flash", label: "Gemini 2.5 Flash (Balanceado)" },
  { value: "google/gemini-2.5-pro", label: "Gemini 2.5 Pro (Avançado)" },
  { value: "openai/gpt-5-mini", label: "GPT-5 Mini" },
  { value: "openai/gpt-5", label: "GPT-5 (Premium)" },
];

const AgentsConfig = () => {
  const { profile } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const tenantId = profile?.tenant_id;

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: "", persona: "", system_prompt: "", model: "google/gemini-3-flash-preview",
    temperature: 0.7, blocked_keywords: "" as string, is_active: true, department_id: "" as string,
  });

  const { data: agents = [], isLoading } = useQuery({
    queryKey: ["agents", tenantId],
    queryFn: async () => {
      if (!tenantId) return [];
      const { data, error } = await supabase.from("agents_config").select("*, departments(name)").eq("tenant_id", tenantId).order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!tenantId,
  });

  const { data: departments = [] } = useQuery({
    queryKey: ["departments", tenantId],
    queryFn: async () => {
      if (!tenantId) return [];
      const { data } = await supabase.from("departments").select("id, name").eq("tenant_id", tenantId);
      return data || [];
    },
    enabled: !!tenantId,
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!tenantId) throw new Error("Sem tenant");
      const payload = {
        name: form.name,
        persona: form.persona || null,
        system_prompt: form.system_prompt || null,
        model: form.model,
        temperature: form.temperature,
        blocked_keywords: form.blocked_keywords ? form.blocked_keywords.split(",").map(k => k.trim()) : [],
        is_active: form.is_active,
        department_id: form.department_id || null,
        tenant_id: tenantId,
      };
      if (editingId) {
        const { tenant_id: _, ...updatePayload } = payload;
        const { error } = await supabase.from("agents_config").update(updatePayload).eq("id", editingId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("agents_config").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["agents"] });
      toast({ title: editingId ? "Agente atualizado!" : "Agente criado!" });
      resetForm();
    },
    onError: (e: any) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("agents_config").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["agents"] });
      toast({ title: "Agente excluído!" });
    },
  });

  const resetForm = () => {
    setDialogOpen(false);
    setEditingId(null);
    setForm({ name: "", persona: "", system_prompt: "", model: "google/gemini-3-flash-preview", temperature: 0.7, blocked_keywords: "", is_active: true, department_id: "" });
  };

  const openEdit = (agent: any) => {
    setEditingId(agent.id);
    setForm({
      name: agent.name, persona: agent.persona || "", system_prompt: agent.system_prompt || "",
      model: agent.model || "google/gemini-3-flash-preview", temperature: agent.temperature ?? 0.7,
      blocked_keywords: (agent.blocked_keywords || []).join(", "), is_active: agent.is_active ?? true,
      department_id: agent.department_id || "",
    });
    setDialogOpen(true);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Agentes IA</h1>
          <p className="text-muted-foreground">Configure personas e prompts dos seus agentes</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={(o) => { if (!o) resetForm(); else setDialogOpen(true); }}>
          <DialogTrigger asChild>
            <Button><Plus className="h-4 w-4 mr-2" />Novo Agente</Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editingId ? "Editar Agente" : "Novo Agente"}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Nome</Label>
                  <Input value={form.name} onChange={(e) => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Ex: Assistente de Vendas" />
                </div>
                <div className="space-y-2">
                  <Label>Modelo</Label>
                  <Select value={form.model} onValueChange={(v) => setForm(f => ({ ...f, model: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {MODELS.map(m => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-2">
                <Label>Persona</Label>
                <Input value={form.persona} onChange={(e) => setForm(f => ({ ...f, persona: e.target.value }))} placeholder="Ex: Atendente simpático e prestativo" />
              </div>
              <div className="space-y-2">
                <Label>System Prompt</Label>
                <Textarea value={form.system_prompt} onChange={(e) => setForm(f => ({ ...f, system_prompt: e.target.value }))} placeholder="Instruções detalhadas para o agente..." rows={5} />
              </div>
              <div className="space-y-2">
                <Label>Temperatura: {form.temperature}</Label>
                <Slider value={[form.temperature]} onValueChange={(v) => setForm(f => ({ ...f, temperature: v[0] }))} min={0} max={1} step={0.1} />
              </div>
              <div className="space-y-2">
                <Label>Departamento (opcional)</Label>
                <Select value={form.department_id} onValueChange={(v) => setForm(f => ({ ...f, department_id: v === "none" ? "" : v }))}>
                  <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Nenhum</SelectItem>
                    {departments.map(d => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Keywords Bloqueadas (separadas por vírgula)</Label>
                <Input value={form.blocked_keywords} onChange={(e) => setForm(f => ({ ...f, blocked_keywords: e.target.value }))} placeholder="palavra1, palavra2" />
              </div>
              <div className="flex items-center gap-2">
                <Switch checked={form.is_active} onCheckedChange={(v) => setForm(f => ({ ...f, is_active: v }))} />
                <Label>Agente Ativo</Label>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={resetForm}>Cancelar</Button>
              <Button onClick={() => saveMutation.mutate()} disabled={!form.name.trim() || saveMutation.isPending}>
                {saveMutation.isPending ? "Salvando..." : "Salvar"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {isLoading ? (
        <p className="text-muted-foreground text-center py-8">Carregando...</p>
      ) : agents.length === 0 ? (
        <Card><CardContent className="text-center py-12 text-muted-foreground">Nenhum agente configurado. Crie o primeiro!</CardContent></Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {agents.map((agent: any) => (
            <Card key={agent.id}>
              <CardHeader className="flex flex-row items-start justify-between space-y-0">
                <div className="space-y-1">
                  <CardTitle className="flex items-center gap-2">
                    <Bot className="h-5 w-5" />{agent.name}
                  </CardTitle>
                  <p className="text-sm text-muted-foreground">{agent.persona || "Sem persona definida"}</p>
                </div>
                <Badge variant={agent.is_active ? "default" : "secondary"}>
                  {agent.is_active ? "Ativo" : "Inativo"}
                </Badge>
              </CardHeader>
              <CardContent className="space-y-2">
                <p className="text-xs text-muted-foreground">Modelo: {MODELS.find(m => m.value === agent.model)?.label || agent.model}</p>
                <p className="text-xs text-muted-foreground">Temp: {agent.temperature}</p>
                {agent.departments && <p className="text-xs text-muted-foreground">Dept: {agent.departments.name}</p>}
                <div className="flex gap-1 pt-2">
                  <Button variant="outline" size="sm" onClick={() => openEdit(agent)}><Pencil className="h-3 w-3 mr-1" />Editar</Button>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="outline" size="sm"><Trash2 className="h-3 w-3 mr-1 text-destructive" />Excluir</Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Excluir agente?</AlertDialogTitle>
                        <AlertDialogDescription>Esta ação não pode ser desfeita.</AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                        <AlertDialogAction onClick={() => deleteMutation.mutate(agent.id)}>Excluir</AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};

export default AgentsConfig;
