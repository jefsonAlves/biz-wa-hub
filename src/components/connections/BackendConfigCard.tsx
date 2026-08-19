import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { CheckCircle2, Loader2, Server, XCircle } from "lucide-react";
import { getBackendConfig, saveBackendConfig, testBackendConfig } from "@/lib/whatsapp/backend";

interface Props {
  tenantId: string | null | undefined;
}

/** Cadastro do backend próprio (Baileys). O WhatsApp conecta sem n8n e sem Docker. */
export function BackendConfigCard({ tenantId }: Props) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: backend, isLoading } = useQuery({
    queryKey: ["whatsapp_backend_safe", tenantId],
    queryFn: () => getBackendConfig(tenantId),
    enabled: !!tenantId,
  });

  const [baseUrl, setBaseUrl] = useState("");
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [apiToken, setApiToken] = useState("");

  useEffect(() => {
    setBaseUrl(backend?.base_url ?? "");
    setAuthPassword("");
    setApiToken("");
  }, [backend?.base_url, tenantId]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!baseUrl.trim()) throw new Error("Informe a URL do backend.");
      await saveBackendConfig({
        tenantId,
        baseUrl: baseUrl.trim(),
        authEmail: authEmail.trim() || undefined,
        authPassword: authPassword || undefined,
        apiToken: apiToken.trim() || undefined,
      });
      return await testBackendConfig(tenantId);
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["whatsapp_backend_safe", tenantId] });
      toast({
        title: result.success ? "Backend conectado" : "Backend salvo, mas não respondeu",
        description: result.success
          ? "Já é possível criar conexões e escanear o QR Code."
          : result.error ?? `HTTP ${result.http_status ?? "?"}`,
        variant: result.success ? undefined : "destructive",
      });
    },
    onError: (e: Error) =>
      toast({ title: "Erro ao salvar backend", description: e.message, variant: "destructive" }),
  });

  const testMutation = useMutation({
    mutationFn: () => testBackendConfig(tenantId),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["whatsapp_backend_safe", tenantId] });
      toast({
        title: result.success ? "Backend online" : "Backend indisponível",
        description: result.success
          ? `Respondeu em ${result.duration_ms ?? 0} ms${
              result.sessions != null ? ` · ${result.sessions} sessão(ões)` : ""
            }`
          : result.error ?? `HTTP ${result.http_status ?? "?"}`,
        variant: result.success ? undefined : "destructive",
      });
    },
    onError: (e: Error) =>
      toast({ title: "Falha no teste", description: e.message, variant: "destructive" }),
  });

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Server className="h-4 w-4" />
          Backend próprio (Baileys)
          {backend && (
            <Badge variant={backend.status === "online" ? "default" : "secondary"} className="ml-auto">
              {backend.status === "online" ? "Online" : backend.status === "error" ? "Erro" : "Não testado"}
            </Badge>
          )}
        </CardTitle>
        <CardDescription>
          Conexão direta com o WhatsApp pelo seu backend Node.js. Funciona com o n8n desligado — o n8n fica
          apenas como automação opcional.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {isLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Carregando configuração...
          </div>
        ) : (
          <>
            <div className="space-y-2">
              <Label>URL do backend</Label>
              <Input
                value={baseUrl}
                onChange={(e) => setBaseUrl(e.target.value)}
                placeholder="https://api.suaempresa.com.br"
              />
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              <div className="space-y-2">
                <Label className="text-xs">E-mail admin do backend</Label>
                <Input
                  value={authEmail}
                  onChange={(e) => setAuthEmail(e.target.value)}
                  placeholder="admin@suaempresa.com"
                  className="h-8 text-sm"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-xs">Senha</Label>
                <Input
                  type="password"
                  value={authPassword}
                  onChange={(e) => setAuthPassword(e.target.value)}
                  placeholder={backend?.has_credentials ? "•••••• (mantida)" : "senha do admin"}
                  className="h-8 text-sm"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label className="text-xs">Ou token de API fixo (opcional)</Label>
              <Input
                type="password"
                value={apiToken}
                onChange={(e) => setApiToken(e.target.value)}
                placeholder="Bearer token do backend"
                className="h-8 text-sm"
              />
            </div>

            {backend?.last_error_message && (
              <div className="flex items-start gap-2 rounded border border-destructive/20 bg-destructive/10 p-2 text-xs text-destructive">
                <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                {backend.last_error_message}
              </div>
            )}
            {backend?.status === "online" && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <CheckCircle2 className="h-3.5 w-3.5 text-primary" />
                Última checagem:{" "}
                {backend.last_check_at ? new Date(backend.last_check_at).toLocaleString("pt-BR") : "—"}
              </div>
            )}

            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                onClick={() => saveMutation.mutate()}
                disabled={!tenantId || saveMutation.isPending}
              >
                {saveMutation.isPending && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}
                Salvar e testar
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => testMutation.mutate()}
                disabled={!tenantId || !backend || testMutation.isPending}
              >
                {testMutation.isPending && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}
                Testar conexão
              </Button>
            </div>
            <p className="text-[11px] text-muted-foreground">
              Credenciais ficam apenas no servidor: o navegador nunca recebe token nem senha.
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}
