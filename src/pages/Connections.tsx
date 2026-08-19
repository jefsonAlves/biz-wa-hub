import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Smartphone, Plus, QrCode, RefreshCw, PlugZap, Power, Loader2, ShieldCheck, AlertCircle, Building2, Trash2, Activity, CheckCircle2, XCircle } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  listConnections,
  sendConnectionCommand,
  deleteConnection,
  diagnoseN8n,
  CONNECTION_STATUS_LABELS,
  type SafeConnection,
  type ConnectionCommand,
  type N8nDiagnostics,
} from "@/lib/whatsapp/provider";


const statusVariant = (status: string) =>
  status === "connected" ? "default" : status === "error" ? "destructive" : "secondary";

const toQrImageSource = (value: string | null) => {
  const qr = value?.trim();
  if (!qr) return null;
  if (qr.startsWith("data:image/")) return qr;
  if (/^[A-Za-z0-9+/=\s]+$/.test(qr) && qr.replace(/\s/g, "").length > 100) {
    return `data:image/png;base64,${qr.replace(/\s/g, "")}`;
  }
  return null;
};

const toQrGeneratorUrl = (value: string | null) => {
  const qr = value?.trim();
  if (!qr || toQrImageSource(qr)) return null;
  return `https://api.qrserver.com/v1/create-qr-code/?size=320x320&data=${encodeURIComponent(qr)}`;
};

const DiagnosticRow = ({ ok, title, detail }: { ok: boolean; title: string; detail: string }) => (
  <div className="flex items-start gap-3 rounded-md border p-3">
    {ok
      ? <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5 text-primary" />
      : <XCircle className="h-4 w-4 shrink-0 mt-0.5 text-destructive" />}
    <div className="space-y-0.5">
      <p className="font-medium leading-none">{title}</p>
      <p className="text-xs text-muted-foreground">{detail}</p>
    </div>
  </div>
);

