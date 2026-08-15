import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";
import { Plus, Calendar, ArrowLeftRight, CheckSquare, Pin, PinOff, Archive, ArchiveRestore } from "lucide-react";

interface ActionMenuProps {
  conversation: any;
  departments: any[];
  tenantId: string;
  onStatusChange?: (status: string) => void;
  onTransfer?: (deptId: string) => void;
}

export function ActionMenu({ conversation, departments, tenantId, onStatusChange, onTransfer }: ActionMenuProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [scheduleDate, setScheduleDate] = useState("");
  const [scheduleTime, setScheduleTime] = useState("");
  const [scheduleMsg, setScheduleMsg] = useState("");

  const scheduleMessage = useMutation({
    mutationFn: async () => {
      if (!scheduleDate || !scheduleTime || !scheduleMsg.trim()) throw new Error("Preencha todos os campos");
      const runAt = new Date(`${scheduleDate}T${scheduleTime}`).toISOString();
      const contact = conversation.contacts;
      const chatId = contact?.wa_chat_id || (contact?.phone ? `${contact.phone.replace(/\D/g, "")}@c.us` : null);
      if (!chatId) throw new Error("Chat ID não encontrado");

      const { error } = await supabase.from("schedules").insert({
        tenant_id: tenantId,
        conversation_id: conversation.id,
        to_chat_id: chatId,
        message_body: scheduleMsg.trim(),
        run_at: runAt,
        status: "queued",
        created_by_user_id: user?.id,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setScheduleOpen(false);
      setScheduleDate(""); setScheduleTime(""); setScheduleMsg("");
      toast({ title: "Mensagem agendada!", description: "Será enviada no horário configurado." });
    },
    onError: (e: any) => toast({ title: "Erro ao agendar", description: e.message, variant: "destructive" }),
  });

  const changeStatus = useMutation({
    mutationFn: async (status: string) => {
      const { error } = await supabase.from("conversations").update({
        status: status as "open" | "waiting" | "closed" | "archived",
        closed_at: status === "closed" ? new Date().toISOString() : null,
      }).eq("id", conversation.id);
      if (error) throw error;
    },
    onSuccess: (_, status) => {
      queryClient.invalidateQueries({ queryKey: ["conversations"] });
      toast({ title: `Conversa marcada como ${status}` });
      onStatusChange?.(status);
    },
  });

  const togglePin = useMutation({
    mutationFn: async () => {
      const shouldPin = !conversation.is_pinned;
      const { error } = await supabase.from("conversations").update({
        is_pinned: shouldPin,
        pinned_at: shouldPin ? new Date().toISOString() : null,
      }).eq("id", conversation.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["conversations"] });
      toast({ title: conversation.is_pinned ? "Conversa desafixada" : "Conversa fixada" });
    },
  });

  const transferToDept = useMutation({
    mutationFn: async (deptId: string) => {
      const { error } = await supabase.from("conversations").update({
        department_id: deptId, assigned_agent_id: null,
      }).eq("id", conversation.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["conversations"] });
      toast({ title: "Conversa transferida!" });
    },
  });

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="icon" className="h-8 w-8">
            <Plus className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-52">
          <DropdownMenuItem onClick={() => setScheduleOpen(true)}>
            <Calendar className="h-4 w-4 mr-2" />
            Agendar mensagem
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => togglePin.mutate()}>
            {conversation.is_pinned ? <PinOff className="h-4 w-4 mr-2" /> : <Pin className="h-4 w-4 mr-2" />}
            {conversation.is_pinned ? "Desafixar conversa" : "Fixar conversa"}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => changeStatus.mutate(conversation.status === "archived" ? "open" : "archived")}>
            {conversation.status === "archived" ? <ArchiveRestore className="h-4 w-4 mr-2" /> : <Archive className="h-4 w-4 mr-2" />}
            {conversation.status === "archived" ? "Desarquivar" : "Arquivar conversa"}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => changeStatus.mutate("waiting")}>
            <CheckSquare className="h-4 w-4 mr-2" />
            Marcar como pendente
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => changeStatus.mutate("closed")}>
            <CheckSquare className="h-4 w-4 mr-2" />
            Fechar conversa
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => changeStatus.mutate("open")}>
            <CheckSquare className="h-4 w-4 mr-2" />
            Reabrir conversa
          </DropdownMenuItem>
          {departments.length > 0 && (
            <>
              <DropdownMenuSeparator />
              {departments.map((dept) => (
                <DropdownMenuItem key={dept.id} onClick={() => transferToDept.mutate(dept.id)}>
                  <ArrowLeftRight className="h-4 w-4 mr-2" />
                  → {dept.name}
                </DropdownMenuItem>
              ))}
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Schedule Dialog */}
      <Dialog open={scheduleOpen} onOpenChange={setScheduleOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Calendar className="h-4 w-4" />
              Agendar mensagem
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs">Data</Label>
                <Input type="date" value={scheduleDate} onChange={(e) => setScheduleDate(e.target.value)} className="h-9" />
              </div>
              <div>
                <Label className="text-xs">Horário</Label>
                <Input type="time" value={scheduleTime} onChange={(e) => setScheduleTime(e.target.value)} className="h-9" />
              </div>
            </div>
            <div>
              <Label className="text-xs">Mensagem</Label>
              <Textarea
                value={scheduleMsg}
                onChange={(e) => setScheduleMsg(e.target.value)}
                placeholder="Digite a mensagem..."
                className="min-h-[80px] text-sm resize-none"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setScheduleOpen(false)}>Cancelar</Button>
            <Button
              size="sm"
              onClick={() => scheduleMessage.mutate()}
              disabled={!scheduleDate || !scheduleTime || !scheduleMsg.trim() || scheduleMessage.isPending}
            >
              {scheduleMessage.isPending ? "Agendando..." : "Agendar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
