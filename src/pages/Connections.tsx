import { useEffect, useState } from "react";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Smartphone, Plus, QrCode, RefreshCw, PlugZap, Power, Loader2, ShieldCheck, AlertCircle } from "lucide-react";
import {
  listConnections,
  sendConnectionCommand,
  CONNECTION_STATUS_LABELS,
  type SafeConnection,
  type ConnectionCommand,
} from "@/lib/whatsapp/provider";

const statusVariant = (status: string) =>
  status === "connected" ? "default" : status === "error" ? "destructive" : "secondary";

const Connections = () => {
  const { profile, isSuperAdmin } = useAuth();
  const profileTenantId = profile?.tenant_id;
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [sessionId, setSessionId] = useState("");
  const [pending, setPending] = useState<string | null>(null);
  const [selectedTenantId, setSelectedTenantId] = useState<string | null>(profileTenantId ?? null);

  const { data: tenants = [] } = useQuery({
    queryKey: ["admin_tenants_for_whatsapp"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tenants")
        .select("id,name,status")
        .order("name", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
    enabled: isSuperAdmin,
  });

  useEffect(() => {
    if (profileTenantId) {
      setSelectedTenantId(profileTenantId);
      return;
    }

    if (isSuperAdmin && !selectedTenantId && tenants.length > 0) {
      setSelectedTenantId(tenants[0].id);
    }
  }, [isSuperAdmin, profileTenantId, selectedTenantId, tenants]);

  const tenantId = isSuperAdmin ? selectedTenantId : profileTenantId;

  const { data: connections = [], isLoading } = useQuery({
    queryKey: ["whatsapp_connections_safe", tenantId],
    queryFn: () => listConnections(tenantId),
    enabled: !!tenantId,
    refetchInterval: 20000,
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      if (!tenantId) throw new Error("Sem empresa vinculada");
      const { error } = await supabase.from("whatsapp_connections").insert({
        tenant_id: tenantId,
        name: name.trim() || "Novo número",
        provider_type: "n8n_unofficial",
        provider_session_id: sessionId.trim() || null,
        status: "disconnected",
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setOpen(false);
      setName("");
      setSessionId("");
      queryClient.invalidateQueries({ queryKey: ["whatsapp_connections_safe"] });
      toast({ title: "Conexão criada", description: "Gere a sessão para conectar o número." });
    },
    onError: (e: Error) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  const runCommand = async (connection: SafeConnection, command: ConnectionCommand) => {
    const requiresConfirmation = command === "disconnect" || command === "logout";
    if (requiresConfirmation && !window.confirm("Desconectar este WhatsApp? A sessão permanecerá ativa até sua confirmação.")) {
      return;
    }
    setPending(`${connection.id}:${command}`);
    try {
      const res = await sendConnectionCommand(connection.id, command, { confirmDisconnect: requiresConfirmation });
      queryClient.invalidateQueries({ queryKey: ["whatsapp_connections_safe"] });
      toast({
        title: res.warning ? "Comando enfileirado" : "Comando enviado ao n8n",
        description: res.warning ?? "O n8n responderá via webhook assinado.",
      });
    } catch (e) {
      toast({ title: "Erro no comando", description: (e as Error).message, variant: "destructive" });
    } finally {
      setPending(null);
    }
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
        {isSuperAdmin && (
          <div className="w-full sm:w-80 space-y-2">
            <Label>Empresa administrada</Label>
            <Select value={selectedTenantId ?? ""} onValueChange={setSelectedTenantId}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione a empresa" />
              </SelectTrigger>
              <SelectContent>
                {tenants.map((tenant) => (
                  <SelectItem key={tenant.id} value={tenant.id}>
                    {tenant.name} {tenant.status !== "active" ? `(${tenant.status})` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Como Super Admin, escolha a empresa antes de criar sessão, gerar QR ou sincronizar mensagens.
            </p>
          </div>
        )}
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button disabled={!tenantId}><Plus className="h-4 w-4 mr-2" />Nova conexão</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Nova conexão</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Nome do número</Label>
                <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex: Comercial" />
              </div>
              <div className="space-y-2">
                <Label>Identificador da sessão no n8n (opcional)</Label>
                <Input value={sessionId} onChange={(e) => setSessionId(e.target.value)} placeholder="Ex: comercial-01" />
                <p className="text-xs text-muted-foreground">
                  Usado pelo fluxo do n8n para identificar a sessão. Nenhuma credencial é armazenada no navegador.
                </p>
              </div>
            </div>
            <DialogFooter>
              <Button onClick={() => createMutation.mutate()} disabled={createMutation.isPending}>
                {createMutation.isPending ? "Criando..." : "Criar conexão"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <Card className="border-primary/20 bg-primary/5">
        <CardContent className="flex items-start gap-3 py-4 text-sm">
          <ShieldCheck className="h-5 w-5 text-primary shrink-0 mt-0.5" />
          <p className="text-muted-foreground">
            Credenciais de sessão nunca são expostas ao navegador. Todos os comandos passam por Edge Functions
            e são entregues ao n8n com assinatura HMAC SHA-256.
          </p>
        </CardContent>
      </Card>

      {!tenantId ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Smartphone className="h-12 w-12 mx-auto mb-3 text-muted-foreground opacity-50" />
            <p className="text-muted-foreground">Selecione uma empresa para cadastrar e conectar o WhatsApp.</p>
          </CardContent>
        </Card>
      ) : isLoading ? (
        <div className="flex items-center gap-2 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Carregando conexões...</div>
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
                  <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                    <span>QR: {conn.qr_status ?? "—"}</span>
                    <span>Webhook: {conn.webhook_status ?? "—"}</span>
                    <span>Credenciais: {conn.has_credentials ? "configuradas" : "pendentes"}</span>
                    <span>
                      Checagem: {conn.last_health_check_at ? new Date(conn.last_health_check_at).toLocaleString("pt-BR") : "—"}
                    </span>
                  </div>

                  {conn.connection_error && (
                    <div className="flex items-start gap-2 text-xs text-destructive">
                      <AlertCircle className="h-4 w-4 shrink-0" />
                      {conn.connection_error}
                    </div>
                  )}

                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" onClick={() => runCommand(conn, "create_session")} disabled={busy("create_session")}>
                      <PlugZap className="h-3.5 w-3.5 mr-1" />Criar sessão
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => runCommand(conn, "generate_qr")} disabled={busy("generate_qr")}>
                      <QrCode className="h-3.5 w-3.5 mr-1" />Gerar QR
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => runCommand(conn, "health_check")} disabled={busy("health_check")}>
                      <RefreshCw className={`h-3.5 w-3.5 mr-1 ${busy("health_check") ? "animate-spin" : ""}`} />Status
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => runCommand(conn, "sync_messages")} disabled={busy("sync_messages") || conn.status !== "connected"}>
                      <RefreshCw className={`h-3.5 w-3.5 mr-1 ${busy("sync_messages") ? "animate-spin" : ""}`} />Atualizar mensagens
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => runCommand(conn, "disconnect")} disabled={busy("disconnect")}>
                      <Power className="h-3.5 w-3.5 mr-1" />Desconectar
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default Connections;
