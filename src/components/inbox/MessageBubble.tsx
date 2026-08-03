import { Check, CheckCheck, Bot, User, UserCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface MessageBubbleProps {
  message: any;
}

const deliveryIcon = (status: string | null) => {
  if (status === "read") return <CheckCheck className="h-3 w-3 text-blue-400" />;
  if (status === "delivered" || status === "received") return <CheckCheck className="h-3 w-3 text-muted-foreground" />;
  if (status === "sent") return <Check className="h-3 w-3 text-muted-foreground" />;
  return null;
};

const roleLabel = (role: string) => {
  if (role === "contact") return "Cliente";
  if (role === "ai") return "IA";
  if (role === "agent") return "Agente";
  return "Sistema";
};

const RoleIcon = ({ role }: { role: string }) => {
  if (role === "contact") return <User className="h-3 w-3" />;
  if (role === "ai") return <Bot className="h-3 w-3" />;
  return <UserCheck className="h-3 w-3" />;
};

export function MessageBubble({ message }: MessageBubbleProps) {
  const isIncoming = message.role === "contact";
  const isInternal = message.is_internal;
  const isDraft = message.delivery_status === "draft";

  return (
    <div className={cn("flex", isIncoming ? "justify-start" : "justify-end")}>
      <div
        className={cn(
          "max-w-[72%] rounded-xl px-3 py-2 text-sm shadow-sm",
          isInternal
            ? "bg-yellow-500/15 border border-yellow-500/30 text-foreground"
            : isIncoming
            ? "bg-muted text-foreground rounded-tl-none"
            : message.role === "ai"
            ? isDraft
              ? "bg-primary/10 border border-dashed border-primary/40 text-foreground"
              : "bg-primary/20 text-foreground rounded-tr-none"
            : "bg-primary text-primary-foreground rounded-tr-none"
        )}
      >
        {/* Role label */}
        <div className="flex items-center gap-1 mb-0.5 opacity-70">
          <RoleIcon role={message.role} />
          <span className="text-xs font-medium">
            {message.metadata?.agent_name || roleLabel(message.role)}
          </span>
          {isInternal && <Badge variant="outline" className="text-xs h-4 py-0">Interno</Badge>}
          {isDraft && <Badge variant="outline" className="text-xs h-4 py-0 border-primary/40 text-primary">Sugestão IA</Badge>}
        </div>


        {/* Media */}
        {message.media_url && (
          <div className="mb-1">
            {message.message_type === "image" ? (
              <img src={message.media_url} alt="mídia" className="rounded-lg max-w-full max-h-48 object-cover" />
            ) : (
              <a href={message.media_url} target="_blank" rel="noopener noreferrer" className="text-primary underline text-xs">
                📎 Ver arquivo
              </a>
            )}
          </div>
        )}

        {/* Audio */}
        {message.message_type === "audio" && (
          <p className="text-xs opacity-70">🎵 Mensagem de áudio</p>
        )}

        {/* Text content */}
        {message.content && (
          <p className="leading-relaxed whitespace-pre-wrap break-words">{message.content}</p>
        )}

        {/* Footer */}
        <div className={cn("flex items-center gap-1 mt-1 justify-end",
          isIncoming ? "text-muted-foreground" : message.role === "agent" ? "text-primary-foreground/70" : "text-muted-foreground"
        )}>
          <span className="text-xs">
            {new Date(message.created_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
          </span>
          {!isIncoming && deliveryIcon(message.delivery_status)}
        </div>
      </div>
    </div>
  );
}
