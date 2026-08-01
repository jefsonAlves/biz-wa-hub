import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Send, StickyNote } from "lucide-react";

interface InternalNotesProps {
  conversationId: string;
  tenantId: string;
  notes: any[];
}

export function InternalNotes({ conversationId, tenantId, notes }: InternalNotesProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [noteText, setNoteText] = useState("");

  const addNote = useMutation({
    mutationFn: async () => {
      if (!noteText.trim() || !user) return;
      const { error } = await supabase.from("internal_notes").insert({
        tenant_id: tenantId,
        conversation_id: conversationId,
        user_id: user.id,
        note_text: noteText.trim(),
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setNoteText("");
      queryClient.invalidateQueries({ queryKey: ["internal-notes", conversationId] });
    },
    onError: (e: any) => toast({ title: "Erro ao salvar nota", description: e.message, variant: "destructive" }),
  });

  return (
    <div className="flex flex-col gap-3">
      {notes.length === 0 ? (
        <div className="text-center py-6 text-muted-foreground">
          <StickyNote className="h-8 w-8 mx-auto mb-2 opacity-40" />
          <p className="text-sm">Nenhuma nota interna</p>
        </div>
      ) : (
        <div className="space-y-2 max-h-64 overflow-y-auto">
          {notes.map((note) => (
            <div key={note.id} className="bg-accent border border-border rounded-lg p-3">
              <p className="text-sm whitespace-pre-wrap">{note.note_text}</p>
              <p className="text-xs text-muted-foreground mt-1">
                {new Date(note.created_at).toLocaleString("pt-BR")}
              </p>
            </div>
          ))}
        </div>
      )}
      <div className="flex gap-2">
        <Textarea
          value={noteText}
          onChange={(e) => setNoteText(e.target.value)}
          placeholder="Escreva uma nota interna... (visível só para a equipe)"
          className="min-h-[70px] text-sm resize-none"
          onKeyDown={(e) => {
            if (e.key === "Enter" && e.ctrlKey) {
              e.preventDefault();
              addNote.mutate();
            }
          }}
        />
        <Button
          size="icon"
          variant="outline"
          onClick={() => addNote.mutate()}
          disabled={!noteText.trim() || addNote.isPending}
          className="self-end"
        >
          <Send className="h-4 w-4" />
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">Ctrl+Enter para salvar</p>
    </div>
  );
}
