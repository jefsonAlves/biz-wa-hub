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
  MessageSquare,
  LayoutDashboard,
  Users,
  Building2,
  Settings,
  Bot,
  BarChart3,
  Phone,
  BookOpen,
  Shield,
  Headphones,
  Zap,
  FileText,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";

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

  const getMenuItems = (): MenuItem[] => {
    if (isSuperAdmin) {
      return [
        { title: "Dashboard", url: "/dashboard", icon: LayoutDashboard },
        { title: "Inbox", url: "/inbox", icon: MessageSquare },
        { title: "Tenants", url: "/admin/tenants", icon: Building2 },
        { title: "Usuários", url: "/admin/users", icon: Users },
        { title: "Planos", url: "/admin/plans", icon: FileText },
        { title: "Agentes IA", url: "/agents", icon: Bot },
        { title: "Base de Conhecimento", url: "/knowledge", icon: BookOpen },
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
        { title: "Base de Conhecimento", url: "/knowledge", icon: BookOpen },
        { title: "Departamentos", url: "/departments", icon: Building2 },
        { title: "Equipe", url: "/team", icon: Users },
        { title: "Relatórios", url: "/reports", icon: BarChart3 },
        { title: "Configurações", url: "/settings", icon: Settings },
      ];
    }

    if (isAgent) {
      return [
        { title: "Inbox", url: "/inbox", icon: MessageSquare },
        { title: "Meus Atendimentos", url: "/my-conversations", icon: Headphones },
        { title: "Dashboard", url: "/dashboard", icon: LayoutDashboard },
      ];
    }

    // Viewer
    return [
      { title: "Dashboard", url: "/dashboard", icon: LayoutDashboard },
      { title: "Relatórios", url: "/reports", icon: BarChart3 },
    ];
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

  const getNavCls = ({ isActive }: { isActive: boolean }) =>
    isActive
      ? "bg-sidebar-accent text-sidebar-primary font-medium border-r-2 border-sidebar-primary"
      : "hover:bg-sidebar-accent/50 text-sidebar-foreground";

  return (
    <Sidebar className="border-r border-sidebar-border bg-sidebar transition-all duration-200" collapsible="icon">
      <SidebarContent>
        <div className={`p-4 border-b border-sidebar-border ${collapsed ? "px-2" : ""}`}>
          <div className="flex items-center gap-2">
            <MessageSquare className="h-8 w-8 text-sidebar-primary flex-shrink-0" />
            {!collapsed && (
              <div className="flex flex-col">
                <span className="font-bold text-sidebar-foreground">AgentFlow</span>
                <span className="text-xs text-sidebar-foreground/70">SaaS</span>
              </div>
            )}
          </div>
          {!collapsed && (
            <div className="mt-2 flex items-center gap-2">
              {getRoleBadge()}
              <Badge variant="outline" className="text-xs bg-sidebar-accent/20">
                <Zap className="h-3 w-3 mr-1" />
                Online
              </Badge>
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
                    <NavLink to={item.url} className={getNavCls}>
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
          <div className="mt-auto p-4 border-t border-sidebar-border">
            <div className="bg-sidebar-accent/20 rounded-lg p-3">
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
