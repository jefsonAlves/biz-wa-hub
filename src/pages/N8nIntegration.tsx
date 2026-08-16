import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { Workflow, ShieldCheck, Loader2, Copy, Building2 } from "lucide-react";
import { testN8nIntegration } from "@/lib/whatsapp/provider";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const N8nIntegration = () => {
  const { profile, isSuperAdmin } = useAuth();
  const [selectedTenantId, setSelectedTenantId] = useState<string | null>(null);
  
  // For Super Admin, we either manage global (null) or a specific tenant
  // For regular users (if they ever get here), it's their own tenant
  const effectiveTenantId = isSuperAdmin ? selectedTenantId : profile?.tenant_id;
  
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [baseUrl, setBaseUrl] = useState("");
  const [webhookPath, setWebhookPath] = useState("/webhook/biz-wa-hub/platform");
  const [environment, setEnvironment] = useState("production");
  const [active, setActive] = useState(true);
  const [testing, setTesting] = useState(false);

  const receiverUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/n8n-webhook-receiver`;

  // Fetch tenants for Super Admin selector
  const { data: tenants = [] } = useQuery({
    queryKey: ["admin-tenants-list"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tenants")
        .select("id, name")
        .order("name");
      if (error) throw error;
      return data;
    },
    enabled: isSuperAdmin,
  });

  const { data: integration, isLoading } = useQuery({
    queryKey: ["n8n_integration", effectiveTenantId],
    queryFn: async () => {
      const query = supabase
        .from("n8n_integrations")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(1);
      
      if (effectiveTenantId === null) {
        query.is("tenant_id", null);
      } else {
        query.eq("tenant_id", effectiveTenantId);
      }

      const { data } = await query.maybeSingle();
      return data;
    },
    enabled: isSuperAdmin || !!profile?.tenant_id,
  });

  useEffect(() => {
    if (integration) {
      setBaseUrl(integration.base_url ?? "");
      setWebhookPath(integration.webhook_path ?? "/webhook/biz-wa-hub/platform");
      setEnvironment(integration.environment ?? "production");
      setActive(integration.status === "active");
    } else {
      // Reset if no integration found for selected tenant
      setBaseUrl("");
      setWebhookPath("/webhook/biz-wa-hub/platform");
      setEnvironment("production");
      setActive(true);
    }
  }, [integration]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!isSuperAdmin) throw new Error("Apenas Super Admin pode configurar n8n");
      
      const payload = {
        base_url: baseUrl.trim().replace(/\/+$/, ""),
        webhook_path: webhookPath.trim() || "/webhook/biz-wa-hub/platform",
        environment,
        status: active ? "active" : "inactive",
        tenant_id: effectiveTenantId,
        last_error_message: null // Clear old error on save
      };

      if (integration) {
        const { error } = await supabase.from("n8n_integrations").update(payload).eq("id", integration.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("n8n_integrations").insert({
          name: effectiveTenantId ? `n8n for ${tenants.find(t => t.id === effectiveTenantId)?.name}` : "n8n self-hosted global",
          ...payload,
        });
        if (error) throw error;
      }
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["n8n_integration", effectiveTenantId] });
      // Reprocess queue after saving new config
      try {
        await testN8nIntegration({ 
          tenant_id: effectiveTenantId, 
          use_global: isSuperAdmin && effectiveTenantId === null,
          action: "reprocess_queue"
        });
      } catch (e) {
        console.warn("Could not auto-reprocess queue:", e);
      }
      toast({ title: "Integração salva", description: "Configuração atualizada e fila reiniciada." });
    },
    onError: (e: Error) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  const runTest = async () => {
    setTesting(true);
    try {
      // Invalidate query first to make sure we are testing the saved state
      await queryClient.invalidateQueries({ queryKey: ["n8n_integration", effectiveTenantId] });
      
      const res = await testN8nIntegration({
        tenant_id: effectiveTenantId,
        use_global: isSuperAdmin && effectiveTenantId === null
      });
      
      if (res?.success) {
        toast({ title: "n8n respondeu", description: `HTTP ${res?.diagnostics?.webhook?.http_status ?? "ok"}` });
      } else {
        const errorMsg = res?.diagnostics?.webhook?.error || "Falha desconhecida";
        toast({ title: "Falha no teste", description: errorMsg, variant: "destructive" });
      }
      
      queryClient.invalidateQueries({ queryKey: ["n8n_integration", effectiveTenantId] });
    } catch (e) {
      toast({ title: "Erro ao testar", description: (e as Error).message, variant: "destructive" });
    } finally {
      setTesting(false);
    }
  };

  const copy = (value: string) => {
    navigator.clipboard.writeText(value);
    toast({ title: "Copiado" });
  };

  if (!isSuperAdmin) return <div className="p-8 text-center">Acesso restrito ao Administrador Master.</div>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Integração n8n</h1>
        <p className="text-muted-foreground">
          O n8n é o orquestrador de automações, IA e do canal de WhatsApp. O Supabase permanece a fonte oficial dos dados.
        </p>
      </div>

      {isSuperAdmin && (
        <Card className="border-primary/20 bg-primary/5">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Building2 className="h-4 w-4" /> Empresa administrada
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Select 
              value={selectedTenantId || "global"} 
              onValueChange={(val) => setSelectedTenantId(val === "global" ? null : val)}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Selecione uma empresa ou Configuração Global" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="global">Configuração Global (Padrão)</SelectItem>
                {tenants.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-[10px] text-muted-foreground mt-2">
              Selecione "Configuração Global" para definir o padrão do sistema, ou uma empresa específica para sobrescrever o padrão apenas para ela.
            </p>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Workflow className="h-5 w-5" />
            Instância n8n
            {integration && (
              <Badge variant={integration.status === "active" ? "default" : "secondary"} className="ml-2">
                {integration.status === "active" ? "Ativa" : "Inativa"}
              </Badge>
            )}
          </CardTitle>
          <CardDescription>URL pública da sua instância self-hosted e caminho do webhook de entrada.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {isLoading ? (
            <div className="flex items-center gap-2 text-muted-foreground text-sm">
              <Loader2 className="h-4 w-4 animate-spin" />Carregando...
            </div>
          ) : (
            <>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>URL base do n8n</Label>
                  <Input value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} placeholder="https://n8n.suaempresa.com" />
                </div>
                <div className="space-y-2">
                  <Label>Caminho do webhook</Label>
                  <Input value={webhookPath} onChange={(e) => setWebhookPath(e.target.value)} placeholder="/webhook/biz-wa-hub/platform" />
                </div>
                <div className="space-y-2">
                  <Label>Ambiente</Label>
                  <Input value={environment} onChange={(e) => setEnvironment(e.target.value)} placeholder="production" />
                </div>
                <div className="flex items-center gap-3 pt-6">
                  <Switch checked={active} onCheckedChange={setActive} id="n8n-active" />
                  <Label htmlFor="n8n-active">Integração ativa</Label>
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                <Button onClick={() => saveMutation.mutate()} disabled={!baseUrl.trim() || saveMutation.isPending}>
                  {saveMutation.isPending ? "Salvando..." : "Salvar"}
                </Button>
                <Button variant="outline" onClick={runTest} disabled={!integration || testing}>
                  {testing ? "Testando..." : "Testar conexão"}
                </Button>
              </div>

              {integration?.last_error_message && (
                <p className="text-xs text-destructive">Último erro: {integration.last_error_message}</p>
              )}
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><ShieldCheck className="h-5 w-5" />Webhook de retorno</CardTitle>
          <CardDescription>
            Configure este endpoint nos fluxos do n8n. As requisições devem ser assinadas com HMAC SHA-256
            usando o segredo compartilhado, nos cabeçalhos <code>X-Timestamp</code>, <code>X-Event-Id</code> e <code>X-Signature</code>.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center gap-2">
            <Input readOnly value={receiverUrl} className="font-mono text-xs" />
            <Button variant="outline" size="icon" onClick={() => copy(receiverUrl)}>
              <Copy className="h-4 w-4" />
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Assinatura = HMAC_SHA256(segredo, `timestamp.event_id.corpo_bruto`). O segredo fica apenas no servidor,
            nunca no navegador.
          </p>
        </CardContent>
      </Card>
      <N8nOutboxPanel tenantId={effectiveTenantId} useGlobal={isSuperAdmin && effectiveTenantId === null} />
    </div>
  );
};

const N8nOutboxPanel = ({ tenantId, useGlobal }: { tenantId: string | null; useGlobal: boolean }) => {
  const { toast } = useToast();
  const [running, setRunning] = useState<string | null>(null);

  const { data: testResult, refetch, isLoading } = useQuery({
    queryKey: ["n8n_diagnostics", tenantId, useGlobal],
    queryFn: () => testN8nIntegration({ tenant_id: tenantId, use_global: useGlobal }),
    refetchInterval: 30000, // Auto refresh every 30s
  });

  const runAction = async (action: "reprocess_queue" | "archive_dead") => {
    setRunning(action);
    try {
      const res = await testN8nIntegration({ 
        tenant_id: tenantId, 
        use_global: useGlobal, 
        action 
      });
      toast({ 
        title: action === "reprocess_queue" ? "Fila reiniciada" : "Eventos arquivados", 
        description: `${res.affected_count} eventos afetados.` 
      });
      refetch();
    } catch (e) {
      toast({ title: "Erro", description: (e as Error).message, variant: "destructive" });
    } finally {
      setRunning(null);
    }
  };

  const diag = testResult?.diagnostics;
  const outbox = diag?.outbox;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Workflow className="h-5 w-5" /> Fila de eventos (Outbox)
            </CardTitle>
            <CardDescription>Status das entregas pendentes e falhas recentes para o n8n.</CardDescription>
          </div>
          <Button variant="ghost" size="sm" onClick={() => refetch()} disabled={isLoading}>
            {isLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            Atualizar status
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <div className="p-3 bg-muted rounded-lg text-center">
            <div className="text-2xl font-bold">{outbox?.pending ?? 0}</div>
            <div className="text-[10px] uppercase text-muted-foreground">Pendentes</div>
          </div>
          <div className="p-3 bg-blue-500/10 rounded-lg text-center">
            <div className="text-2xl font-bold text-blue-500">{outbox?.processing ?? 0}</div>
            <div className="text-[10px] uppercase text-blue-500">Processando</div>
          </div>
          <div className="p-3 bg-green-500/10 rounded-lg text-center">
            <div className="text-2xl font-bold text-green-500">{outbox?.sent ?? 0}</div>
            <div className="text-[10px] uppercase text-green-500">Enviados</div>
          </div>
          <div className="p-3 bg-yellow-500/10 rounded-lg text-center text-yellow-600">
            <div className="text-2xl font-bold">{outbox?.failed ?? 0}</div>
            <div className="text-[10px] uppercase">Falhados</div>
          </div>
          <div className="p-3 bg-destructive/10 rounded-lg text-center text-destructive">
            <div className="text-2xl font-bold">{outbox?.dead ?? 0}</div>
            <div className="text-[10px] uppercase">Mortos</div>
          </div>
        </div>

        {diag?.integration?.found && diag.integration.last_error_message && (
          <div className="p-3 border border-destructive/20 bg-destructive/5 rounded text-xs text-destructive">
            <strong>Último erro de integração:</strong> {diag.integration.last_error_message}
            <div className="mt-1 text-[10px] opacity-70">Ocorrido em: {diag.integration.last_error_at}</div>
          </div>
        )}

        <div className="flex flex-wrap gap-2 pt-2">
          <Button 
            variant="outline" 
            size="sm" 
            onClick={() => runAction("reprocess_queue")}
            disabled={running === "reprocess_queue"}
          >
            {running === "reprocess_queue" ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            Reprocessar fila n8n
          </Button>
          <Button 
            variant="ghost" 
            size="sm" 
            className="text-muted-foreground"
            onClick={() => runAction("archive_dead")}
            disabled={running === "archive_dead"}
          >
            {running === "archive_dead" ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            Arquivar eventos mortos antigos
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};

export default N8nIntegration;
