import { useState } from "react";
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
  SidebarTrigger,
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
  UserCheck,
  Shield,
  Clock,
  FileText,
  Headphones,
  Workflow,
  Zap
} from "lucide-react";

// Menu items baseados no tipo de usuário
const getMenuItems = (userType: "admin" | "company" | "employee") => {
  const baseItems = [
    { title: "Dashboard", url: "/dashboard", icon: LayoutDashboard },
  ];

  if (userType === "admin") {
    return [
      ...baseItems,
      { title: "Empresas", url: "/admin/companies", icon: Building2 },
      { title: "Usuários", url: "/admin/users", icon: Users },
      { title: "Números WhatsApp", url: "/admin/numbers", icon: Phone },
      { title: "Relatórios Globais", url: "/admin/reports", icon: BarChart3 },
      { title: "Configurações", url: "/admin/settings", icon: Settings },
    ];
  }

  if (userType === "company") {
    return [
      ...baseItems,
      { title: "Conversas", url: "/chat", icon: MessageSquare },
      { title: "Setores", url: "/sectors", icon: Building2 },
      { title: "Atendentes", url: "/agents", icon: Users },
      { title: "WhatsApp", url: "/admin/numbers", icon: Phone },
      { title: "Relatórios", url: "/reports", icon: BarChart3 },
      { title: "Configurações", url: "/settings", icon: Settings },
    ];
  }

  // Employee
  return [
    ...baseItems,
    { title: "Meus Atendimentos", url: "/employee/chats", icon: MessageSquare },
    { title: "Meu Setor", url: "/employee/department", icon: Building2 },
    { title: "Relatórios", url: "/employee/reports", icon: FileText },
    { title: "Perfil", url: "/employee/profile", icon: UserCheck },
  ];
};

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const location = useLocation();
  const currentPath = location.pathname;

  // Detectar tipo de usuário baseado na URL (em produção viria da autenticação)
  const getUserType = (): "admin" | "company" | "employee" => {
    if (currentPath.includes("/admin")) return "admin";
    if (currentPath.includes("/company")) return "company";
    return "employee";
  };

  const userType = getUserType();
  const menuItems = getMenuItems(userType);

  const getUserBadge = () => {
    switch (userType) {
      case "admin":
        return <Badge variant="destructive" className="text-xs">Admin Master</Badge>;
      case "company":
        return <Badge variant="default" className="text-xs">Empresa</Badge>;
      default:
        return <Badge variant="secondary" className="text-xs">Funcionário</Badge>;
    }
  };

  const isActive = (path: string) => currentPath === path || currentPath.startsWith(path + "/");
  const getNavCls = ({ isActive }: { isActive: boolean }) =>
    isActive 
      ? "bg-sidebar-accent text-sidebar-primary font-medium border-r-2 border-sidebar-primary" 
      : "hover:bg-sidebar-accent/50 text-sidebar-foreground";

  return (
    <Sidebar
      className="border-r border-sidebar-border bg-sidebar transition-all duration-200"
      collapsible="icon"
    >
      <SidebarContent>
        {/* Header com logo */}
        <div className={`p-4 border-b border-sidebar-border ${collapsed ? "px-2" : ""}`}>
          <div className="flex items-center gap-2">
            <MessageSquare className="h-8 w-8 text-sidebar-primary flex-shrink-0" />
            {!collapsed && (
              <div className="flex flex-col">
                <span className="font-bold text-sidebar-foreground">WabaFlow</span>
                <span className="text-xs text-sidebar-foreground/70">Connect</span>
              </div>
            )}
          </div>
          {!collapsed && (
            <div className="mt-2 flex items-center gap-2">
              {getUserBadge()}
              <Badge variant="outline" className="text-xs bg-sidebar-accent/20">
                <Zap className="h-3 w-3 mr-1" />
                Online
              </Badge>
            </div>
          )}
        </div>

        {/* Menu Principal */}
        <SidebarGroup className="px-2">
          {!collapsed && (
            <SidebarGroupLabel className="text-sidebar-foreground/70 font-medium">
              Menu Principal
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

        {/* Seção de Status/Info */}
        {!collapsed && (
          <div className="mt-auto p-4 border-t border-sidebar-border">
            <div className="bg-sidebar-accent/20 rounded-lg p-3">
              <div className="flex items-center gap-2 mb-2">
                <Headphones className="h-4 w-4 text-sidebar-primary" />
                <span className="text-sm font-medium text-sidebar-foreground">
                  Status: Ativo
                </span>
              </div>
              <div className="text-xs text-sidebar-foreground/70 space-y-1">
                <div>Conversas hoje: 12</div>
                <div>Tempo médio: 3m 45s</div>
              </div>
            </div>
          </div>
        )}
      </SidebarContent>
    </Sidebar>
  );
}