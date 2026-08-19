import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Smartphone,
  Plus,
  QrCode,
  RefreshCw,
  Power,
  Loader2,
  ShieldCheck,
  AlertCircle,
  Building2,
  Trash2,
  Activity,
  CheckCircle2,
  XCircle,
  MessageSquare,
} from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  listConnections,
  deleteConnection,
  diagnoseN8n,
  type SafeConnection,
  type N8nDiagnostics,
} from "@/lib/whatsapp/provider";
import { createBackendConnection, runBackendConnectionAction } from "@/lib/whatsapp/backend";

/** Estados exibidos ao usuário — sem jargão de Baileys, n8n, Docker ou API interna. */
const STATE_LABELS: Record<string, string> = {
  connected: "Conectado",
  connecting: "Conectando...",
  qr_pending: "Aguardando leitura do QR Code",
  disconnecting: "Desconectando...",
  disconnected: "Desconectado",
  error: "Erro na conexão",
};

const stateOf = (conn: SafeConnection) => {
  if (conn.status === "connected") return "connected";
  if (conn.status === "error") return "error";
  if (conn.qr_status === "available") return "qr_pending";
  if (conn.status === "connecting" || conn.qr_status === "requested" || conn.qr_status === "pending")
    return "connecting";
  if (conn.status === "disconnecting") return "disconnecting";
  return "disconnected";
};

const statusVariant = (state: string) =>
  state === "connected" ? "default" : state === "error" ? "destructive" : "secondary";

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
    {ok ? (
      <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5 text-primary" />
    ) : (
      <XCircle className="h-4 w-4 shrink-0 mt-0.5 text-destructive" />
    )}
    <div className="space-y-0.5">
      <p className="font-medium leading-none">{title}</p>
      <p className="text-xs text-muted-foreground">{detail}</p>
    </div>
  </div>
);

