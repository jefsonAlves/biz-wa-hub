import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bot, CheckCircle2, AlertCircle, Loader2, ShieldQuestion, Server } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "@/hooks/use-toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";

type Provider = "ollama" | "openai" | "gemini";
type Status = "not_configured" | "validating" | "active" | "error";

interface ProviderRow {
  id: string;
  provider: Provider;
  model: string | null;
  base_url: string | null;
  status: Status;
  is_active: boolean;
  last_validated_at: string | null;
  validation_error: string | null;
}

const PROVIDERS: { id: Provider; name: string; description: string; secret: string | null; defaultModel: string }[] = [
  {
    id: "ollama",
    name: "Ollama (local)",
    description: "Classificador principal de baixo custo: intenção, setor, urgência, sentimento e resumo.",
    secret: null,
    defaultModel: "llama3.1",
  },
  {
    id: "openai",
    name: "OpenAI",
    description: "Provedor opcional para redigir respostas ou atuar como fallback.",
    secret: "OPENAI_API_KEY",
    defaultModel: "gpt-4o-mini",
  },
  {
    id: "gemini",
    name: "Google Gemini",
    description: "Provedor opcional para redigir respostas ou atuar como fallback.",
    secret: "GEMINI_API_KEY",
    defaultModel: "gemini-2.5-flash",
  },
];

const STATUS_META: Record<Status, { label: string; icon: typeof CheckCircle2; className: string }> = {
  not_configured: { label: "Não configurado", icon: ShieldQuestion, className: "text-muted-foreground" },
  validating: { label: "Validando", icon: Loader2, className: "text-amber-500" },
  active: { label: "Ativo", icon: CheckCircle2, className: "text-emerald-500" },
  error: { label: "Erro", icon: AlertCircle, className: "text-destructive" },
};

function StatusBadge({ status }: { status: Status }) {
  const meta = STATUS_META[status];
  const Icon = meta.icon;
  return (
    <Badge variant="outline" className="gap-1">
      <Icon className={`h-3 w-3 ${meta.className} ${status === "validating" ? "animate-spin" : ""}`} aria-hidden="true" />
      <span>{meta.label}</span>
    </Badge>
  );
}

