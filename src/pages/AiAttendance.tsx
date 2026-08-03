import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Bot, Sparkles, Save, MessageSquareDashed } from "lucide-react";
import { Link } from "react-router-dom";

const MODES = [
  { value: "off", label: "Desligada", description: "A IA não participa dos atendimentos." },
  { value: "suggest", label: "Sugerir respostas", description: "A IA sugere; o agente decide enviar." },
  { value: "auto", label: "Atendimento automático", description: "A IA responde o contato automaticamente." },
];

interface AiSettingsForm {
  mode: string;
  default_agent_id: string;
  fallback_department_id: string;
  business_hours_only: boolean;
  first_contact_only: boolean;
  greeting_message: string;
  handoff_keywords: string;
  max_auto_replies: number;
  response_delay_seconds: number;
}

const defaultForm: AiSettingsForm = {
  mode: "off",
  default_agent_id: "",
  fallback_department_id: "",
  business_hours_only: false,
  first_contact_only: false,
  greeting_message: "",
  handoff_keywords: "atendente, humano, pessoa",
  max_auto_replies: 5,
  response_delay_seconds: 2,
};

const AiAttendance = () => {
  const { profile, isTenantAdmin, isSuperAdmin } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const tenantId = profile?.tenant_id;
  const canManage = isTenantAdmin || isSuperAdmin;

  const [form, setForm] = useState<AiSettingsForm>(defaultForm);

  const { data: settings, isLoading } = useQuery({
    queryKey: ["ai-attendance-settings", tenantId],
    queryFn: async () => {
      if (!tenantId) return null;
      const { data, error } = await supabase
        .from("ai_attendance_settings")
        .select("*")
        .eq("tenant_id", tenantId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!tenantId,
  });

  const { data: agents = [] } = useQuery({
    queryKey: ["agents-list", tenantId],
    queryFn: async () => {
      if (!tenantId) return [];
      const { data } = await supabase
        .from("agents_config")
        .select("id, name, is_active")
        .eq("tenant_id", tenantId)
        .order("name");
      return data || [];
    },
    enabled: !!tenantId,
  });

  const { data: departments = [] } = useQuery({
    queryKey: ["departments-list", tenantId],
    queryFn: async () => {
      if (!tenantId) return [];
      const { data } = await supabase
        .from("departments")
        .select("id, name")
        .eq("tenant_id", tenantId)
        .order("name");
      return data || [];
    },
    enabled: !!tenantId,
  });

  useEffect(() => {
    if (settings) {
      setForm({
        mode: settings.mode ?? "off",
        default_agent_id: settings.default_agent_id ?? "",
        fallback_department_id: settings.fallback_department_id ?? "",
        business_hours_only: settings.business_hours_only ?? false,
        first_contact_only: settings.first_contact_only ?? false,
        greeting_message: settings.greeting_message ?? "",
        handoff_keywords: (settings.handoff_keywords ?? []).join(", "),
        max_auto_replies: settings.max_auto_replies ?? 5,
        response_delay_seconds: settings.response_delay_seconds ?? 2,
      });
    }
  }, [settings]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!tenantId) throw new Error("Sem empresa vinculada");
      const payload = {
        tenant_id: tenantId,
        mode: form.mode,
        default_agent_id: form.default_agent_id || null,
        fallback_department_id: form.fallback_department_id || null,
        business_hours_only: form.business_hours_only,
        first_contact_only: form.first_contact_only,
        greeting_message: form.greeting_message.trim() || null,
        handoff_keywords: form.handoff_keywords
          .split(",")
          .map((k) => k.trim())
          .filter(Boolean),
        max_auto_replies: Number(form.max_auto_replies) || 0,
        response_delay_seconds: Number(form.response_delay_seconds) || 0,
      };
      const { error } = await supabase
        .from("ai_attendance_settings")
        .upsert(payload, { onConflict: "tenant_id" });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ai-attendance-settings"] });
      toast({ title: "Configuração de IA salva!" });
    },
    onError: (e: any) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  const activeMode = MODES.find((m) => m.value === form.mode);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">IA no atendimento</h1>
          <p className="text-muted-foreground">
            Defina como a inteligência artificial participa das conversas do WhatsApp
          </p>
        </div>
        <Badge variant={form.mode === "off" ? "secondary" : "default"} className="gap-1">
          <Sparkles className="h-3 w-3" />
          {activeMode?.label}
        </Badge>
      </div>

      {isLoading ? (
        <p className="text-muted-foreground py-8 text-center">Carregando...</p>
      ) : (
        <div className="grid gap-6 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Bot className="h-5 w-5" /> Modo de operação
              </CardTitle>
              <CardDescription>{activeMode?.description}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid gap-3 sm:grid-cols-3">
                {MODES.map((m) => (
                  <button
                    key={m.value}
                    type="button"
                    disabled={!canManage}
                    onClick={() => setForm({ ...form, mode: m.value })}
                    className={`rounded-lg border p-3 text-left transition-colors ${
                      form.mode === m.value
                        ? "border-primary bg-primary/10"
                        : "border-border hover:bg-accent/40"
                    }`}
                  >
                    <p className="text-sm font-medium">{m.label}</p>
                    <p className="text-xs text-muted-foreground">{m.description}</p>
                  </button>
                ))}
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Agente de IA padrão</Label>
                  <Select
                    value={form.default_agent_id || "none"}
                    onValueChange={(v) => setForm({ ...form, default_agent_id: v === "none" ? "" : v })}
                    disabled={!canManage}
                  >
                    <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Nenhum</SelectItem>
                      {agents.map((a: any) => (
                        <SelectItem key={a.id} value={a.id}>
                          {a.name}{!a.is_active && " (inativo)"}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    Crie personas em <Link to="/agents" className="underline">Agentes IA</Link>.
                  </p>
                </div>

                <div className="space-y-2">
                  <Label>Departamento de transbordo</Label>
                  <Select
                    value={form.fallback_department_id || "none"}
                    onValueChange={(v) => setForm({ ...form, fallback_department_id: v === "none" ? "" : v })}
                    disabled={!canManage}
                  >
                    <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Nenhum</SelectItem>
                      {departments.map((d: any) => (
                        <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    Para onde a conversa vai quando a IA transfere para um humano.
                  </p>
                </div>
              </div>

              <div className="space-y-2">
                <Label>Mensagem de saudação da IA</Label>
                <Textarea
                  rows={3}
                  value={form.greeting_message}
                  onChange={(e) => setForm({ ...form, greeting_message: e.target.value })}
                  placeholder="Olá! Sou o assistente virtual. Como posso ajudar?"
                  disabled={!canManage}
                />
              </div>

              <div className="space-y-2">
                <Label>Palavras que transferem para humano</Label>
                <Input
                  value={form.handoff_keywords}
                  onChange={(e) => setForm({ ...form, handoff_keywords: e.target.value })}
                  placeholder="atendente, humano, falar com alguém"
                  disabled={!canManage}
                />
                <p className="text-xs text-muted-foreground">Separe por vírgulas.</p>
              </div>

              {canManage && (
                <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
                  <Save className="h-4 w-4 mr-2" />
                  {saveMutation.isPending ? "Salvando..." : "Salvar configuração"}
                </Button>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <MessageSquareDashed className="h-5 w-5" /> Limites e regras
              </CardTitle>
              <CardDescription>Controle quando e quanto a IA responde</CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm font-medium">Somente fora do horário</p>
                  <p className="text-xs text-muted-foreground">A IA atua só fora do expediente</p>
                </div>
                <Switch
                  checked={form.business_hours_only}
                  onCheckedChange={(v) => setForm({ ...form, business_hours_only: v })}
                  disabled={!canManage}
                />
              </div>

              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm font-medium">Somente primeiro contato</p>
                  <p className="text-xs text-muted-foreground">Responde apenas a nova conversa</p>
                </div>
                <Switch
                  checked={form.first_contact_only}
                  onCheckedChange={(v) => setForm({ ...form, first_contact_only: v })}
                  disabled={!canManage}
                />
              </div>

              <div className="space-y-2">
                <Label>Máximo de respostas automáticas</Label>
                <Input
                  type="number"
                  min={0}
                  max={50}
                  value={form.max_auto_replies}
                  onChange={(e) => setForm({ ...form, max_auto_replies: Number(e.target.value) })}
                  disabled={!canManage}
                />
                <p className="text-xs text-muted-foreground">
                  Depois disso a conversa é entregue a um agente humano.
                </p>
              </div>

              <div className="space-y-2">
                <Label>Atraso antes de responder (segundos)</Label>
                <Input
                  type="number"
                  min={0}
                  max={120}
                  value={form.response_delay_seconds}
                  onChange={(e) => setForm({ ...form, response_delay_seconds: Number(e.target.value) })}
                  disabled={!canManage}
                />
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
};

export default AiAttendance;
