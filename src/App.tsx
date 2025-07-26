import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Index from "./pages/Index";
import Login from "./pages/Login";
import Register from "./pages/Register";
import Dashboard from "./pages/Dashboard";
import AdminDashboard from "./pages/admin/AdminDashboard";
import Companies from "./pages/admin/Companies";
import UsersPage from "./pages/admin/Users";
import WhatsAppNumbers from "./pages/admin/WhatsAppNumbers";
import { DashboardLayout } from "./layouts/DashboardLayout";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <div className="dark">
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Routes>
            {/* Public routes */}
            <Route path="/" element={<Index />} />
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />
            
            {/* Dashboard routes */}
            <Route path="/dashboard" element={
              <DashboardLayout>
                <Dashboard />
              </DashboardLayout>
            } />
            
            {/* Admin routes */}
            <Route path="/admin/dashboard" element={
              <DashboardLayout>
                <AdminDashboard />
              </DashboardLayout>
            } />
            <Route path="/admin/companies" element={
              <DashboardLayout>
                <Companies />
              </DashboardLayout>
            } />
            <Route path="/admin/users" element={
              <DashboardLayout>
                <UsersPage />
              </DashboardLayout>
            } />
            <Route path="/admin/numbers" element={
              <DashboardLayout>
                <WhatsAppNumbers />
              </DashboardLayout>
            } />
            <Route path="/admin/reports" element={
              <DashboardLayout>
                <AdminDashboard />
              </DashboardLayout>
            } />
            <Route path="/admin/settings" element={
              <DashboardLayout>
                <AdminDashboard />
              </DashboardLayout>
            } />
            
            {/* Company routes */}
            <Route path="/company/*" element={
              <DashboardLayout>
                <Dashboard />
              </DashboardLayout>
            } />
            
            {/* Employee routes */}
            <Route path="/employee/*" element={
              <DashboardLayout>
                <Dashboard />
              </DashboardLayout>
            } />
            
            {/* 404 route */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </div>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
