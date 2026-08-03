import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Plus, Users, UserPlus, Trash2 } from "lucide-react";

import type { Database } from "@/integrations/supabase/types";

type AppRole = Database["public"]["Enums"]["app_role"];

const ROLE_LABELS: Record<string, string> = {
  super_admin: "Super Admin",
  tenant_admin: "Admin",
  agent: "Agente",
  viewer: "Visualizador",
};

const Team = () => {
  const { profile } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const tenantId = profile?.tenant_id;

  const [dialogOpen, setDialogOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<AppRole>("agent");

  const { data: members = [], isLoading } = useQuery({
    queryKey: ["team", tenantId],
    queryFn: async () => {
      if (!tenantId) return [];
      const { data: profiles, error } = await supabase.from("profiles").select("*").eq("tenant_id", tenantId);
      if (error) throw error;
      const { data: roles } = await supabase.from("user_roles").select("*").eq("tenant_id", tenantId);
      return (profiles || []).map(p => ({
        ...p,
        roles: (roles || []).filter(r => r.user_id === p.user_id).map(r => r.role),
      }));
    },
    enabled: !!tenantId,
  });

  const inviteMutation = useMutation({
    mutationFn: async () => {
      if (!tenantId) throw new Error("Sem tenant");
      // Sign up the user with a temporary password (they'll need to reset)
      const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
        email: inviteEmail,
        password: crypto.randomUUID().slice(0, 12),
        options: {
          emailRedirectTo: `${window.location.origin}/auth`,
          data: { full_name: inviteEmail.split("@")[0] },
        },
      });
      if (signUpError) throw signUpError;
      if (!signUpData.user) throw new Error("Falha ao criar usuário");

      // Update profile tenant_id
      const { error: profileError } = await supabase.from("profiles").update({ tenant_id: tenantId }).eq("user_id", signUpData.user.id);
      if (profileError) throw profileError;

      // Add role
      const { error: roleError } = await supabase.from("user_roles").insert({
        user_id: signUpData.user.id, tenant_id: tenantId, role: inviteRole,
      });
      if (roleError) throw roleError;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["team"] });
      toast({ title: "Membro convidado!" });
      setDialogOpen(false);
      setInviteEmail("");
    },
    onError: (e: any) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  const updateRoleMutation = useMutation({
    mutationFn: async ({ userId, newRole }: { userId: string; newRole: AppRole }) => {
      if (!tenantId) throw new Error("Sem tenant");
      // Delete existing roles for this tenant, add new one
      await supabase.from("user_roles").delete().eq("user_id", userId).eq("tenant_id", tenantId);
      const { error } = await supabase.from("user_roles").insert({ user_id: userId, tenant_id: tenantId, role: newRole });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["team"] });
      toast({ title: "Role atualizado!" });
    },
  });

  const removeMemberMutation = useMutation({
    mutationFn: async (userId: string) => {
      if (!tenantId) throw new Error("Sem tenant");
      if (userId === profile?.user_id) throw new Error("Você não pode remover a si mesmo");
      const { error: roleError } = await supabase
        .from("user_roles").delete().eq("user_id", userId).eq("tenant_id", tenantId);
      if (roleError) throw roleError;
      const { error: profileError } = await supabase
        .from("profiles").update({ tenant_id: null }).eq("user_id", userId).eq("tenant_id", tenantId);
      if (profileError) throw profileError;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["team"] });
      toast({ title: "Membro removido da equipe!" });
    },
    onError: (e: any) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });


  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Equipe</h1>
          <p className="text-muted-foreground">Gerencie os membros da sua equipe</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button><UserPlus className="h-4 w-4 mr-2" />Convidar Membro</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Convidar Novo Membro</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Email</Label>
                <Input value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} placeholder="email@exemplo.com" type="email" />
              </div>
              <div className="space-y-2">
                <Label>Função</Label>
                <Select value={inviteRole} onValueChange={(v) => setInviteRole(v as AppRole)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="tenant_admin">Admin</SelectItem>
                    <SelectItem value="agent">Agente</SelectItem>
                    <SelectItem value="viewer">Visualizador</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
              <Button onClick={() => inviteMutation.mutate()} disabled={!inviteEmail || inviteMutation.isPending}>
                {inviteMutation.isPending ? "Convidando..." : "Convidar"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><Users className="h-5 w-5" />Membros ({members.length})</CardTitle></CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-muted-foreground text-center py-8">Carregando...</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome exibido no WhatsApp</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Função</TableHead>
                  <TableHead>Status</TableHead>
                  {canManage && <TableHead className="w-[80px] text-right">Ações</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {members.map((member: any) => (
                  <TableRow key={member.id}>
                    <TableCell className="font-medium">{member.full_name || "—"}</TableCell>
                    <TableCell>{member.email}</TableCell>
                    <TableCell>
                      <Select
                        value={member.roles[0] || "viewer"}
                        onValueChange={(v) => updateRoleMutation.mutate({ userId: member.user_id, newRole: v as AppRole })}
                        disabled={!canManage}
                      >
                        <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="tenant_admin">Admin</SelectItem>
                          <SelectItem value="agent">Agente</SelectItem>
                          <SelectItem value="viewer">Visualizador</SelectItem>
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell>
                      <Badge variant={member.is_available ? "default" : "secondary"}>
                        {member.is_available ? "Disponível" : "Indisponível"}
                      </Badge>
                    </TableCell>
                    {canManage && (
                      <TableCell className="text-right">
                        {member.user_id !== profile?.user_id && (
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button variant="ghost" size="icon" aria-label={`Remover ${member.full_name || member.email}`}>
                                <Trash2 className="h-4 w-4 text-destructive" />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Remover membro da equipe?</AlertDialogTitle>
                                <AlertDialogDescription>
                                  {member.full_name || member.email} perderá o acesso a esta empresa. O histórico de mensagens é preservado.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                <AlertDialogAction onClick={() => removeMemberMutation.mutate(member.user_id)}>
                                  Remover
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        )}
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default Team;
