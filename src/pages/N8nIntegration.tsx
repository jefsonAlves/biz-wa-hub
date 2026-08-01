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
import { Workflow, ShieldCheck, Loader2, Copy } from "lucide-react";
import { testN8nIntegration } from "@/lib/whatsapp/provider";

const N8nIntegration = () => {
  const { profile } = useAuth();
  const tenantId = profile?.tenant_id;
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [baseUrl, setBaseUrl] = useState("");
  const [webhookPath, setWebhookPath] = useState("/webhook/platform");
  const [environment, setEnvironment] = useState("production");
  const [active, setActive] = useState(true);
  const [testing, setTesting] = useState(false);

  const receiverUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/n8n-webhook-receiver`;

  const { data: integration, isLoading } = useQuery({
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

  useEffect(() => {
    if (integration) {
      setBaseUrl(integration.base_url ?? "");
      setWebhookPath(integration.webhook_path ?? "/webhook/platform");
      setEnvironment(integration.environment ?? "production");
      setActive(integration.status === "active");
    }
  }, [integration]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!tenantId) throw new Error("Sem empresa vinculada");
      const payload = {
        base_url: baseUrl.trim().replace(/\/+$/, ""),
        webhook_path: webhookPath.trim() || "/webhook/platform",
        environment,
        status: active ? "active" : "inactive",
      };
      if (integration) {
        const { error } = await supabase.from("n8n_integrations").update(payload).eq("id", integration.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("n8n_integrations").insert({
          tenant_id: tenantId,
          name: "n8n self-hosted",
          ...payload,
        });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["n8n_integration"] });
      toast({ title: "Integração salva" });
    },
    onError: (e: Error) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  const runTest = async () => {
    setTesting(true);
    try {
      const res = await testN8nIntegration();
      if (res?.error) throw new Error(res.error);
      toast({ title: "n8n respondeu", description: `HTTP ${res?.http_status ?? "ok"}` });
      queryClient.invalidateQueries({ queryKey: ["n8n_integration"] });
    } catch (e) {
      toast({ title: "Falha no teste", description: (e as Error).message, variant: "destructive" });
    } finally {
      setTesting(false);
    }
  };

  const copy = (value: string) => {
    navigator.clipboard.writeText(value);
    toast({ title: "Copiado" });
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Integração n8n</h1>
        <p className="text-muted-foreground">
          O n8n é o orquestrador de automações, IA e do canal de WhatsApp. O Supabase permanece a fonte oficial dos dados.
        </p>
      </div>

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
                  <Input value={webhookPath} onChange={(e) => setWebhookPath(e.target.value)} placeholder="/webhook/platform" />
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
    </div>
  );
};

export default N8nIntegration;
