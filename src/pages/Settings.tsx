import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Settings as SettingsIcon, Wifi, Clock, Building } from "lucide-react";

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
        toast({ title: "Conexão OK!", description: `Número: ${data.phone || "detectado"}` });
      } else {
        toast({ title: "Falha na conexão", description: data?.error || "Verifique as credenciais", variant: "destructive" });
      }
    } catch (e: any) {
      toast({ title: "Erro ao testar", description: e.message, variant: "destructive" });
    } finally {
      setTesting(false);
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

        <TabsContent value="zapi">
          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2"><Wifi className="h-5 w-5" />Conexão Z-API</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Instance ID</Label>
                <Input value={instanceId} onChange={(e) => setInstanceId(e.target.value)} placeholder="Seu Instance ID do Z-API" />
              </div>
              <div className="space-y-2">
                <Label>Token</Label>
                <Input value={token} onChange={(e) => setToken(e.target.value)} placeholder="Seu Token" type="password" />
              </div>
              <div className="space-y-2">
                <Label>Client Token (opcional)</Label>
                <Input value={clientToken} onChange={(e) => setClientToken(e.target.value)} placeholder="Client Token" type="password" />
              </div>
              <div className="flex gap-2">
                <Button onClick={() => saveZapiMutation.mutate()} disabled={!instanceId || !token || saveZapiMutation.isPending}>
                  {saveZapiMutation.isPending ? "Salvando..." : "Salvar Credenciais"}
                </Button>
                <Button variant="outline" onClick={testConnection} disabled={!instanceId || !token || testing}>
                  {testing ? "Testando..." : "Testar Conexão"}
                </Button>
              </div>
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
