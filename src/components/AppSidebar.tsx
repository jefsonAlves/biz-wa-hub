import { NavLink, useLocation } from "react-router-dom";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import { Badge } from "@/components/ui/badge";
import {
  Server,
  MessageSquare,
  LayoutDashboard,
  Users,
  Building2,
  Settings,
  Bot,
  BarChart3,
  BookOpen,
  Shield,
  Headphones,
  FileText,
  Smartphone,
  Workflow,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { DsaLogo } from "./DsaLogo";
import { useAuth } from "@/hooks/useAuth";
import { WhatsAppStatusBadge } from "@/components/WhatsAppStatusBadge";
import { usePermissions } from "@/hooks/usePermissions";


interface MenuItem {
  title: string;
  url: string;
  icon: React.ElementType;
}

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const location = useLocation();
  const { profile, isSuperAdmin, isTenantAdmin, isAgent, roles } = useAuth();
  const { can } = usePermissions();

  const getMenuItems = (): MenuItem[] => {
    if (isSuperAdmin) {
      return [
        { title: "Dashboard", url: "/dashboard", icon: LayoutDashboard },
        { title: "Inbox", url: "/inbox", icon: MessageSquare },
        { title: "Tenants", url: "/admin/tenants", icon: Building2 },
        { title: "Usuários", url: "/admin/users", icon: Users },
        { title: "Planos", url: "/admin/plans", icon: FileText },
        { title: "Agentes IA", url: "/agents", icon: Bot },
        { title: "IA no Atendimento", url: "/ai-attendance", icon: Sparkles },
        { title: "Configuração de IA", url: "/ai-providers", icon: Server },

        { title: "Base de Conhecimento", url: "/knowledge", icon: BookOpen },
        { title: "Conexões WhatsApp", url: "/connections", icon: Smartphone },
        { title: "Integração n8n", url: "/admin/n8n", icon: Workflow },
        { title: "Relatórios", url: "/reports", icon: BarChart3 },
        { title: "Logs", url: "/admin/logs", icon: Shield },
        { title: "Configurações", url: "/settings", icon: Settings },
      ];
    }

    if (isTenantAdmin) {
      return [
        { title: "Dashboard", url: "/dashboard", icon: LayoutDashboard },
        { title: "Inbox", url: "/inbox", icon: MessageSquare },
        { title: "Agentes IA", url: "/agents", icon: Bot },
        { title: "IA no Atendimento", url: "/ai-attendance", icon: Sparkles },
        { title: "Configuração de IA", url: "/ai-providers", icon: Server },

        { title: "Base de Conhecimento", url: "/knowledge", icon: BookOpen },
        { title: "Departamentos", url: "/departments", icon: Building2 },
        { title: "Conexões WhatsApp", url: "/connections", icon: Smartphone },
        
        { title: "Equipe", url: "/team", icon: Users },
        { title: "Funções e Permissões", url: "/roles", icon: ShieldCheck },
        { title: "Relatórios", url: "/reports", icon: BarChart3 },
        { title: "Configurações", url: "/settings", icon: Settings },
      ];
    }

    // Agentes e funções personalizadas: menu montado pelas permissões da função
    const items: MenuItem[] = [{ title: "Dashboard", url: "/dashboard", icon: LayoutDashboard }];
    if (can("inbox.view")) {
      items.push({ title: "Inbox", url: "/inbox", icon: MessageSquare });
      if (isAgent) items.push({ title: "Meus Atendimentos", url: "/my-conversations", icon: Headphones });
    }
    if (can("departments.manage")) items.push({ title: "Departamentos", url: "/departments", icon: Building2 });
    if (can("knowledge.manage")) items.push({ title: "Base de Conhecimento", url: "/knowledge", icon: BookOpen });
    if (can("ai.manage_agents")) items.push({ title: "Agentes IA", url: "/agents", icon: Bot });
    if (can("connections.manage")) items.push({ title: "Conexões WhatsApp", url: "/connections", icon: Smartphone });
    if (can("team.manage")) items.push({ title: "Equipe", url: "/team", icon: Users });
    if (can("reports.view")) items.push({ title: "Relatórios", url: "/reports", icon: BarChart3 });
    return items;
  };

  const menuItems = getMenuItems();

  const getRoleBadge = () => {
    if (isSuperAdmin) return <Badge variant="destructive" className="text-xs">Super Admin</Badge>;
    if (isTenantAdmin) return <Badge variant="default" className="text-xs">Admin</Badge>;
    if (isAgent) return <Badge variant="secondary" className="text-xs">Agente</Badge>;
    return <Badge variant="outline" className="text-xs">Viewer</Badge>;
  };

  const isActive = (path: string) =>
    location.pathname === path || location.pathname.startsWith(path + "/");


  return (
    <Sidebar className="border-r border-sidebar-border bg-sidebar transition-all duration-200" collapsible="icon">
      <SidebarContent>
        <div className={`p-4 ${collapsed ? "px-2" : ""}`}>
          <div className="flex items-center">
            <DsaLogo size={collapsed ? 24 : 120} />
          </div>
          {!collapsed && (
            <div className="mt-2 flex items-center gap-2 flex-wrap">
              {getRoleBadge()}
              <WhatsAppStatusBadge />
            </div>
          )}
        </div>

        <SidebarGroup className="px-2">
          {!collapsed && (
            <SidebarGroupLabel className="text-sidebar-foreground/70 font-medium">
              Menu
            </SidebarGroupLabel>
          )}
          <SidebarGroupContent>
            <SidebarMenu>
              {menuItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild>
                    <NavLink to={item.url} className={({ isActive }) => 
                      `flex items-center gap-3 px-3 py-2 rounded-lg transition-colors ${
                        isActive 
                          ? "bg-blue-50 text-primary font-semibold shadow-sm border border-blue-100/50" 
                          : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                      }`
                    }>
                      <item.icon className="h-4 w-4 flex-shrink-0" />
                      {!collapsed && <span>{item.title}</span>}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {!collapsed && profile && (
          <div className="mt-auto p-4">
            <div className="bg-secondary rounded-lg p-3">
              <p className="text-sm font-medium text-sidebar-foreground truncate">
                {profile.full_name || profile.email}
              </p>
              <p className="text-xs text-sidebar-foreground/70 truncate">
                {profile.email}
              </p>
            </div>
          </div>
        )}
      </SidebarContent>
    </Sidebar>
  );
}
