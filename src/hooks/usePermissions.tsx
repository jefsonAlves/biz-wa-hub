import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import type { PermissionKey } from "@/lib/permissions";

/**
 * Permissões efetivas do usuário logado.
 * Admins (tenant_admin / super_admin) recebem "*" (acesso total).
 */
export function usePermissions() {
  const { user, isSuperAdmin, isTenantAdmin, loading } = useAuth();
  const isAdmin = isSuperAdmin || isTenantAdmin;

  const { data, isLoading } = useQuery({
    queryKey: ["my-permissions", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_my_permissions");
      if (error) throw error;
      return (data as string[] | null) ?? [];
    },
    enabled: !!user && !isAdmin,
    staleTime: 60_000,
  });

  const permissions: string[] = isAdmin ? ["*"] : data ?? [];

  const can = (permission: PermissionKey) =>
    permissions.includes("*") || permissions.includes(permission);

  const canAny = (list: PermissionKey[]) => list.some(can);

  return {
    permissions,
    can,
    canAny,
    isAdmin,
    loading: loading || (!isAdmin && isLoading),
  };
}
