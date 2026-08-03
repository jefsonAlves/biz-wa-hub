import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Progress } from "@/components/ui/progress";
import {
  Wifi, Clock, Building, CheckCircle2, Loader2, AlertCircle, Bot, Circle,
  ExternalLink, Workflow, Smartphone,
} from "lucide-react";
import { listConnections } from "@/lib/whatsapp/provider";

const DAYS = [
  { key: "monday", label: "Segunda" }, { key: "tuesday", label: "Terça" },
  { key: "wednesday", label: "Quarta" }, { key: "thursday", label: "Quinta" },
  { key: "friday", label: "Sexta" }, { key: "saturday", label: "Sábado" },
  { key: "sunday", label: "Domingo" },
];

const Settings = () => {
  const { profile } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const tenantId = profile?.tenant_id;

  const [hours, setHours] = useState<any>(null);
  const [outsideMessage, setOutsideMessage] = useState("");
  const [tenantName, setTenantName] = useState("");
  const [displayName, setDisplayName] = useState("");


  const { data: connections = [] } = useQuery({
    queryKey: ["whatsapp_connections_safe", tenantId],
    queryFn: listConnections,
    enabled: !!tenantId,
  });

  const { data: integration } = useQuery({
    queryKey: ["n8n_integration", tenantId],
    queryFn: async () => {
      if (!tenantId) return null;
      const { data } = await supabase
        .from("n8n_integrations")
        .select("*")
        .eq("tenant_id", tenantId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      return data;
    },
    enabled: !!tenantId,
  });

  const { data: businessHours } = useQuery({
    queryKey: ["business_hours", tenantId],
    queryFn: async () => {
      if (!tenantId) return null;
      const { data } = await supabase.from("business_hours").select("*").eq("tenant_id", tenantId).maybeSingle();
      return data;
    },
    enabled: !!tenantId,
  });

  const { data: tenant } = useQuery({
    queryKey: ["tenant", tenantId],
    queryFn: async () => {
      if (!tenantId) return null;
      const { data } = await supabase.from("tenants").select("*").eq("id", tenantId).maybeSingle();
      return data;
    },
    enabled: !!tenantId,
  });

  const { data: agentConfig, isLoading: agentLoading } = useQuery({
    queryKey: ["agent_config_active", tenantId],
    queryFn: async () => {
      if (!tenantId) return null;
      const { data } = await supabase.from("agents_config").select("*").eq("tenant_id", tenantId).limit(1).maybeSingle();
      return data;
    },
    enabled: !!tenantId,
  });

  const { data: knowledgeCount = 0 } = useQuery({
    queryKey: ["knowledge_count", tenantId],
    queryFn: async () => {
      if (!tenantId) return 0;
      const { count } = await supabase
        .from("knowledge_items")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", tenantId);
      return count || 0;
    },
    enabled: !!tenantId,
  });

  const toggleAgentMutation = useMutation({
    mutationFn: async () => {
      if (!agentConfig) throw new Error("Nenhum agente configurado");
      const { error } = await supabase
        .from("agents_config")
        .update({ is_active: !agentConfig.is_active })
        .eq("id", agentConfig.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["agent_config_active"] });
      toast({ title: agentConfig?.is_active ? "Agente IA desativado" : "Agente IA ativado!" });
    },
    onError: (e: any) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  useEffect(() => {
    if (businessHours) {
      const config = businessHours.config as any;
      setHours(config?.days || {});
      setOutsideMessage(config?.outside_message || "");
    }
  }, [businessHours]);

  useEffect(() => {
    if (tenant) setTenantName(tenant.name);
  }, [tenant]);

  useEffect(() => {
    setDisplayName(profile?.full_name || "");
  }, [profile?.full_name]);

  const saveProfileMutation = useMutation({
    mutationFn: async () => {
      if (!profile?.user_id) throw new Error("Sem perfil");
      const { error } = await supabase
        .from("profiles")
        .update({ full_name: displayName.trim() })
        .eq("user_id", profile.user_id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["team"] });
      toast({ title: "Nome atualizado!", description: "Novas mensagens usarão este nome no WhatsApp." });
    },
    onError: (e: any) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });


  const saveHoursMutation = useMutation({
    mutationFn: async () => {
      if (!tenantId) throw new Error("Sem tenant");
      const config = { days: hours, outside_message: outsideMessage };
      if (businessHours) {
        const { error } = await supabase.from("business_hours").update({ config }).eq("id", businessHours.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("business_hours").insert({ tenant_id: tenantId, config });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["business_hours"] });
      toast({ title: "Horários salvos!" });
    },
  });

  const saveTenantMutation = useMutation({
    mutationFn: async () => {
      if (!tenantId) throw new Error("Sem tenant");
      const { error } = await supabase.from("tenants").update({ name: tenantName }).eq("id", tenantId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tenant"] });
      toast({ title: "Dados da empresa salvos!" });
    },
  });

  const updateDay = (dayKey: string, field: string, value: any) => {
    setHours((prev: any) => ({ ...prev, [dayKey]: { ...prev?.[dayKey], [field]: value } }));
  };

  const connectedCount = connections.filter((c) => c.status === "connected").length;

  const checklistItems = [
    { label: "Integração n8n configurada", done: !!integration?.base_url },
    { label: "Integração n8n ativa", done: integration?.status === "active" },
    { label: "Conexão de WhatsApp criada", done: connections.length > 0 },
    { label: "Número conectado", done: connectedCount > 0 },
    { label: "Agente IA ativo", done: !!agentConfig?.is_active && knowledgeCount > 0 },
  ];
  const checklistDone = checklistItems.filter((i) => i.done).length;

  if (!tenantId) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] space-y-4">
        <Loader2 className="h-10 w-10 animate-spin text-primary" />
        <div className="text-center">
          <p className="font-semibold text-lg">Carregando perfil...</p>
          <p className="text-muted-foreground text-sm mt-1">
            Aguardando configuração da conta. Isso pode levar alguns segundos.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Configurações</h1>
        <p className="text-muted-foreground">Gerencie canais, automações via n8n, horários e dados da empresa</p>
      </div>

      <Tabs defaultValue="whatsapp">
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="whatsapp"><Wifi className="h-4 w-4 mr-1" />Canais</TabsTrigger>
          <TabsTrigger value="hours"><Clock className="h-4 w-4 mr-1" />Horários</TabsTrigger>
          <TabsTrigger value="profile"><Circle className="h-4 w-4 mr-1" />Meu perfil</TabsTrigger>
          <TabsTrigger value="general"><Building className="h-4 w-4 mr-1" />Geral</TabsTrigger>
        </TabsList>


        <TabsContent value="whatsapp" className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <CheckCircle2 className="h-5 w-5" />
                Progresso do Setup
                <Badge variant={checklistDone === checklistItems.length ? "default" : "secondary"} className="ml-auto">
                  {checklistDone}/{checklistItems.length}
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                {checklistItems.map((item) => (
                  <div key={item.label} className="flex items-center gap-2 text-sm">
                    {item.done ? (
                      <CheckCircle2 className="h-4 w-4 text-primary shrink-0" />
                    ) : (
                      <Circle className="h-4 w-4 text-muted-foreground shrink-0" />
                    )}
                    <span className={item.done ? "text-foreground" : "text-muted-foreground"}>{item.label}</span>
                  </div>
                ))}
              </div>
              <Progress value={(checklistDone / checklistItems.length) * 100} className="h-1.5 mt-3" />
            </CardContent>
          </Card>

          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><Smartphone className="h-5 w-5" />Conexões de WhatsApp</CardTitle>
                <CardDescription>
                  Múltiplos números por empresa, conectados pelo n8n self-hosted. Credenciais ficam apenas no servidor.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  {connections.length === 0
                    ? "Nenhuma conexão cadastrada."
                    : `${connections.length} conexão(ões) · ${connectedCount} conectada(s).`}
                </p>
                <Button onClick={() => navigate("/connections")}>
                  <ExternalLink className="h-4 w-4 mr-2" />Gerenciar conexões
                </Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><Workflow className="h-5 w-5" />Integração n8n</CardTitle>
                <CardDescription>
                  Orquestrador de automações, IA e canal de WhatsApp. Eventos são assinados com HMAC SHA-256.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  {integration?.base_url
                    ? `Status: ${integration.status === "active" ? "ativa" : "inativa"}`
                    : "Nenhuma instância configurada."}
                </p>
                <Button variant="outline" onClick={() => navigate("/integrations/n8n")}>
                  <ExternalLink className="h-4 w-4 mr-2" />Configurar n8n
                </Button>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Bot className="h-5 w-5" />
                Agente IA
                {agentConfig?.is_active && <Badge variant="default" className="ml-2">Ativo</Badge>}
                {agentConfig && !agentConfig.is_active && <Badge variant="secondary" className="ml-2">Inativo</Badge>}
              </CardTitle>
              <CardDescription>
                O agente IA responde automaticamente às mensagens recebidas, com execução orquestrada pelo n8n.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {agentLoading ? (
                <div className="flex items-center gap-2 text-muted-foreground text-sm">
                  <Loader2 className="h-4 w-4 animate-spin" /> Carregando...
                </div>
              ) : agentConfig ? (
                <>
                  {knowledgeCount === 0 && (
                    <div className="flex items-center gap-3 p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-sm">
                      <AlertCircle className="h-5 w-5 text-destructive shrink-0" />
                      <div>
                        <p className="font-medium text-destructive">Base de Conhecimento vazia</p>
                        <p className="text-muted-foreground">Adicione conteúdo à Base de Conhecimento para ativar o agente IA.</p>
                      </div>
                      <Button variant="outline" size="sm" className="ml-auto shrink-0" onClick={() => navigate("/knowledge")}>
                        Ir para Base de Conhecimento
                      </Button>
                    </div>
                  )}
                  <div className="p-4 rounded-lg bg-muted/50 space-y-2">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium">{agentConfig.name}</p>
                        <p className="text-xs text-muted-foreground">Modelo: {agentConfig.model || "Padrão"}</p>
                        {agentConfig.persona && (
                          <p className="text-xs text-muted-foreground mt-1 line-clamp-2">Persona: {agentConfig.persona}</p>
                        )}
                      </div>
                      <div className="flex items-center gap-3">
                        <Label htmlFor="agent-toggle" className="text-sm text-muted-foreground">
                          {agentConfig.is_active ? "Ativo" : "Inativo"}
                        </Label>
                        <Switch
                          id="agent-toggle"
                          checked={agentConfig.is_active ?? false}
                          onCheckedChange={() => toggleAgentMutation.mutate()}
                          disabled={toggleAgentMutation.isPending || knowledgeCount === 0}
                        />
                      </div>
                    </div>
                  </div>
                  <Button variant="outline" onClick={() => navigate("/agents")}>
                    <ExternalLink className="h-4 w-4 mr-2" />Configurar Agente
                  </Button>
                </>
              ) : (
                <div className="text-center py-6">
                  <Bot className="h-12 w-12 mx-auto mb-3 text-muted-foreground opacity-50" />
                  <p className="text-muted-foreground mb-4">Nenhum agente IA configurado ainda.</p>
                  <Button onClick={() => navigate("/agents")}>
                    <Bot className="h-4 w-4 mr-2" />Criar Agente IA
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="hours">
          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2"><Clock className="h-5 w-5" />Horário de Atendimento</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              {hours && DAYS.map(({ key, label }) => (
                <div key={key} className="flex items-center gap-4">
                  <Switch checked={hours[key]?.enabled ?? false} onCheckedChange={(v) => updateDay(key, "enabled", v)} />
                  <span className="w-24 text-sm">{label}</span>
                  <Input type="time" value={hours[key]?.start || "08:00"} onChange={(e) => updateDay(key, "start", e.target.value)} className="w-32" disabled={!hours[key]?.enabled} />
                  <span className="text-muted-foreground">até</span>
                  <Input type="time" value={hours[key]?.end || "18:00"} onChange={(e) => updateDay(key, "end", e.target.value)} className="w-32" disabled={!hours[key]?.enabled} />
                </div>
              ))}
              <div className="space-y-2 pt-4">
                <Label>Mensagem fora do expediente</Label>
                <Textarea value={outsideMessage} onChange={(e) => setOutsideMessage(e.target.value)} placeholder="Mensagem automática..." />
              </div>
              <Button onClick={() => saveHoursMutation.mutate()} disabled={saveHoursMutation.isPending}>
                {saveHoursMutation.isPending ? "Salvando..." : "Salvar Horários"}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>



        <TabsContent value="profile">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Circle className="h-5 w-5" />Meu perfil</CardTitle>
              <CardDescription>
                O nome exibido é o nome que aparece para o contato no WhatsApp em cada mensagem que você envia.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="display-name">Nome exibido no WhatsApp</Label>
                <Input
                  id="display-name"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="Ex: Ana do Suporte"
                  maxLength={60}
                />
                <p className="text-xs text-muted-foreground">
                  Suas mensagens serão enviadas como “*{displayName.trim() || "Seu nome"}*: mensagem”.
                </p>
              </div>
              <Button onClick={() => saveProfileMutation.mutate()} disabled={!displayName.trim() || saveProfileMutation.isPending}>
                {saveProfileMutation.isPending ? "Salvando..." : "Salvar nome"}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="general">
          <Card>



            <CardHeader><CardTitle className="flex items-center gap-2"><Building className="h-5 w-5" />Dados da Empresa</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Nome da Empresa</Label>
                <Input value={tenantName} onChange={(e) => setTenantName(e.target.value)} />
              </div>
              <Button onClick={() => saveTenantMutation.mutate()} disabled={!tenantName.trim() || saveTenantMutation.isPending}>
                {saveTenantMutation.isPending ? "Salvando..." : "Salvar"}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default Settings;
