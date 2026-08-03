import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { Plus, Pencil, Trash2, ShieldCheck, Lock } from "lucide-react";
import { PERMISSION_CATALOG, ROLE_PRESETS, PERMISSION_LABELS } from "@/lib/permissions";
import type { Database } from "@/integrations/supabase/types";

type BaseRole = Database["public"]["Enums"]["app_role"];

interface TenantRole {
  id: string;
  tenant_id: string;
  name: string;
  description: string | null;
  base_role: BaseRole;
  permissions: string[];
  is_system: boolean;
}

const emptyForm = {
  name: "",
  description: "",
  base_role: "agent" as BaseRole,
  permissions: [] as string[],
};

const Roles = () => {
  const { profile, isTenantAdmin, isSuperAdmin } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const tenantId = profile?.tenant_id;
  const canManage = isTenantAdmin || isSuperAdmin;

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);

  const { data: roles = [], isLoading } = useQuery({
    queryKey: ["tenant-roles", tenantId],
    queryFn: async () => {
      if (!tenantId) return [];
      const { data, error } = await supabase
        .from("tenant_roles")
        .select("*")
        .eq("tenant_id", tenantId)
        .order("is_system", { ascending: false })
        .order("name");
      if (error) throw error;
      return (data || []) as TenantRole[];
    },
    enabled: !!tenantId,
  });

  const { data: assignments = [] } = useQuery({
    queryKey: ["role-assignments", tenantId],
    queryFn: async () => {
      if (!tenantId) return [];
      const { data } = await supabase
        .from("user_roles")
        .select("tenant_role_id")
        .eq("tenant_id", tenantId);
      return (data || []).map((r) => r.tenant_role_id).filter(Boolean) as string[];
    },
    enabled: !!tenantId,
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!tenantId) throw new Error("Sem empresa vinculada");
      if (!form.name.trim()) throw new Error("Informe o nome da função");
      const payload = {
        name: form.name.trim(),
        description: form.description.trim() || null,
        base_role: form.base_role,
        permissions: form.permissions,
      };
      if (editingId) {
        const { error } = await supabase.from("tenant_roles").update(payload).eq("id", editingId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("tenant_roles").insert({ ...payload, tenant_id: tenantId });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tenant-roles"] });
      queryClient.invalidateQueries({ queryKey: ["my-permissions"] });
      toast({ title: editingId ? "Função atualizada!" : "Função criada!" });
      setDialogOpen(false);
      setEditingId(null);
      setForm(emptyForm);
    },
    onError: (e: any) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("tenant_roles").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tenant-roles"] });
      toast({ title: "Função excluída!" });
    },
    onError: (e: any) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  const openCreate = () => {
    setEditingId(null);
    setForm({ ...emptyForm, permissions: ROLE_PRESETS.agent });
    setDialogOpen(true);
  };

  const openEdit = (role: TenantRole) => {
    setEditingId(role.id);
    setForm({
      name: role.name,
      description: role.description || "",
      base_role: role.base_role,
      permissions: role.permissions || [],
    });
    setDialogOpen(true);
  };

  const togglePermission = (key: string, checked: boolean) =>
    setForm((f) => ({
      ...f,
      permissions: checked ? [...new Set([...f.permissions, key])] : f.permissions.filter((p) => p !== key),
    }));

  const applyPreset = (preset: keyof typeof ROLE_PRESETS) =>
    setForm((f) => ({ ...f, permissions: [...ROLE_PRESETS[preset]] }));

  const usageCount = (roleId: string) => assignments.filter((a) => a === roleId).length;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Funções e permissões</h1>
          <p className="text-muted-foreground">
            Crie funções personalizadas e limite o que cada membro da equipe pode acessar
          </p>
        </div>
        {canManage && (
          <Button onClick={openCreate}>
            <Plus className="h-4 w-4 mr-2" />
            Nova função
          </Button>
        )}
      </div>

      {isLoading ? (
        <p className="text-muted-foreground py-8 text-center">Carregando...</p>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {roles.map((role) => (
            <Card key={role.id}>
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="space-y-1">
                    <CardTitle className="flex items-center gap-2 text-lg">
                      <ShieldCheck className="h-4 w-4 text-primary" />
                      {role.name}
                    </CardTitle>
                    <CardDescription>{role.description || "Sem descrição"}</CardDescription>
                  </div>
                  {role.is_system && (
                    <Badge variant="secondary" className="gap-1">
                      <Lock className="h-3 w-3" /> padrão
                    </Badge>
                  )}
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex flex-wrap gap-1">
                  {(role.permissions || []).slice(0, 6).map((p) => (
                    <Badge key={p} variant="outline" className="text-xs">
                      {PERMISSION_LABELS[p] || p}
                    </Badge>
                  ))}
                  {(role.permissions?.length || 0) > 6 && (
                    <Badge variant="outline" className="text-xs">
                      +{role.permissions.length - 6}
                    </Badge>
                  )}
                  {(role.permissions?.length || 0) === 0 && (
                    <span className="text-xs text-muted-foreground">Nenhuma permissão</span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  {usageCount(role.id)} membro(s) com esta função
                </p>
                {canManage && (
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={() => openEdit(role)}>
                      <Pencil className="h-3.5 w-3.5 mr-1" /> Editar
                    </Button>
                    {!role.is_system && (
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="ghost" size="sm">
                            <Trash2 className="h-3.5 w-3.5 text-destructive" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Excluir a função "{role.name}"?</AlertDialogTitle>
                            <AlertDialogDescription>
                              Os membros com esta função perderão as permissões atribuídas por ela.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancelar</AlertDialogCancel>
                            <AlertDialogAction onClick={() => deleteMutation.mutate(role.id)}>
                              Excluir
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingId ? "Editar função" : "Nova função"}</DialogTitle>
            <DialogDescription>
              Defina o nível base e marque exatamente o que esta função pode fazer.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Nome da função</Label>
                <Input
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="Ex.: Supervisor de vendas"
                />
              </div>
              <div className="space-y-2">
                <Label>Nível base de acesso</Label>
                <Select
                  value={form.base_role}
                  onValueChange={(v) => setForm({ ...form, base_role: v as BaseRole })}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="agent">Agente (atende conversas)</SelectItem>
                    <SelectItem value="viewer">Visualizador (somente leitura)</SelectItem>
                    <SelectItem value="tenant_admin">Admin (acesso total)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Descrição</Label>
              <Textarea
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="Para que serve esta função"
                rows={2}
              />
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm text-muted-foreground">Modelos rápidos:</span>
              <Button type="button" variant="outline" size="sm" onClick={() => applyPreset("agent")}>Agente</Button>
              <Button type="button" variant="outline" size="sm" onClick={() => applyPreset("supervisor")}>Supervisor</Button>
              <Button type="button" variant="outline" size="sm" onClick={() => applyPreset("viewer")}>Visualizador</Button>
              <Button type="button" variant="ghost" size="sm" onClick={() => setForm({ ...form, permissions: [] })}>
                Limpar
              </Button>
            </div>

            <div className="space-y-4">
              {PERMISSION_CATALOG.map((group) => (
                <div key={group.group} className="rounded-lg border border-border p-4">
                  <p className="mb-3 text-sm font-semibold">{group.group}</p>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {group.items.map((item) => (
                      <label key={item.key} className="flex items-start gap-3 cursor-pointer">
                        <Checkbox
                          checked={form.permissions.includes(item.key)}
                          onCheckedChange={(c) => togglePermission(item.key, c === true)}
                        />
                        <span className="space-y-0.5">
                          <span className="block text-sm leading-none">{item.label}</span>
                          <span className="block text-xs text-muted-foreground">{item.description}</span>
                        </span>
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
              {saveMutation.isPending ? "Salvando..." : "Salvar função"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Roles;