export default function AiProviders() {
  const { profile } = useAuth() as { profile?: { tenant_id?: string | null } };
  const tenantId = profile?.tenant_id ?? null;
  const queryClient = useQueryClient();
  const [drafts, setDrafts] = useState<Record<string, { model: string; base_url: string }>>({});

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["ai-provider-settings", tenantId],
    enabled: !!tenantId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ai_provider_settings")
        .select("id, provider, model, base_url, status, is_active, last_validated_at, validation_error")
        .order("provider");
      if (error) throw error;
      return (data ?? []) as ProviderRow[];
    },
  });

  const save = useMutation({
    mutationFn: async (provider: Provider) => {
      if (!tenantId) throw new Error("Empresa não identificada");
      const preset = PROVIDERS.find((p) => p.id === provider)!;
      const existing = rows.find((r) => r.provider === provider);
      const draft = drafts[provider] ?? {
        model: existing?.model ?? preset.defaultModel,
        base_url: existing?.base_url ?? (provider === "ollama" ? "http://localhost:11434" : ""),
      };
      const payload = {
        tenant_id: tenantId,
        provider,
        model: draft.model || preset.defaultModel,
        base_url: draft.base_url || null,
        api_key_secret_name: preset.secret,
      };
      const { error } = await supabase
        .from("ai_provider_settings")
        .upsert(payload, { onConflict: "tenant_id,provider" });
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: "Configuração salva" });
      queryClient.invalidateQueries({ queryKey: ["ai-provider-settings", tenantId] });
    },
    onError: (error: Error) => toast({ title: "Não foi possível salvar", description: error.message, variant: "destructive" }),
  });

  const validate = useMutation({
    mutationFn: async (provider: Provider) => {
      const { data, error } = await supabase.functions.invoke("ai-provider-validate", { body: { provider } });
      if (error) throw error;
      return data as { status: Status; message?: string; required_secret?: string | null };
    },
    onSuccess: (data) => {
      toast({
        title: data.status === "active" ? "Provedor validado" : "Provedor não validado",
        description: data.required_secret
          ? `Falta configurar o segredo ${data.required_secret} no backend.`
          : data.message,
        variant: data.status === "active" ? "default" : "destructive",
      });
      queryClient.invalidateQueries({ queryKey: ["ai-provider-settings", tenantId] });
    },
    onError: (error: Error) => toast({ title: "Falha na validação", description: error.message, variant: "destructive" }),
  });

  const toggleActive = useMutation({
    mutationFn: async ({ id, value }: { id: string; value: boolean }) => {
      const { error } = await supabase.from("ai_provider_settings").update({ is_active: value }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["ai-provider-settings", tenantId] }),
    onError: (error: Error) => toast({ title: "Não foi possível alterar", description: error.message, variant: "destructive" }),
  });

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="flex items-center gap-2 text-2xl font-semibold text-foreground">
          <Bot className="h-6 w-6 text-primary" aria-hidden="true" /> Configuração de IA
        </h1>
        <p className="text-sm text-muted-foreground">
          Configure os provedores de inteligência artificial da sua empresa. As chaves ficam apenas no backend —
          esta tela mostra somente o estado da configuração.
        </p>
      </header>

      {isLoading ? (
        <div className="space-y-4">
          <Skeleton className="h-40 w-full" />
          <Skeleton className="h-40 w-full" />
        </div>
      ) : (
        <div className="grid gap-4">
          {PROVIDERS.map((preset) => {
            const row = rows.find((r) => r.provider === preset.id);
            const draft = drafts[preset.id] ?? {
              model: row?.model ?? preset.defaultModel,
              base_url: row?.base_url ?? (preset.id === "ollama" ? "http://localhost:11434" : ""),
            };
            const setDraft = (patch: Partial<typeof draft>) =>
              setDrafts((prev) => ({ ...prev, [preset.id]: { ...draft, ...patch } }));

            return (
              <Card key={preset.id}>
                <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3">
                  <div className="space-y-1">
                    <CardTitle className="flex items-center gap-2 text-base">
                      <Server className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                      {preset.name}
                    </CardTitle>
                    <CardDescription>{preset.description}</CardDescription>
                  </div>
                  <StatusBadge status={row?.status ?? "not_configured"} />
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor={`model-${preset.id}`}>Modelo</Label>
                      <Input
                        id={`model-${preset.id}`}
                        value={draft.model}
                        placeholder={preset.defaultModel}
                        onChange={(e) => setDraft({ model: e.target.value })}
                      />
                    </div>
                    {preset.id === "ollama" && (
                      <div className="space-y-2">
                        <Label htmlFor={`url-${preset.id}`}>URL do servidor</Label>
                        <Input
                          id={`url-${preset.id}`}
                          value={draft.base_url}
                          placeholder="http://localhost:11434"
                          onChange={(e) => setDraft({ base_url: e.target.value })}
                        />
                      </div>
                    )}
                    {preset.secret && (
                      <div className="space-y-2">
                        <Label>Chave de API</Label>
                        <p className="rounded-md border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
                          Armazenada no backend como <code className="font-mono">{preset.secret}</code>. Nunca exibida aqui.
                        </p>
                      </div>
                    )}
                  </div>

                  {row?.validation_error && (
                    <p className="text-sm text-destructive">{row.validation_error}</p>
                  )}
                  {row?.last_validated_at && (
                    <p className="text-xs text-muted-foreground">
                      Última validação: {new Date(row.last_validated_at).toLocaleString("pt-BR")}
                    </p>
                  )}

                  <div className="flex flex-wrap items-center gap-3">
                    <Button onClick={() => save.mutate(preset.id)} disabled={save.isPending}>
                      Salvar
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => validate.mutate(preset.id)}
                      disabled={!row || validate.isPending}
                    >
                      {validate.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                      Validar conexão
                    </Button>
                    {row && (
                      <div className="flex items-center gap-2">
                        <Switch
                          id={`active-${preset.id}`}
                          checked={row.is_active}
                          disabled={row.status !== "active"}
                          onCheckedChange={(value) => toggleActive.mutate({ id: row.id, value })}
                        />
                        <Label htmlFor={`active-${preset.id}`} className="text-sm">
                          Habilitar para atendimento
                        </Label>
                      </div>
                    )}
                  </div>
                  {row && row.status !== "active" && (
                    <p className="text-xs text-muted-foreground">
                      Só é possível habilitar o provedor depois de uma validação bem-sucedida.
                    </p>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
