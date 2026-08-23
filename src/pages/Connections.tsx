import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertCircle,
  Building2,
  CheckCircle2,
  Loader2,
  MessageSquare,
  Plus,
  Power,
  QrCode,
  RefreshCw,
  Smartphone,
  Trash2,
  Wifi,
  WifiOff,
} from "lucide-react";
import { deleteConnection, listConnections, type SafeConnection } from "@/lib/whatsapp/provider";
import {
  checkWhatsAppBackend,
  createBackendConnection,
  runBackendConnectionAction,
} from "@/lib/whatsapp/backend";

const STATE_LABELS: Record<string, string> = {
  connected: "Conectado",
  connecting: "Conectando...",
  qr_pending: "Aguardando QR Code",
  disconnecting: "Desconectando...",
  disconnected: "Desconectado",
  error: "Erro na conexão",
};

const stateOf = (conn: SafeConnection) => {
  if (conn.status === "connected") return "connected";
  if (conn.status === "error") return "error";
  if (conn.qr_status === "available") return "qr_pending";
  if (
    conn.status === "connecting" ||
    conn.qr_status === "requested" ||
    conn.qr_status === "pending"
  ) {
    return "connecting";
  }
  if (conn.status === "disconnecting") return "disconnecting";
  return "disconnected";
};

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

