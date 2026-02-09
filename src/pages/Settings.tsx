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
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { Wifi, Clock, Building, QrCode, CheckCircle2, RefreshCw, Loader2 } from "lucide-react";

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
  const tenantId = profile?.tenant_id;

  // Z-API state
  const [instanceId, setInstanceId] = useState("");
  const [token, setToken] = useState("");
  const [clientToken, setClientToken] = useState("");
  const [testing, setTesting] = useState(false);

  // QR Code state
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [qrLoading, setQrLoading] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [qrPollingActive, setQrPollingActive] = useState(false);

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
      setInstanceId(connection.zapi_instance_id);
      setToken(connection.zapi_token);
      setClientToken(connection.zapi_client_token || "");
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
    if (!qrPollingActive || !instanceId || !token) return;
    const interval = setInterval(async () => {
      await fetchQrCode();
      // Also check connection status
      await checkConnectionStatus();
    }, 20000);
    return () => clearInterval(interval);
  }, [qrPollingActive, instanceId, token]);

  const fetchQrCode = useCallback(async () => {
    if (!instanceId || !token) return;
    setQrLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("zapi-qrcode", {
        body: { instance_id: instanceId, token, client_token: clientToken },
      });
      if (error) throw error;
      if (data?.already_connected) {
        setIsConnected(true);
        setQrCode(null);
        setQrPollingActive(false);
        // Update connection status in DB
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
  }, [instanceId, token, clientToken, connection]);

  const checkConnectionStatus = async () => {
    try {
      const { data, error } = await supabase.functions.invoke("zapi-test", {
        body: { instance_id: instanceId, token, client_token: clientToken },
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
    // Save credentials first if not saved
    if (!connection) {
      if (!instanceId || !token) {
        toast({ title: "Preencha as credenciais", description: "Informe Instance ID e Token antes de conectar.", variant: "destructive" });
        return;
      }
      await saveZapiMutation.mutateAsync();
    }
    setQrPollingActive(true);
    await fetchQrCode();
  };

  const saveZapiMutation = useMutation({
    mutationFn: async () => {
      if (!tenantId) throw new Error("Sem tenant");
      if (connection) {
        const { error } = await supabase.from("whatsapp_connections").update({
          zapi_instance_id: instanceId, zapi_token: token, zapi_client_token: clientToken,
        }).eq("id", connection.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("whatsapp_connections").insert({
          tenant_id: tenantId, zapi_instance_id: instanceId, zapi_token: token, zapi_client_token: clientToken,
        });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["whatsapp_connection"] });
      toast({ title: "Credenciais Z-API salvas!" });
    },
    onError: (e: any) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  const testConnection = async () => {
    setTesting(true);
    try {
      const { data, error } = await supabase.functions.invoke("zapi-test", {
        body: { instance_id: instanceId, token, client_token: clientToken },
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
        body: { instance_id: instanceId, token, client_token: clientToken, webhook_base_url: webhookBaseUrl },
      });
      if (error) throw error;
      if (data?.success) {
        toast({ title: "Webhooks registrados!", description: "Recebimento e envio de mensagens configurados." });
      } else {
        toast({ title: "Erro ao registrar webhooks", description: JSON.stringify(data), variant: "destructive" });
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

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Configurações</h1>
        <p className="text-muted-foreground">Gerencie sua conexão Z-API, horários e empresa</p>
      </div>

      <Tabs defaultValue="zapi">
        <TabsList>
          <TabsTrigger value="zapi"><Wifi className="h-4 w-4 mr-1" />Z-API</TabsTrigger>
          <TabsTrigger value="hours"><Clock className="h-4 w-4 mr-1" />Horários</TabsTrigger>
          <TabsTrigger value="general"><Building className="h-4 w-4 mr-1" />Geral</TabsTrigger>
        </TabsList>

        <TabsContent value="zapi" className="space-y-4">
          {/* Credentials Card */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Wifi className="h-5 w-5" />Credenciais Z-API</CardTitle>
              <CardDescription>Insira as credenciais da sua instância Z-API</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label>Instance ID</Label>
                  <Input value={instanceId} onChange={(e) => setInstanceId(e.target.value)} placeholder="Ex: 3EE79997AC1371EE03F0A6D7BDC71B5D" />
                  <p className="text-xs text-muted-foreground">Apenas o ID, não cole a URL completa</p>
                </div>
                <div className="space-y-2">
                  <Label>Token</Label>
                  <Input value={token} onChange={(e) => setToken(e.target.value)} placeholder="Seu Token" type="password" />
                </div>
                <div className="space-y-2">
                  <Label>Client Token (opcional)</Label>
                  <Input value={clientToken} onChange={(e) => setClientToken(e.target.value)} placeholder="Client Token" type="password" />
                </div>
              </div>
              <div className="flex gap-2 flex-wrap">
                <Button onClick={() => saveZapiMutation.mutate()} disabled={!instanceId || !token || saveZapiMutation.isPending}>
                  {saveZapiMutation.isPending ? "Salvando..." : "Salvar Credenciais"}
                </Button>
                <Button variant="outline" onClick={testConnection} disabled={!instanceId || !token || testing}>
                  {testing ? "Testando..." : "Testar Conexão"}
                </Button>
                <Button variant="outline" onClick={registerWebhooks} disabled={!instanceId || !token}>
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
                        {instanceId && token 
                          ? "Clique no botão abaixo para gerar o QR Code"
                          : "Preencha e salve as credenciais Z-API acima primeiro"
                        }
                      </p>
                      <Button 
                        onClick={startQrConnection} 
                        disabled={!instanceId || !token}
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