const Connections = () => {
  const { profile, isSuperAdmin } = useAuth();
  const [selectedTenantId, setSelectedTenantId] = useState<string | null>(null);
  const effectiveTenantId = isSuperAdmin ? selectedTenantId : profile?.tenant_id;

  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [pending, setPending] = useState<string | null>(null);
  const [qrConnectionId, setQrConnectionId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<SafeConnection | null>(null);
  const [diagnosticsOpen, setDiagnosticsOpen] = useState(false);
  const [diagnostics, setDiagnostics] = useState<N8nDiagnostics | null>(null);
  const previousStatuses = useRef<Record<string, string>>({});

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
    for (const connection of connections) {
      const previous = previousStatuses.current[connection.id];
      if (connection.status === "connected" && previous && previous !== "connected") {
        if (qrConnectionId === connection.id) setQrConnectionId(null);
        toast({
          title: "WhatsApp conectado",
          description: `${connection.name} está conectado. Novas mensagens aparecerão no Inbox.`,
        });
        queryClient.invalidateQueries({ queryKey: ["dashboard-stats", effectiveTenantId] });
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
        () =>
          queryClient.invalidateQueries({
            queryKey: ["whatsapp_connections_safe", effectiveTenantId],
          }),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient, effectiveTenantId]);

  const createMutation = useMutation({
    mutationFn: async () => {
      if (!effectiveTenantId) throw new Error("Selecione uma empresa para adicionar o WhatsApp.");
      const created = await createBackendConnection({
        tenantId: effectiveTenantId,
        name: name.trim() || "WhatsApp",
      });
      return created.connection_id;
    },
    onSuccess: async (connectionId) => {
      setOpen(false);
      setName("");
      await queryClient.invalidateQueries({
        queryKey: ["whatsapp_connections_safe", effectiveTenantId],
      });
      if (connectionId) void connect(connectionId);
    },
    onError: (e: Error) =>
      toast({ title: "Erro ao adicionar WhatsApp", description: e.message, variant: "destructive" }),
  });

  /** Conectar: inicia a sessão no backend e abre a tela do QR Code. */
  const connect = async (connectionId: string) => {
    setPending(`${connectionId}:connect`);
    setQrConnectionId(connectionId);
    try {
      await runBackendConnectionAction(connectionId, "start_session", effectiveTenantId);
      await queryClient.invalidateQueries({
        queryKey: ["whatsapp_connections_safe", effectiveTenantId],
      });
    } catch (e) {
      toast({
        title: "Não foi possível conectar",
        description: (e as Error).message,
        variant: "destructive",
      });
    } finally {
      setPending(null);
    }
  };

  const refresh = async (connectionId: string) => {
    setPending(`${connectionId}:refresh`);
    try {
      await runBackendConnectionAction(connectionId, "refresh_status", effectiveTenantId);
      await queryClient.invalidateQueries({
        queryKey: ["whatsapp_connections_safe", effectiveTenantId],
      });
    } catch (e) {
      toast({ title: "Erro ao atualizar status", description: (e as Error).message, variant: "destructive" });
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
      toast({ title: "Erro ao desconectar", description: (e as Error).message, variant: "destructive" });
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

  const diagnoseMutation = useMutation({
    mutationFn: async () => diagnoseN8n(effectiveTenantId),
    onSuccess: (res) => setDiagnostics(res.diagnostics),
    onError: (e: any) => {
      setDiagnosticsOpen(false);
      toast({
        title: "Falha no diagnóstico",
        description: e.context?.details || e.message,
        variant: "destructive",
      });
    },
  });

  // Enquanto a sessão negocia, o painel busca QR Code e status sozinho.
  useEffect(() => {
    if (!qrConnectionId) return;
    const state = qrConnection ? stateOf(qrConnection) : "connecting";
    if (state === "connected") return;
    const timer = setInterval(async () => {
      try {
        await runBackendConnectionAction(qrConnectionId, "refresh_status", effectiveTenantId);
        await queryClient.invalidateQueries({
          queryKey: ["whatsapp_connections_safe", effectiveTenantId],
        });
      } catch {
        // o erro fica registrado na própria conexão
      }
    }, 3000);
    return () => clearInterval(timer);
  }, [qrConnectionId, qrConnection, effectiveTenantId, queryClient]);

  const runDiagnostics = () => {
    setDiagnostics(null);
    setDiagnosticsOpen(true);
    diagnoseMutation.mutate();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-bold">WhatsApp</h1>
          <p className="text-muted-foreground">
            Conecte seus números lendo o QR Code. Sem cadastros, credenciais ou configurações extras.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {isSuperAdmin && (
            <Button
              variant="outline"
              onClick={runDiagnostics}
              disabled={!effectiveTenantId || diagnoseMutation.isPending}
            >
              {diagnoseMutation.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Activity className="h-4 w-4 mr-2" />
              )}
              Automações (opcional)
            </Button>
          )}
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button disabled={!effectiveTenantId}>
                <Plus className="h-4 w-4 mr-2" />
                Adicionar WhatsApp
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-sm">
              <DialogHeader>
                <DialogTitle>Adicionar WhatsApp</DialogTitle>
              </DialogHeader>
              <div className="space-y-2">
                <Label>Nome do número</Label>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Ex: WhatsApp Comercial"
                />
                <p className="text-xs text-muted-foreground">
                  Depois de criar, o QR Code aparece na tela para você escanear no celular.
                </p>
              </div>
              <DialogFooter>
                <Button onClick={() => createMutation.mutate()} disabled={createMutation.isPending}>
                  {createMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  Conectar WhatsApp
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
                Sessões e credenciais ficam apenas no servidor. As automações são opcionais: o WhatsApp
                funciona normalmente sem elas.
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      {isLoading ? (
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Carregando...
        </div>
      ) : !effectiveTenantId ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Building2 className="h-12 w-12 mx-auto mb-3 text-muted-foreground opacity-50" />
            <p className="text-muted-foreground font-medium">
              Selecione uma empresa para conectar o WhatsApp.
            </p>
          </CardContent>
        </Card>
      ) : connections.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center space-y-3">
            <Smartphone className="h-12 w-12 mx-auto text-muted-foreground opacity-50" />
            <p className="text-muted-foreground">Nenhum número conectado ainda.</p>
            <Button onClick={() => setOpen(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Adicionar WhatsApp
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {connections.map((conn) => {
            const state = stateOf(conn);
            const busy = (cmd: string) => pending === `${conn.id}:${cmd}`;
            return (
              <Card key={conn.id}>
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Smartphone className="h-4 w-4" />
                    {conn.name}
                    <Badge variant={statusVariant(state)} className="ml-auto">
                      {STATE_LABELS[state]}
                    </Badge>
                  </CardTitle>
                  <CardDescription>
                    {state === "connected"
                      ? conn.phone_number
                        ? `Número: ${conn.phone_number}`
                        : "Número conectado"
                      : "Status: " + STATE_LABELS[state]}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  {conn.connection_error && state === "error" && (
                    <div className="flex items-start gap-2 rounded border border-destructive/20 bg-destructive/10 p-2 text-xs text-destructive">
                      <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                      <p>{conn.connection_error}</p>
                    </div>
                  )}

                  <div className="flex flex-wrap gap-2">
                    {state === "connected" ? (
                      <>
                        <Button size="sm" asChild>
                          <Link to="/inbox">
                            <MessageSquare className="h-3.5 w-3.5 mr-1" />
                            Abrir conversas
                          </Link>
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            if (window.confirm(`Desconectar ${conn.name}?`)) void disconnect(conn.id);
                          }}
                          disabled={busy("disconnect")}
                        >
                          <Power className="h-3.5 w-3.5 mr-1" />
                          Desconectar
                        </Button>
                      </>
                    ) : (
                      <>
                        <Button size="sm" onClick={() => connect(conn.id)} disabled={busy("connect")}>
                          {busy("connect") ? (
                            <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                          ) : (
                            <QrCode className="h-3.5 w-3.5 mr-1" />
                          )}
                          Conectar WhatsApp
                        </Button>
                        {state === "qr_pending" && (
                          <Button size="sm" variant="outline" onClick={() => setQrConnectionId(conn.id)}>
                            <QrCode className="h-3.5 w-3.5 mr-1" />
                            Ver QR Code
                          </Button>
                        )}
                      </>
                    )}
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => refresh(conn.id)}
                      disabled={busy("refresh")}
                    >
                      <RefreshCw
                        className={`h-3.5 w-3.5 mr-1 ${busy("refresh") ? "animate-spin" : ""}`}
                      />
                      Atualizar status
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-destructive hover:text-destructive hover:bg-destructive/10"
                      onClick={() => setDeleteTarget(conn)}
                    >
                      <Trash2 className="h-3.5 w-3.5 mr-1" />
                      Remover
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
            <p className="text-sm font-medium">Escaneie o QR Code</p>

            {qrDisplaySource ? (
              <div className="rounded-lg border bg-white p-4">
                <img
                  src={qrDisplaySource}
                  alt="QR Code para conectar o WhatsApp"
                  className="h-72 w-72 object-contain"
                />
              </div>
            ) : qrConnection?.connection_error ? (
              <div className="flex min-h-[288px] w-full flex-col items-center justify-center gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-6">
                <XCircle className="h-8 w-8 text-destructive" />
                <p className="font-medium text-destructive">Erro na conexão</p>
                <p className="text-xs text-muted-foreground">{qrConnection.connection_error}</p>
                <Button size="sm" onClick={() => qrConnectionId && connect(qrConnectionId)}>
                  Tentar novamente
                </Button>
              </div>
            ) : (
              <div className="flex min-h-[288px] w-full flex-col items-center justify-center gap-3 rounded-lg border bg-muted/20 p-6">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                <p className="text-sm font-medium">Gerando o QR Code...</p>
              </div>
            )}

            <p className="text-sm text-muted-foreground">
              Abra o WhatsApp no celular
              <br />→ Configurações
              <br />→ Aparelhos conectados
              <br />→ Conectar aparelho
            </p>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!deleteTarget} onOpenChange={(isOpen) => !isOpen && setDeleteTarget(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Remover WhatsApp</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Tem certeza que deseja remover <strong className="text-foreground">{deleteTarget?.name}</strong>?
            As conversas já registradas continuam no Inbox.
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
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Trash2 className="h-4 w-4 mr-2" />
              )}
              Remover
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={diagnosticsOpen} onOpenChange={setDiagnosticsOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Automações opcionais (n8n)</DialogTitle>
          </DialogHeader>
          {diagnoseMutation.isPending || !diagnostics ? (
            <div className="flex flex-col items-center gap-3 py-10 text-sm text-muted-foreground">
              <Loader2 className="h-7 w-7 animate-spin text-primary" />
              Verificando as automações...
            </div>
          ) : (
            <div className="space-y-3 max-h-[65vh] overflow-y-auto pr-1 text-sm">
              <p className="text-xs text-muted-foreground">
                Estas automações são complementares. O WhatsApp continua conectando, recebendo e enviando
                mensagens mesmo com tudo aqui desligado.
              </p>
              <DiagnosticRow
                ok={diagnostics.integration.found && diagnostics.integration.status === "active"}
                title="Integração de automação ativa"
                detail={
                  diagnostics.integration.found
                    ? `${diagnostics.integration.name} · destino ${diagnostics.integration.target ?? "—"}`
                    : "Nenhuma automação configurada (opcional)."
                }
              />
              <DiagnosticRow
                ok={!!diagnostics.webhook?.reachable}
                title="Webhook alcançável"
                detail={
                  diagnostics.webhook?.reachable
                    ? `Respondeu HTTP ${diagnostics.webhook.http_status} em ${diagnostics.webhook.duration_ms} ms.`
                    : diagnostics.webhook?.error ?? "Sem resposta na chamada de teste."
                }
              />
              <DiagnosticRow
                ok={(diagnostics.outbox?.failed ?? 0) === 0}
                title="Fila de eventos"
                detail={`${diagnostics.outbox?.pending ?? 0} pendente(s), ${diagnostics.outbox?.failed ?? 0} com falha.`}
              />
              <DiagnosticRow
                ok={!!diagnostics.last_delivery?.success}
                title="Última entrega"
                detail={
                  diagnostics.last_delivery
                    ? `${new Date(diagnostics.last_delivery.created_at).toLocaleString("pt-BR")} · HTTP ${diagnostics.last_delivery.http_status ?? "—"}`
                    : "Nenhuma entrega registrada ainda."
                }
              />
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Connections;