const Connections = () => {
  const { profile, isSuperAdmin } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [selectedTenantId, setSelectedTenantId] = useState<string | null>(null);
  const effectiveTenantId = isSuperAdmin ? selectedTenantId : profile?.tenant_id;

  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [pending, setPending] = useState<string | null>(null);
  const [qrConnectionId, setQrConnectionId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<SafeConnection | null>(null);
  const [backendReady, setBackendReady] = useState(false);
  const [qrSecondsLeft, setQrSecondsLeft] = useState<number | null>(null);
  const previousStatuses = useRef<Record<string, string>>({});

  useEffect(() => {
    setBackendReady(false);
    setQrConnectionId(null);
  }, [effectiveTenantId]);

  const { data: tenants = [] } = useQuery({
    queryKey: ["admin-tenants-list"],
    queryFn: async () => {
      const { data, error } = await supabase.from("tenants").select("id, name").order("name");
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
      return rows.some((connection) => {
        const state = stateOf(connection);
        return state === "connecting" || state === "qr_pending";
      })
        ? 2000
        : 15000;
    },
  });

  const qrConnection = useMemo(
    () => connections.find((connection) => connection.id === qrConnectionId) ?? null,
    [connections, qrConnectionId],
  );

  const qrDisplaySource =
    toQrImageSource(qrConnection?.qr_code ?? null) ?? toQrGeneratorUrl(qrConnection?.qr_code ?? null);

  useEffect(() => {
    if (!qrConnectionId || !qrConnection?.qr_expires_at) {
      setQrSecondsLeft(null);
      return;
    }
    const update = () => {
      const remaining = Math.max(
        0,
        Math.ceil((new Date(qrConnection.qr_expires_at as string).getTime() - Date.now()) / 1000),
      );
      setQrSecondsLeft(remaining);
    };
    update();
    const timer = setInterval(update, 1000);
    return () => clearInterval(timer);
  }, [qrConnectionId, qrConnection?.qr_expires_at]);

  useEffect(() => {
    for (const connection of connections) {
      const previous = previousStatuses.current[connection.id];
      if (connection.status === "connected" && previous && previous !== "connected") {
        setBackendReady(true);
        if (qrConnectionId === connection.id) setQrConnectionId(null);
        toast({
          title: "WhatsApp conectado",
          description: `${connection.name} está pronto para receber e enviar mensagens.`,
        });
        queryClient.invalidateQueries({ queryKey: ["dashboard-stats", effectiveTenantId] });
        queryClient.invalidateQueries({ queryKey: ["conversations"] });
      }
      previousStatuses.current[connection.id] = connection.status;
    }
  }, [connections, qrConnectionId, effectiveTenantId, queryClient, toast]);

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
        () =>
          queryClient.invalidateQueries({
            queryKey: ["whatsapp_connections_safe", effectiveTenantId],
          }),
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [effectiveTenantId, queryClient]);

  const verifyBackend = async () => {
    const result = await checkWhatsAppBackend(effectiveTenantId);
    const ready = result.success === true && result.backend_configured !== false;
    setBackendReady(ready);
    if (!ready) {
      throw new Error(result.message || "O servidor do WhatsApp não respondeu corretamente.");
    }
    return result;
  };

  const connect = async (connectionId: string) => {
    if (!backendReady) {
      toast({
        title: "Verifique o servidor primeiro",
        description: "Clique em Atualizar. Quando o servidor ficar online, o botão para gerar o QR Code será liberado.",
      });
      return;
    }

    setPending(`${connectionId}:connect`);
    try {
      await verifyBackend();
      const started = await runBackendConnectionAction(connectionId, "start_session", effectiveTenantId);
      if (!started.success) {
        throw new Error(started.message || "Não foi possível iniciar a sessão do WhatsApp.");
      }

      setQrConnectionId(connectionId);
      await new Promise((resolve) => setTimeout(resolve, 1000));
      await runBackendConnectionAction(connectionId, "refresh_status", effectiveTenantId).catch(() => null);
      await queryClient.invalidateQueries({
        queryKey: ["whatsapp_connections_safe", effectiveTenantId],
      });
    } catch (e) {
      setBackendReady(false);
      setQrConnectionId(null);
      toast({
        title: "Não foi possível gerar o QR Code",
        description: (e as Error).message,
        variant: "destructive",
      });
    } finally {
      setPending(null);
    }
  };

  const createMutation = useMutation({
    mutationFn: async () => {
      if (!effectiveTenantId) throw new Error("Selecione uma empresa para adicionar o WhatsApp.");
      return createBackendConnection({
        tenantId: effectiveTenantId,
        name: name.trim() || "WhatsApp",
        provider: "baileys",
      });
    },
    onSuccess: async (created) => {
      setOpen(false);
      setName("");
      setBackendReady(false);
      await queryClient.invalidateQueries({
        queryKey: ["whatsapp_connections_safe", effectiveTenantId],
      });
      toast({
        title: "WhatsApp cadastrado",
        description:
          created.message ||
          "Conexão cadastrada. Clique em Atualizar para testar o servidor e liberar a geração do QR Code.",
      });
    },
    onError: (e: Error) =>
      toast({
        title: "Erro ao cadastrar WhatsApp",
        description: e.message,
        variant: "destructive",
      }),
  });

  const refresh = async (connectionId: string) => {
    setPending(`${connectionId}:refresh`);
    try {
      const health = await verifyBackend();

      const connection = connections.find((item) => item.id === connectionId);
      const state = connection ? stateOf(connection) : "disconnected";
      if (state === "connected" || state === "connecting" || state === "qr_pending") {
        await runBackendConnectionAction(connectionId, "refresh_status", effectiveTenantId).catch(() => null);
      }

      await queryClient.invalidateQueries({
        queryKey: ["whatsapp_connections_safe", effectiveTenantId],
      });
      toast({
        title: "Servidor WhatsApp online",
        description: `${health.service || "Baileys"} respondeu corretamente. Agora você pode gerar o QR Code.`,
      });
    } catch (e) {
      setBackendReady(false);
      toast({
        title: "Servidor WhatsApp offline",
        description: (e as Error).message,
        variant: "destructive",
      });
    } finally {
      setPending(null);
    }
  };

  const disconnect = async (connectionId: string) => {
    setPending(`${connectionId}:disconnect`);
    try {
      await runBackendConnectionAction(connectionId, "disconnect", effectiveTenantId);
      await queryClient.invalidateQueries({
        queryKey: ["whatsapp_connections_safe", effectiveTenantId],
      });
      toast({ title: "WhatsApp desconectado" });
    } catch (e) {
      toast({
        title: "Erro ao desconectar",
        description: (e as Error).message,
        variant: "destructive",
      });
    } finally {
      setPending(null);
    }
  };

  const deleteMutation = useMutation({
    mutationFn: async (connection: SafeConnection) =>
      deleteConnection(connection.id, { confirmDelete: true }),
    onSuccess: () => {
      setDeleteTarget(null);
      queryClient.invalidateQueries({
        queryKey: ["whatsapp_connections_safe", effectiveTenantId],
      });
      toast({ title: "WhatsApp removido", description: "O histórico de conversas foi preservado." });
    },
    onError: (e: Error) =>
      toast({ title: "Erro ao remover", description: e.message, variant: "destructive" }),
  });

  useEffect(() => {
    if (!qrConnectionId) return;
    const state = qrConnection ? stateOf(qrConnection) : "connecting";
    if (state === "connected") return;

    const poll = async () => {
      try {
        const result = await runBackendConnectionAction(qrConnectionId, "refresh_status", effectiveTenantId);
        if (result.backend_configured === false) setBackendReady(false);
        await queryClient.invalidateQueries({
          queryKey: ["whatsapp_connections_safe", effectiveTenantId],
        });
      } catch {
        // A sessão continuará sendo consultada no próximo ciclo.
      }
    };

    void poll();
    const timer = setInterval(poll, 2000);
    return () => clearInterval(timer);
  }, [qrConnectionId, qrConnection, effectiveTenantId, queryClient]);

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border bg-card p-6 shadow-sm">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <div className="rounded-xl bg-primary/10 p-2 text-primary">
                <Smartphone className="h-5 w-5" />
              </div>
              <h1 className="text-2xl font-bold md:text-3xl">Conexões WhatsApp</h1>
            </div>
            <p className="text-sm text-muted-foreground md:text-base">
              Sincronize o projeto com a branch main do GitHub.
              
              Commit obrigatório:
              
              6b006df0eec139e9bf6774ea6b87606b76550205
              
              Depois faça deploy/redeploy da Edge Function:
              
              whatsapp-baileys-webhook
              
              Confirme também que o Secret:
              
              WHATSAPP_BACKEND_TOKEN
              
              continua configurado.
              
              Não altere a arquitetura.
              
              Não use n8n para mensagens WhatsApp.
              
              O backend Baileys agora já possui fallback automático para a URL da Edge Function, portanto não é necessário cadastrar WHATSAPP_WEBHOOK_URL manualmente no Northflank.
              
              Após o deploy, teste recebendo uma NOVA mensagem no WhatsApp conectado.
              
              Verifique se foram criados registros nas tabelas:
              
              contacts
              
              conversations
              
              messages
              
              e se a conversa aparece no Inbox em tempo real.
              
              Se houver erro no webhook, informe o status HTTP e a mensagem exata.
            </p>
          </div>

          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button disabled={!effectiveTenantId} className="md:self-start">
                <Plus className="mr-2 h-4 w-4" />
                Nova conexão
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-sm">
              <DialogHeader>
                <DialogTitle>Adicionar WhatsApp</DialogTitle>
              </DialogHeader>
              <div className="space-y-3">
                <div className="space-y-2">
                  <Label>Nome da conexão</Label>
                  <Input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Ex.: Comercial, Suporte, Financeiro"
                  />
                </div>
                <div className="rounded-lg border bg-muted/30 p-3 text-xs text-muted-foreground">
                  Após cadastrar, clique em Atualizar para validar a comunicação com o servidor WhatsApp.
                </div>
              </div>
              <DialogFooter>
                <Button onClick={() => createMutation.mutate()} disabled={createMutation.isPending}>
                  {createMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Cadastrar conexão
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {isSuperAdmin && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Building2 className="h-4 w-4" /> Empresa
            </CardTitle>
            <CardDescription>Selecione a empresa cujas conexões deseja administrar.</CardDescription>
          </CardHeader>
          <CardContent>
            <Select value={selectedTenantId || ""} onValueChange={setSelectedTenantId}>
              <SelectTrigger className="max-w-md">
                <SelectValue placeholder="Selecione uma empresa" />
              </SelectTrigger>
              <SelectContent>
                {tenants.map((tenant) => (
                  <SelectItem key={tenant.id} value={tenant.id}>
                    {tenant.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </CardContent>
        </Card>
      )}

      {isLoading ? (
        <div className="flex items-center gap-2 py-10 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Carregando conexões...
        </div>
      ) : !effectiveTenantId ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Building2 className="mx-auto mb-3 h-10 w-10 text-muted-foreground/50" />
            <p className="font-medium">Selecione uma empresa para gerenciar as conexões.</p>
          </CardContent>
        </Card>
      ) : connections.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center py-14 text-center">
            <div className="mb-4 rounded-full bg-muted p-4">
              <Smartphone className="h-8 w-8 text-muted-foreground" />
            </div>
            <h2 className="font-semibold">Nenhum WhatsApp cadastrado</h2>
            <p className="mt-1 max-w-md text-sm text-muted-foreground">
              Cadastre uma conexão e valide o servidor antes de gerar o QR Code.
            </p>
            <Button className="mt-5" onClick={() => setOpen(true)}>
              <Plus className="mr-2 h-4 w-4" /> Adicionar WhatsApp
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {connections.map((conn) => {
            const state = stateOf(conn);
            const busy = (cmd: string) => pending === `${conn.id}:${cmd}`;
            const connected = state === "connected";
            const serverOnline = connected || backendReady;
            const badgeLabel = connected ? "Conectado" : serverOnline ? "Servidor online" : "Desconectado";

            return (
              <Card key={conn.id} className="overflow-hidden">
                <CardHeader className="pb-3">
                  <div className="flex items-start gap-3">
                    <div
                      className={`rounded-xl p-2.5 ${
                        serverOnline ? "bg-emerald-100 text-emerald-700" : "bg-muted text-muted-foreground"
                      }`}
                    >
                      {serverOnline ? <Wifi className="h-5 w-5" /> : <WifiOff className="h-5 w-5" />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <CardTitle className="truncate text-base">{conn.name}</CardTitle>
                      <CardDescription className="mt-1">
                        {connected && conn.phone_number
                          ? conn.phone_number
                          : serverOnline
                            ? `Servidor online • WhatsApp: ${STATE_LABELS[state]}`
                            : `Status: ${STATE_LABELS[state]}`}
                      </CardDescription>
                    </div>
                    <Badge
                      variant={connected ? "default" : "secondary"}
                      className={serverOnline ? "bg-emerald-100 text-emerald-700 hover:bg-emerald-100" : undefined}
                    >
                      {badgeLabel}
                    </Badge>
                  </div>
                </CardHeader>

                <CardContent className="space-y-4">
                  {conn.connection_error && state === "error" && (
                    <div className="flex items-start gap-2 rounded-lg border border-destructive/20 bg-destructive/5 p-3 text-sm">
                      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
                      <p className="text-muted-foreground">{conn.connection_error}</p>
                    </div>
                  )}

                  {connected ? (
                    <div className="flex flex-wrap gap-2">
                      <Button size="sm" asChild>
                        <Link to="/inbox">
                          <MessageSquare className="mr-2 h-4 w-4" /> Abrir conversas
                        </Link>
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          if (window.confirm(`Desconectar ${conn.name}?`)) void disconnect(conn.id);
                        }}
                        disabled={busy("disconnect")}
                      >
                        <Power className="mr-2 h-4 w-4" /> Desconectar
                      </Button>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <div className="flex flex-wrap gap-2">
                        <Button
                          size="sm"
                          onClick={() => connect(conn.id)}
                          disabled={!backendReady || busy("connect")}
                        >
                          {busy("connect") ? (
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          ) : (
                            <QrCode className="mr-2 h-4 w-4" />
                          )}
                          Conectar WhatsApp
                        </Button>
                        {state === "qr_pending" && (
                          <Button size="sm" variant="outline" onClick={() => setQrConnectionId(conn.id)}>
                            <QrCode className="mr-2 h-4 w-4" /> Ver QR Code
                          </Button>
                        )}
                      </div>
                      {!backendReady && (
                        <p className="text-xs text-muted-foreground">
                          Clique em Atualizar para testar o servidor e liberar a geração do QR Code.
                        </p>
                      )}
                    </div>
                  )}

                  <div className="flex items-center justify-between border-t pt-3">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => refresh(conn.id)}
                      disabled={busy("refresh")}
                      className={backendReady ? "text-emerald-700 hover:text-emerald-700" : undefined}
                    >
                      {backendReady ? (
                        <CheckCircle2 className="mr-2 h-4 w-4" />
                      ) : (
                        <RefreshCw className={`mr-2 h-4 w-4 ${busy("refresh") ? "animate-spin" : ""}`} />
                      )}
                      {backendReady ? "Servidor online" : "Atualizar"}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-destructive hover:text-destructive"
                      onClick={() => setDeleteTarget(conn)}
                    >
                      <Trash2 className="mr-2 h-4 w-4" /> Remover
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
            <DialogTitle>Escaneie o QR Code</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col items-center gap-4 py-2 text-center">
            <Badge variant={qrDisplaySource && qrSecondsLeft !== 0 ? "default" : "secondary"}>
              {qrDisplaySource
                ? qrSecondsLeft === 0
                  ? "QR Code expirado"
                  : `QR Code ativo${qrSecondsLeft !== null ? ` • expira em ${qrSecondsLeft}s` : ""}`
                : "Aguardando o servidor gerar o QR Code"}
            </Badge>
            {qrDisplaySource ? (
              <div className="rounded-2xl border bg-white p-4 shadow-sm">
                <img
                  src={qrDisplaySource}
                  alt="QR Code para conectar o WhatsApp"
                  className="h-72 w-72 object-contain"
                />
              </div>
            ) : (
              <div className="flex h-72 w-72 flex-col items-center justify-center gap-3 rounded-2xl border bg-muted/20">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                <p className="text-sm font-medium">Gerando QR Code...</p>
                <p className="max-w-60 text-xs text-muted-foreground">
                  A sessão foi iniciada e o servidor está aguardando o QR do WhatsApp.
                </p>
              </div>
            )}

            <div className="rounded-lg bg-muted/40 p-3 text-sm text-muted-foreground">
              Abra o WhatsApp no celular → Aparelhos conectados → Conectar aparelho.
            </div>
            {qrSecondsLeft === 0 && qrConnectionId && (
              <Button onClick={() => connect(qrConnectionId)} disabled={pending === `${qrConnectionId}:connect`}>
                <RefreshCw className="mr-2 h-4 w-4" /> Gerar novo QR Code
              </Button>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!deleteTarget} onOpenChange={(isOpen) => !isOpen && setDeleteTarget(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Remover conexão</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Remover <strong className="text-foreground">{deleteTarget?.name}</strong>? O histórico de
            conversas será preservado.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>
              Cancelar
            </Button>
            <Button
              variant="destructive"
              disabled={deleteMutation.isPending}
              onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget)}
            >
              {deleteMutation.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Trash2 className="mr-2 h-4 w-4" />
              )}
              Remover
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Connections;