const Connections = () => {

  const { profile, isSuperAdmin } = useAuth();
  const [selectedTenantId, setSelectedTenantId] = useState<string | null>(null);
  
  // Use profile.tenant_id for regular users, and selectedTenantId for Super Admins
  const effectiveTenantId = isSuperAdmin ? selectedTenantId : profile?.tenant_id;
  
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [sessionId, setSessionId] = useState("");
  const [providerType, setProviderType] = useState<"n8n" | "meta">("n8n");
  const [metaConfig, setMetaConfig] = useState({ phone_number_id: "", waba_id: "", token: "" });
  const [pending, setPending] = useState<string | null>(null);
  const [qrConnectionId, setQrConnectionId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<SafeConnection | null>(null);
  const [diagnosticsOpen, setDiagnosticsOpen] = useState(false);
  const [diagnostics, setDiagnostics] = useState<N8nDiagnostics | null>(null);
  const previousStatuses = useRef<Record<string, string>>({});


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

  const { data: connections = [], isLoading } = useQuery({
    queryKey: ["whatsapp_connections_safe", effectiveTenantId],
    queryFn: listConnections,
    enabled: !!effectiveTenantId,
    refetchInterval: (query) => {
      const rows = (query.state.data ?? []) as SafeConnection[];
      return rows.some((connection) =>
        connection.status === "connecting" ||
        connection.status === "qr_pending" ||
        connection.qr_status === "pending"
      ) ? 2500 : 15000;
    },
  });

  const qrConnection = useMemo(
    () => connections.find((connection) => connection.id === qrConnectionId) ?? null,
    [connections, qrConnectionId],
  );

  const qrImageSource = toQrImageSource(qrConnection?.qr_code ?? null);
  const qrGeneratorUrl = toQrGeneratorUrl(qrConnection?.qr_code ?? null);
  const qrDisplaySource = qrImageSource ?? qrGeneratorUrl;

  useEffect(() => {
    for (const connection of connections) {
      const previous = previousStatuses.current[connection.id];
      if (connection.status === "connected" && previous && previous !== "connected") {
        if (qrConnectionId === connection.id) {
          setQrConnectionId(null);
          // Auto-redirect or state update could go here
        }
        toast({
          title: "WhatsApp conectado",
          description: `${connection.name} foi conectado com sucesso. Novas mensagens aparecerão no Inbox.`,
        });
        queryClient.invalidateQueries({ queryKey: ["dashboard-stats", effectiveTenantId] });
        queryClient.invalidateQueries({ queryKey: ["dashboard-chart", effectiveTenantId] });
        queryClient.invalidateQueries({ queryKey: ["conversations"] });
      }
      previousStatuses.current[connection.id] = connection.status;
    }
  }, [connections, qrConnectionId, queryClient, effectiveTenantId, toast]);

  useEffect(() => {
    if (!effectiveTenantId) return;

    const channel = supabase
      .channel(`whatsapp-connections-${effectiveTenantId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "whatsapp_connections",
          filter: `tenant_id=eq.${effectiveTenantId}`,
        },
        () => queryClient.invalidateQueries({ queryKey: ["whatsapp_connections_safe", effectiveTenantId] }),
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient, effectiveTenantId]);

  const createMutation = useMutation({
    mutationFn: async () => {
      if (!effectiveTenantId) throw new Error("Selecione uma empresa para cadastrar e conectar o WhatsApp.");
      
      const { data, error } = await supabase.functions.invoke("whatsapp-connection-command", {
        body: {
          command: "create_connection_entry",
          tenant_id: effectiveTenantId,
          name: name.trim() || "Novo número",
          provider_type: providerType === "meta" ? "meta_cloud" : "n8n_unofficial",
          provider_session_id: providerType === "n8n" ? (sessionId.trim() || null) : null,
          provider_token: providerType === "meta" ? metaConfig.token : null,
          phone_number_id: providerType === "meta" ? metaConfig.phone_number_id : null,
          waba_id: providerType === "meta" ? metaConfig.waba_id : null,
        },
      });
      
      if (error) throw error;
      if (data?.error) {
        throw new Error(data.details || data.error);
      }
    },
    onSuccess: () => {
      setOpen(false);
      setName("");
      setSessionId("");
      setMetaConfig({ phone_number_id: "", waba_id: "", token: "" });
      queryClient.invalidateQueries({ queryKey: ["whatsapp_connections_safe", effectiveTenantId] });
      toast({ title: "Conexão criada", description: "Gere a sessão para conectar o número." });
    },
    onError: (e: Error) => toast({ title: "Erro ao criar conexão", description: e.message, variant: "destructive" }),
  });

  const runCommand = async (
    connection: SafeConnection,
    command: ConnectionCommand,
    confirmDisconnect = false,
  ) => {
    setPending(`${connection.id}:${command}`);
    if (command === "generate_qr") setQrConnectionId(connection.id);

    try {
      const res = await sendConnectionCommand(connection.id, command, { confirmDisconnect });
      await queryClient.invalidateQueries({ queryKey: ["whatsapp_connections_safe", effectiveTenantId] });
      
      const isSync = command === "sync_messages";
      toast({
        title: res.warning ? "Aviso" : (isSync ? "Sincronização iniciada" : "Comando enfileirado"),
        description: res.warning ?? (command === "generate_qr"
          ? "Aguardando o QR Code do n8n. Se demorar, verifique o diagnóstico da conexão."
          : (isSync ? "O n8n está importando as mensagens em segundo plano." : "Aguardando a confirmação do n8n.")),
      });
      
      if (res.warning) {
        toast({
          title: "Aviso de Configuração",
          description: res.warning,
          variant: "destructive",
        });
      }
    } catch (e) {
      toast({ title: "Erro no comando", description: (e as Error).message, variant: "destructive" });
    } finally {
      setPending(null);
    }
  };

  const deleteMutation = useMutation({
    mutationFn: async (connection: SafeConnection) =>
      deleteConnection(connection.id, { confirmDelete: true }),
    onSuccess: () => {
      setDeleteTarget(null);
      queryClient.invalidateQueries({ queryKey: ["whatsapp_connections_safe", effectiveTenantId] });
      toast({ title: "Conexão excluída", description: "O histórico de conversas foi preservado." });
    },
    onError: (e: Error) =>
      toast({ title: "Erro ao excluir conexão", description: e.message, variant: "destructive" }),
  });

  const diagnoseMutation = useMutation({
    mutationFn: async () => diagnoseN8n(effectiveTenantId),
    onSuccess: (res) => setDiagnostics(res.diagnostics),
    onError: (e: any) => {
      setDiagnosticsOpen(false);
      const detail = e.context?.details || e.message;
      const cause = e.context?.cause;
      
      let toastMsg = detail;
      if (cause === "dns_error") {
        toastMsg = "URL pública do n8n expirada ou inacessível. Gere novo túnel e salve novamente.";
      }

      toast({ 
        title: "Falha no diagnóstico", 
        description: toastMsg, 
        variant: "destructive" 
      });
    },
  });

  const runDiagnostics = () => {
    setDiagnostics(null);
    setDiagnosticsOpen(true);
    diagnoseMutation.mutate();
  };



  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-bold">Conexões de WhatsApp</h1>
          <p className="text-muted-foreground">
            Múltiplos números por empresa, conectados por meio do n8n self-hosted.
          </p>
        </div>
        <div className="flex items-center gap-2">
        <Button variant="outline" onClick={runDiagnostics} disabled={!effectiveTenantId || diagnoseMutation.isPending}>
          {diagnoseMutation.isPending
            ? <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            : <Activity className="h-4 w-4 mr-2" />}
          Diagnosticar n8n
        </Button>
        <Dialog open={open} onOpenChange={setOpen}>

          <DialogTrigger asChild>
            <Button disabled={!effectiveTenantId}>
              <Plus className="h-4 w-4 mr-2" />Nova conexão
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Nova conexão</DialogTitle></DialogHeader>
            <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-2">
              <div className="space-y-2">
                <Label>Provedor</Label>
                <div className="grid grid-cols-2 gap-2">
                  <Button 
                    variant={providerType === "n8n" ? "default" : "outline"}
                    onClick={() => setProviderType("n8n")}
                    className="w-full"
                  >
                    n8n (Unofficial)
                  </Button>
                  <Button 
                    variant={providerType === "meta" ? "default" : "outline"}
                    onClick={() => setProviderType("meta")}
                    className="w-full"
                  >
                    Meta Cloud API
                  </Button>
                </div>
              </div>

              <div className="space-y-2">
                <Label>Nome do número</Label>
                <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex: Comercial" />
              </div>

              {providerType === "n8n" ? (
                <div className="space-y-2">
                  <Label>Identificador da sessão no n8n (opcional)</Label>
                  <Input value={sessionId} onChange={(e) => setSessionId(e.target.value)} placeholder="Ex: comercial-01" />
                  <p className="text-xs text-muted-foreground">
                    Usado pelo fluxo do n8n para identificar a sessão.
                  </p>
                </div>
              ) : (
                <div className="space-y-3 p-3 bg-muted/30 rounded-lg border border-border">
                  <h4 className="text-xs font-bold uppercase text-muted-foreground flex items-center gap-2">
                    <Building2 className="h-3 w-3" /> Configuração Meta
                  </h4>
                  <div className="space-y-2">
                    <Label className="text-xs">Phone Number ID</Label>
                    <Input 
                      value={metaConfig.phone_number_id} 
                      onChange={(e) => setMetaConfig({...metaConfig, phone_number_id: e.target.value})} 
                      placeholder="Identificador numérico da Meta" 
                      className="h-8 text-sm"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs">WABA ID</Label>
                    <Input 
                      value={metaConfig.waba_id} 
                      onChange={(e) => setMetaConfig({...metaConfig, waba_id: e.target.value})} 
                      placeholder="WhatsApp Business Account ID" 
                      className="h-8 text-sm"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs">Access Token (Permanent)</Label>
                    <Input 
                      type="password"
                      value={metaConfig.token} 
                      onChange={(e) => setMetaConfig({...metaConfig, token: e.target.value})} 
                      placeholder="EAA..." 
                      className="h-8 text-sm"
                    />
                  </div>
                  <p className="text-[10px] text-muted-foreground leading-tight">
                    A Meta Cloud API é serverless e mais estável para envios em massa.
                  </p>
                </div>
              )}
            </div>
            <DialogFooter>
              <Button onClick={() => createMutation.mutate()} disabled={createMutation.isPending}>
                {createMutation.isPending ? "Criando..." : "Criar conexão"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        </div>
      </div>


      {isSuperAdmin && (
        <div className="grid gap-6 md:grid-cols-2">
          <Card className="border-primary/20 bg-primary/5">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Building2 className="h-4 w-4" /> Empresa administrada
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Select value={selectedTenantId || ""} onValueChange={setSelectedTenantId}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Selecione uma empresa para gerenciar" />
                </SelectTrigger>
                <SelectContent>
                  {tenants.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </CardContent>
          </Card>

          <Card className="border-primary/20 bg-primary/5">
            <CardContent className="flex items-start gap-3 py-4 text-sm">
              <ShieldCheck className="h-5 w-5 text-primary shrink-0 mt-0.5" />
              <p className="text-muted-foreground">
                Credenciais de sessão nunca são expostas ao navegador. Todos os comandos passam por Edge Functions
                e são entregues ao n8n com assinatura HMAC SHA-256.
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      {isLoading ? (
        <div className="flex items-center gap-2 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Carregando conexões...</div>
      ) : !effectiveTenantId ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Building2 className="h-12 w-12 mx-auto mb-3 text-muted-foreground opacity-50" />
            <p className="text-muted-foreground font-medium">Selecione uma empresa para cadastrar e conectar o WhatsApp.</p>
          </CardContent>
        </Card>
      ) : connections.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Smartphone className="h-12 w-12 mx-auto mb-3 text-muted-foreground opacity-50" />
            <p className="text-muted-foreground">Nenhuma conexão cadastrada ainda.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {connections.map((conn) => {
            const busy = (cmd: string) => pending === `${conn.id}:${cmd}`;
            return (
              <Card key={conn.id}>
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Smartphone className="h-4 w-4" />
                    {conn.name}
                    <Badge variant={statusVariant(conn.status)} className="ml-auto">
                      {CONNECTION_STATUS_LABELS[conn.status] ?? conn.status}
                    </Badge>
                  </CardTitle>
                  <CardDescription>
                    {conn.phone_number ? `Número: ${conn.phone_number}` : "Número ainda não identificado"}
                    {" · "}Provedor: {conn.provider_type}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  {isSuperAdmin && (
                    <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                      <span>QR: {conn.qr_status ?? "—"}</span>
                      <span>Webhook: {conn.webhook_status ?? "—"}</span>
                      <span>Credenciais: {conn.has_credentials ? "configuradas" : "pendentes"}</span>
                      <span>
                        Checagem: {conn.last_health_check_at ? new Date(conn.last_health_check_at).toLocaleString("pt-BR") : "—"}
                      </span>
                    </div>
                  )}

                  {conn.connection_error && (
                    <div className="flex flex-col gap-1 p-2 rounded bg-destructive/10 border border-destructive/20 text-xs text-destructive">
                      <div className="flex items-center gap-2 font-semibold">
                        <AlertCircle className="h-3.5 w-3.5" />
                        Erro na Conexão / n8n
                      </div>
                      <p className="opacity-90">{conn.connection_error}</p>
                    </div>
                  )}

                  {conn.qr_status === "available" && !conn.qr_code && (
                    <div className="flex items-start gap-2 text-xs text-amber-700 dark:text-amber-400">
                      <AlertCircle className="h-4 w-4 shrink-0" />
                      O n8n informou que o QR está disponível, mas não enviou o conteúdo de data.qr_code.
                    </div>
                  )}

                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" onClick={() => runCommand(conn, "create_session")} disabled={busy("create_session") || conn.status === "connected"}>
                      <PlugZap className="h-3.5 w-3.5 mr-1" />{conn.status === "connected" ? "Sessão ativa" : "Criar sessão"}
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => runCommand(conn, "generate_qr")} disabled={busy("generate_qr") || conn.status === "connected"}>
                      {busy("generate_qr") ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <QrCode className="h-3.5 w-3.5 mr-1" />}
                      Gerar QR
                    </Button>
                    {conn.qr_status === "available" && conn.status !== "connected" && (
                      <Button size="sm" variant="default" className="bg-green-600 hover:bg-green-700" onClick={() => setQrConnectionId(conn.id)}>
                        <QrCode className="h-3.5 w-3.5 mr-1" />Escanear QR
                      </Button>
                    )}
                    <Button size="sm" variant="outline" onClick={() => runCommand(conn, "health_check")} disabled={busy("health_check")}>
                      <RefreshCw className={`h-3.5 w-3.5 mr-1 ${busy("health_check") ? "animate-spin" : ""}`} />Status
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => runCommand(conn, "sync_messages")}
                      disabled={busy("sync_messages") || conn.status !== "connected"}
                    >
                      <RefreshCw className={`h-3.5 w-3.5 mr-1 ${busy("sync_messages") ? "animate-spin" : ""}`} />
                      Atualizar mensagens
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        const confirmed = window.confirm(
                          `Desconectar ${conn.name}? A sessão permanecerá conectada se você cancelar.`,
                        );
                        if (confirmed) void runCommand(conn, "disconnect", true);
                      }}
                      disabled={busy("disconnect") || conn.status === "disconnected"}
                    >
                      <Power className="h-3.5 w-3.5 mr-1" />Desconectar
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-destructive hover:text-destructive hover:bg-destructive/10"
                      onClick={() => setDeleteTarget(conn)}
                    >
                      <Trash2 className="h-3.5 w-3.5 mr-1" />Excluir
                    </Button>
                  </div>

                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={!!qrConnectionId} onOpenChange={(isOpen) => !isOpen && setQrConnectionId(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Conectar WhatsApp</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col items-center gap-4 py-2 text-center">
            <div className="space-y-1">
              <p className="text-sm font-medium">Instruções:</p>
              <p className="text-sm text-muted-foreground">
                1. Abra o WhatsApp no seu celular.<br/>
                2. Vá em Configurações &gt; Aparelhos conectados.<br/>
                3. Toque em Conectar um aparelho e aponte a câmera para este código.
              </p>
            </div>

            {qrConnection?.qr_status === "available" && qrDisplaySource ? (
              <div className="rounded-lg border bg-white p-4">
                <img src={qrDisplaySource} alt="QR Code para conectar o WhatsApp" className="h-72 w-72 object-contain" />
              </div>
            ) : (pending === `${qrConnectionId}:generate_qr`) || qrConnection?.qr_status === "requested" || qrConnection?.qr_status === "pending" ? (
              <div className="flex min-h-[288px] w-full flex-col items-center justify-center gap-3 rounded-lg border bg-muted/20 p-6 text-center">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                <p className="text-sm font-medium">O n8n está gerando o QR Code...</p>
                <p className="text-xs text-muted-foreground">
                  Se demorar mais de 30 segundos, verifique se o túnel trycloudflare ainda está ativo no diagnóstico.
                </p>
              </div>
            ) : qrConnection?.qr_status === "available" && !qrDisplaySource ? (
              <div className="flex min-h-[288px] w-full flex-col items-center justify-center gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-6 text-center">
                <AlertCircle className="h-8 w-8 text-destructive" />
                <p className="font-medium">QR Code vazio</p>
                <p className="text-sm text-muted-foreground">
                  O servidor respondeu, mas não enviou a imagem do QR Code. Tente gerar novamente.
                </p>
              </div>
            ) : (
              <div className="flex min-h-[288px] w-full flex-col items-center justify-center gap-3 rounded-lg border bg-muted/20 p-6 text-center">
                {qrConnection?.connection_error ? (
                  <>
                    <XCircle className="h-8 w-8 text-destructive" />
                    <p className="font-medium text-destructive">Erro na conexão</p>
                    <p className="text-xs text-muted-foreground">{qrConnection.connection_error}</p>
                  </>
                ) : (
                  <>
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                    <p className="text-sm">Aguardando resposta do servidor n8n...</p>
                  </>
                )}
              </div>
            )}

            {qrConnection?.qr_expires_at && (
              <p className="text-xs text-muted-foreground">
                Expira em {new Date(qrConnection.qr_expires_at).toLocaleString("pt-BR")}.
              </p>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!deleteTarget} onOpenChange={(isOpen) => !isOpen && setDeleteTarget(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Excluir conexão</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Tem certeza que deseja excluir <strong className="text-foreground">{deleteTarget?.name}</strong>?
            As conversas já registradas continuam no Inbox, mas o número deixará de estar vinculado à plataforma.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>Cancelar</Button>
            <Button
              variant="destructive"
              disabled={deleteMutation.isPending}
              onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget)}
            >
              {deleteMutation.isPending
                ? <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                : <Trash2 className="h-4 w-4 mr-2" />}
              Excluir definitivamente
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={diagnosticsOpen} onOpenChange={setDiagnosticsOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Diagnóstico da comunicação com o n8n</DialogTitle>
          </DialogHeader>
          {diagnoseMutation.isPending || !diagnostics ? (
            <div className="flex flex-col items-center gap-3 py-10 text-sm text-muted-foreground">
              <Loader2 className="h-7 w-7 animate-spin text-primary" />
              Testando a comunicação com o n8n...
            </div>
          ) : (
            <div className="space-y-3 max-h-[65vh] overflow-y-auto pr-1 text-sm">
              <DiagnosticRow
                ok={diagnostics.integration.found && diagnostics.integration.status === "active"}
                title="Integração n8n ativa"
                detail={
                  diagnostics.integration.found
                    ? `${diagnostics.integration.name} · escopo ${diagnostics.integration.scope === "global" ? "global (plataforma)" : "da empresa"} · destino ${diagnostics.integration.target ?? "—"}`
                    : "Nenhuma integração ativa. Configure em Integração n8n."
                }
              />
              <DiagnosticRow
                ok={diagnostics.secret_configured}
                title="Segredo de assinatura (HMAC)"
                detail={diagnostics.secret_configured
                  ? "Configurado no servidor."
                  : "Não configurado — os eventos não podem ser assinados."}
              />
              <DiagnosticRow
                ok={!!diagnostics.webhook?.reachable}
                title="Webhook alcançável"
                detail={diagnostics.webhook?.reachable
                  ? `Respondeu HTTP ${diagnostics.webhook.http_status} em ${diagnostics.webhook.duration_ms} ms.`
                  : diagnostics.webhook?.error ?? "O n8n não respondeu à chamada de teste."}
              />
              
              {diagnostics.worker && (
                <DiagnosticRow
                  ok={diagnostics.worker.rpc_ok}
                  title="RPC public.claim_event_outbox"
                  detail={diagnostics.worker.rpc_ok
                    ? "A RPC existe e as permissões para service_role estão corretas."
                    : `Erro: ${diagnostics.worker.rpc_error || "Falha ao validar RPC."}`}
                />
              )}

              {diagnostics.worker && (
                <DiagnosticRow
                  ok={diagnostics.worker.is_active}
                  title="Health Check (Outbox Worker)"
                  detail={diagnostics.worker.last_poll_at
                    ? `n8n-poll-events respondendo. Última atividade: ${new Date(diagnostics.worker.last_poll_at).toLocaleString("pt-BR")}.`
                    : "Nenhuma atividade de poll detectada recentemente pelo worker."}
                />
              )}

              <DiagnosticRow
                ok={(diagnostics.outbox?.failed ?? 0) === 0}
                title="Fila de eventos"
                detail={`${diagnostics.outbox?.pending ?? 0} pendente(s), ${diagnostics.outbox?.failed ?? 0} com falha.`}
              />
              <DiagnosticRow
                ok={!!diagnostics.last_delivery?.success}
                title="Última entrega ao n8n"
                detail={diagnostics.last_delivery
                  ? `${new Date(diagnostics.last_delivery.created_at).toLocaleString("pt-BR")} · HTTP ${diagnostics.last_delivery.http_status ?? "—"}${diagnostics.last_delivery.error_message ? ` · ${diagnostics.last_delivery.error_message}` : ""}`
                  : "Nenhuma entrega registrada ainda."}
              />
              <DiagnosticRow
                ok={!!diagnostics.last_inbound_event}
                title="Retorno recebido do n8n"
                detail={diagnostics.last_inbound_event
                  ? `${new Date(diagnostics.last_inbound_event.received_at).toLocaleString("pt-BR")} · ${diagnostics.last_inbound_event.event_type}`
                  : "Nenhum callback assinado recebido do n8n até agora."}
              />

               {!diagnostics.webhook?.reachable && (
                <div className="flex flex-col gap-3 p-4 rounded-md border border-destructive/30 bg-destructive/5 text-xs text-destructive">
                  <div className="flex items-start gap-2">
                    <AlertCircle className="h-4 w-4 shrink-0" />
                    <p className="font-bold whitespace-pre-wrap">IMPORTANTE: a arquitetura da conexão WhatsApp deve seguir o código-fonte fornecido.

O projeto já possui conexão direta com WhatsApp através do Baileys executado pelo backend Node.js/TypeScript.

Portanto:

NÃO torne n8n obrigatório para conectar WhatsApp.

NÃO torne Docker obrigatório para conectar WhatsApp.

NÃO crie o fluxo Frontend → n8n → WhatsApp.

O fluxo principal deve ser:

Frontend → Backend → Baileys → WhatsApp

O backend já possui recursos relacionados a makeWASocket(), StartWhatsAppSession, connection.update, QR Code, listeners de mensagens e Socket.IO. Esses componentes devem ser aproveitados e organizados, e não substituídos por uma conexão controlada pelo n8n.

O n8n deve existir apenas como recurso opcional de automação, por exemplo:

Mensagem recebida → Backend → Evento → n8n, se houver automação ativa.

Se o n8n estiver offline, o WhatsApp deve continuar funcionando normalmente.

Docker deve ser tratado exclusivamente como uma opção de infraestrutura/deploy. Redis, banco, n8n, Ollama e até o backend podem ou não estar em containers, sem modificar a lógica do WhatsApp.

O critério obrigatório de validação é:

Com n8n desligado ou não configurado, o usuário precisa conseguir clicar em “Conectar WhatsApp”, visualizar o QR Code, escaneá-lo, obter status “Conectado”, receber mensagens no painel e responder pelo próprio sistema.</p>
                  </div>
                  
                  <div className="space-y-3 opacity-95">
                    <p>
                      Please think step-by-step in order to resolve it.
                    </p>
                    
                     <div className="p-2 bg-destructive/10 rounded font-mono text-[10px] border border-destructive/20 whitespace-pre-wrap">
{`Edge function returned 500: Error, {"error":"Erro interno no servidor","details":"[object Object]","cause":"unknown","name":"Error","timestamp":1786848547760}

{
  "timestamp": 1786848547670,
  "error_type": "RUNTIME_ERROR",
  "filename": "supabase/functions/n8n-test-connection/index.ts",
  "lineno": 0,
  "colno": 0,
  "stack": "not_applicable",
  "has_blank_screen": true
}`}
                    </div>
                    

                    <div className="space-y-1.5 border-t border-destructive/20 pt-2">
                      <p className="font-bold uppercase text-[10px] tracking-wider">Passos para resolução:</p>
                      <ul className="list-disc pl-4 space-y-0.5 opacity-80">
                        <li>Validar se a RPC <code>public.claim_event_outbox</code> existe no banco.</li>
                        <li>Verificar permissões de <code>EXECUTE</code> para <code>service_role</code>.</li>
                        <li>Garantir que os segredos n8n estejam injetados no projeto.</li>
                      </ul>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDiagnosticsOpen(false)}>Fechar</Button>
            <Button onClick={() => diagnoseMutation.mutate()} disabled={diagnoseMutation.isPending}>
              <RefreshCw className={`h-4 w-4 mr-2 ${diagnoseMutation.isPending ? "animate-spin" : ""}`} />
              Testar novamente
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>

  );
};

export default Connections;
