import { useState, useEffect, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
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
import { Wifi, Clock, Building, QrCode, CheckCircle2, RefreshCw, Loader2, Users, MessageSquare, AlertCircle } from "lucide-react";

const DAYS = [
  { key: "monday", label: "Segunda" }, { key: "tuesday", label: "Terça" },
  { key: "wednesday", label: "Quarta" }, { key: "thursday", label: "Quinta" },
  { key: "friday", label: "Sexta" }, { key: "saturday", label: "Sábado" },
  { key: "sunday", label: "Domingo" },
];

interface SyncResult {
  contacts_synced: number;
  conversations_synced: number;
  messages_synced: number;
}

const Settings = () => {
  const { profile, loading } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const tenantId = profile?.tenant_id;

  // GREEN-API state (only 2 fields: idInstance and apiTokenInstance)
  const [instanceId, setInstanceId] = useState("");
  const [apiToken, setApiToken] = useState("");
  const [testing, setTesting] = useState(false);

  // QR Code state
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [qrLoading, setQrLoading] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [qrPollingActive, setQrPollingActive] = useState(false);

  // Sync state
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<SyncResult | null>(null);
  const [syncProgress, setSyncProgress] = useState(0);

  // Business hours state
  const [hours, setHours] = useState<any>(null);
  const [outsideMessage, setOutsideMessage] = useState("");

  // Tenant state
  const [tenantName, setTenantName] = useState("");

  const { data: connection } = useQuery({
    queryKey: ["whatsapp_connection", tenantId],
    queryFn: async () => {
      if (!tenantId) return null;
      const { data } = await supabase.from("whatsapp_connections").select("*").eq("tenant_id", tenantId).maybeSingle();
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

  useEffect(() => {
    if (connection) {
      setInstanceId(connection.zapi_instance_id || "");
      setApiToken(connection.zapi_token || "");
      if (connection.status === "connected") setIsConnected(true);
    }
  }, [connection]);

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

  // QR Code polling - refresh every 20s while active
  useEffect(() => {
    if (!qrPollingActive || !instanceId || !apiToken) return;
    const interval = setInterval(async () => {
      await fetchQrCode();
      await checkConnectionStatus();
    }, 20000);
    return () => clearInterval(interval);
  }, [qrPollingActive, instanceId, apiToken]);

  const fetchQrCode = useCallback(async () => {
    if (!instanceId || !apiToken) return;
    setQrLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("zapi-qrcode", {
        body: { instance_id: instanceId, token: apiToken },
      });
      if (error) throw error;
      if (data?.already_connected) {
        setIsConnected(true);
        setQrCode(null);
        setQrPollingActive(false);
        if (connection) {
          await supabase.from("whatsapp_connections").update({ status: "connected", last_connected_at: new Date().toISOString() }).eq("id", connection.id);
          queryClient.invalidateQueries({ queryKey: ["whatsapp_connection"] });
        }
        toast({ title: "WhatsApp conectado!", description: data.message });
      } else if (data?.qr_code) {
        setQrCode(data.qr_code);
        setIsConnected(false);
      } else if (data?.error) {
        toast({ title: "Erro ao obter QR Code", description: data.error, variant: "destructive" });
      }
    } catch (e: any) {
      toast({ title: "Erro", description: e.message, variant: "destructive" });
    } finally {
      setQrLoading(false);
    }
  }, [instanceId, apiToken, connection]);

  const checkConnectionStatus = async () => {
    try {
      const { data, error } = await supabase.functions.invoke("zapi-test", {
        body: { instance_id: instanceId, token: apiToken },
      });
      if (!error && data?.connected) {
        setIsConnected(true);
        setQrCode(null);
        setQrPollingActive(false);
        if (connection) {
          await supabase.from("whatsapp_connections").update({ 
            status: "connected", 
            last_connected_at: new Date().toISOString(),
            phone_number: data.phone || null,
          }).eq("id", connection.id);
          queryClient.invalidateQueries({ queryKey: ["whatsapp_connection"] });
        }
        toast({ title: "WhatsApp conectado!", description: `Número: ${data.phone || "detectado"}` });
      }
    } catch { /* silent */ }
  };

  const startQrConnection = async () => {
    if (!connection) {
      if (!instanceId || !apiToken) {
        toast({ title: "Preencha as credenciais", description: "idInstance e apiTokenInstance são obrigatórios.", variant: "destructive" });
        return;
      }
      await saveCredentialsMutation.mutateAsync();
    }
    setQrPollingActive(true);
    await fetchQrCode();
  };

  const saveCredentialsMutation = useMutation({
    mutationFn: async () => {
      if (!tenantId) throw new Error("Sem tenant");
      if (connection) {
        const { error } = await supabase.from("whatsapp_connections").update({
          zapi_instance_id: instanceId.trim(), zapi_token: apiToken.trim(),
        }).eq("id", connection.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("whatsapp_connections").insert({
          tenant_id: tenantId, zapi_instance_id: instanceId.trim(), zapi_token: apiToken.trim(),
        });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["whatsapp_connection"] });
      toast({ title: "Credenciais GREEN-API salvas!" });
    },
    onError: (e: any) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  const testConnection = async () => {
    setTesting(true);
    try {
      const { data, error } = await supabase.functions.invoke("zapi-test", {
        body: { instance_id: instanceId, token: apiToken },
      });
      if (error) throw error;
      if (data?.connected) {
        setIsConnected(true);
        toast({ title: "Conexão OK!", description: `Número: ${data.phone || "detectado"}` });
      } else {
        setIsConnected(false);
        toast({ title: "Falha na conexão", description: data?.error || "Verifique as credenciais", variant: "destructive" });
      }
    } catch (e: any) {
      toast({ title: "Erro ao testar", description: e.message, variant: "destructive" });
    } finally {
      setTesting(false);
    }
  };

  const registerWebhooks = async () => {
    try {
      const webhookBaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const { data, error } = await supabase.functions.invoke("zapi-register-webhooks", {
        body: { instance_id: instanceId, token: apiToken, webhook_base_url: webhookBaseUrl },
      });
      if (error) throw error;
      if (data?.success) {
        toast({ title: "Webhooks registrados!", description: data.message || "Recebimento e envio de mensagens configurados." });
      } else {
        toast({ title: "Erro ao registrar webhooks", description: data?.error || JSON.stringify(data), variant: "destructive" });
      }
    } catch (e: any) {
      toast({ title: "Erro", description: e.message, variant: "destructive" });
    }
  };

  const saveHoursMutation = useMutation({
    mutationFn: async () => {
      if (!tenantId) throw new Error("Sem tenant");
      const config = { days: hours, outside_message: outsideMessage, timezone: "America/Sao_Paulo" };
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
    setHours((prev: any) => ({
      ...prev,
      [dayKey]: { ...prev?.[dayKey], [field]: value },
    }));
  };

  const syncContacts = async () => {
    if (!connection || !tenantId) return;
    setSyncing(true);
    setSyncResult(null);
    setSyncProgress(10);

    // Simulate progress while waiting
    const progressInterval = setInterval(() => {
      setSyncProgress((p) => Math.min(p + 5, 85));
    }, 1000);

    try {
      const { data, error } = await supabase.functions.invoke("green-api-sync", {
        body: { tenant_id: tenantId, connection_id: connection.id },
      });
      clearInterval(progressInterval);
      setSyncProgress(100);

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      setSyncResult({
        contacts_synced: data.contacts_synced ?? 0,
        conversations_synced: data.conversations_synced ?? 0,
        messages_synced: data.messages_synced ?? 0,
      });
      queryClient.invalidateQueries({ queryKey: ["whatsapp_connection"] });
      toast({ title: "Sincronização concluída!", description: `${data.contacts_synced} contatos importados.` });
    } catch (e: any) {
      clearInterval(progressInterval);
      setSyncProgress(0);
      toast({ title: "Erro na sincronização", description: e.message, variant: "destructive" });
    } finally {
      setSyncing(false);
    }
  };

  // Estado defensivo: se não tem tenant ainda, mostrar loading
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
        <p className="text-muted-foreground">Gerencie sua conexão GREEN-API, horários e empresa</p>
      </div>

      <Tabs defaultValue="whatsapp">
        <TabsList>
          <TabsTrigger value="whatsapp"><Wifi className="h-4 w-4 mr-1" />WhatsApp</TabsTrigger>
          <TabsTrigger value="hours"><Clock className="h-4 w-4 mr-1" />Horários</TabsTrigger>
          <TabsTrigger value="general"><Building className="h-4 w-4 mr-1" />Geral</TabsTrigger>
        </TabsList>

        <TabsContent value="whatsapp" className="space-y-4">
          {/* Credentials Card */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Wifi className="h-5 w-5" />Credenciais GREEN-API</CardTitle>
              <CardDescription>
                Insira as credenciais da sua instância GREEN-API. 
                <a href="https://green-api.com" target="_blank" rel="noopener noreferrer" className="text-primary ml-1 underline">
                  Criar conta gratuita →
                </a>
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>idInstance <span className="text-destructive">*</span></Label>
                  <Input 
                    value={instanceId} 
                    onChange={(e) => setInstanceId(e.target.value.trim())} 
                    placeholder="Ex: 1101234567" 
                  />
                  <p className="text-xs text-muted-foreground">ID numérico da instância no painel GREEN-API</p>
                </div>
                <div className="space-y-2">
                  <Label>apiTokenInstance <span className="text-destructive">*</span></Label>
                  <Input 
                    value={apiToken} 
                    onChange={(e) => setApiToken(e.target.value.trim())} 
                    placeholder="Seu token de API" 
                    type="password" 
                  />
                  <p className="text-xs text-muted-foreground">Token de autenticação da instância</p>
                </div>
              </div>
              <div className="flex gap-2 flex-wrap">
                <Button onClick={() => saveCredentialsMutation.mutate()} disabled={!instanceId || !apiToken || saveCredentialsMutation.isPending}>
                  {saveCredentialsMutation.isPending ? "Salvando..." : "Salvar Credenciais"}
                </Button>
                <Button variant="outline" onClick={testConnection} disabled={!instanceId || !apiToken || testing}>
                  {testing ? "Testando..." : "Testar Conexão"}
                </Button>
                <Button variant="outline" onClick={registerWebhooks} disabled={!instanceId || !apiToken}>
                  Registrar Webhooks
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* QR Code Connection Card */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <QrCode className="h-5 w-5" />
                Conectar WhatsApp
                {isConnected && (
                  <Badge variant="default" className="ml-2">
                    <CheckCircle2 className="h-3 w-3 mr-1" />Conectado
                  </Badge>
                )}
              </CardTitle>
              <CardDescription>
                {isConnected 
                  ? "Seu WhatsApp está conectado e pronto para receber mensagens."
                  : "Escaneie o QR Code abaixo com seu WhatsApp para conectar"
                }
              </CardDescription>
            </CardHeader>
            <CardContent>
              {isConnected ? (
                <div className="flex items-center gap-4 p-6 rounded-lg bg-primary/10 border border-primary/20">
                  <CheckCircle2 className="h-12 w-12 text-primary" />
                  <div>
                    <p className="font-semibold text-lg">WhatsApp Conectado!</p>
                    <p className="text-muted-foreground text-sm">
                      {connection?.phone_number ? `Número: ${connection.phone_number}` : "Pronto para enviar e receber mensagens."}
                    </p>
                    {connection?.last_connected_at && (
                      <p className="text-xs text-muted-foreground mt-1">
                        Último acesso: {new Date(connection.last_connected_at).toLocaleString("pt-BR")}
                      </p>
                    )}
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  {!qrCode && !qrLoading && (
                    <div className="text-center py-8">
                      <QrCode className="h-16 w-16 mx-auto mb-4 text-muted-foreground opacity-50" />
                      <p className="text-muted-foreground mb-4">
                        {instanceId && apiToken 
                          ? "Clique no botão abaixo para gerar o QR Code"
                          : "Preencha e salve as credenciais GREEN-API acima primeiro"
                        }
                      </p>
                      <Button 
                        onClick={startQrConnection} 
                        disabled={!instanceId || !apiToken}
                        size="lg"
                      >
                        <QrCode className="h-4 w-4 mr-2" />
                        Gerar QR Code
                      </Button>
                    </div>
                  )}

                  {qrLoading && !qrCode && (
                    <div className="text-center py-8">
                      <Loader2 className="h-8 w-8 mx-auto mb-4 animate-spin text-primary" />
                      <p className="text-muted-foreground">Carregando QR Code...</p>
                    </div>
                  )}

                  {qrCode && (
                    <div className="flex flex-col items-center gap-4">
                      <div className="p-4 bg-white rounded-xl shadow-lg">
                        <img 
                          src={qrCode} 
                          alt="QR Code WhatsApp" 
                          className="w-64 h-64 object-contain"
                        />
                      </div>
                      <div className="text-center space-y-2">
                        <p className="text-sm font-medium">Escaneie com seu WhatsApp</p>
                        <p className="text-xs text-muted-foreground">
                          Abra o WhatsApp → Menu (⋮) → Aparelhos conectados → Conectar um aparelho
                        </p>
                        <Button variant="outline" size="sm" onClick={fetchQrCode} disabled={qrLoading}>
                          <RefreshCw className={`h-3 w-3 mr-1 ${qrLoading ? "animate-spin" : ""}`} />
                          Atualizar QR Code
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Sync Card */}
          {connection && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <RefreshCw className="h-5 w-5" />
                  Sincronizar Contatos e Conversas
                </CardTitle>
                <CardDescription>
                  Importa contatos, cria conversas e traz o histórico de mensagens do WhatsApp para o Inbox.
                  {connection.sync_status && connection.sync_status !== "idle" && (
                    <span className="ml-2">
                      Status:{" "}
                      <Badge variant={connection.sync_status === "synced" ? "default" : connection.sync_status === "error" ? "destructive" : "secondary"}>
                        {connection.sync_status === "synced" ? "Sincronizado" : connection.sync_status === "syncing" ? "Sincronizando..." : connection.sync_status === "error" ? "Erro" : connection.sync_status}
                      </Badge>
                    </span>
                  )}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {syncing && (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Sincronizando dados do WhatsApp... pode levar alguns minutos.
                    </div>
                    <Progress value={syncProgress} className="h-2" />
                  </div>
                )}

                {syncResult && !syncing && (
                  <div className="grid grid-cols-3 gap-4 p-4 rounded-lg bg-primary/5 border border-primary/20">
                    <div className="text-center">
                      <Users className="h-6 w-6 mx-auto mb-1 text-primary" />
                      <p className="text-2xl font-bold">{syncResult.contacts_synced}</p>
                      <p className="text-xs text-muted-foreground">Contatos</p>
                    </div>
                    <div className="text-center">
                      <MessageSquare className="h-6 w-6 mx-auto mb-1 text-primary" />
                      <p className="text-2xl font-bold">{syncResult.conversations_synced}</p>
                      <p className="text-xs text-muted-foreground">Conversas novas</p>
                    </div>
                    <div className="text-center">
                      <MessageSquare className="h-6 w-6 mx-auto mb-1 text-primary" />
                      <p className="text-2xl font-bold">{syncResult.messages_synced}</p>
                      <p className="text-xs text-muted-foreground">Mensagens</p>
                    </div>
                  </div>
                )}

                <div className="flex items-center gap-3">
                  <Button onClick={syncContacts} disabled={syncing || !connection}>
                    {syncing ? (
                      <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Sincronizando...</>
                    ) : (
                      <><RefreshCw className="h-4 w-4 mr-2" />Sincronizar Agora</>
                    )}
                  </Button>
                  {!isConnected && (
                    <div className="flex items-center gap-1 text-sm text-destructive/80">
                      <AlertCircle className="h-4 w-4" />
                      Conecte o WhatsApp primeiro
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          )}
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