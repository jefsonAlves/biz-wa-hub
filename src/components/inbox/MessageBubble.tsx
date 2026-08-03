import { useEffect, useState } from "react";
import { Check, CheckCheck, Bot, User, UserCheck, FileText, MapPin } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";

interface InboxMessage {
  role: "contact" | "agent" | "ai" | "system";
  is_internal?: boolean;
  delivery_status?: string | null;
  message_type?: "text" | "audio" | "image" | "document" | "video" | "sticker" | "location";
  media_url?: string | null;
  media_mime_type?: string | null;
  content?: string | null;
  created_at: string;
}

interface MessageBubbleProps {
  message: InboxMessage;
}

const deliveryIcon = (status?: string | null) => {
  if (status === "read") return <CheckCheck className="h-3 w-3 text-blue-400" />;
  if (status === "delivered" || status === "received") return <CheckCheck className="h-3 w-3 text-muted-foreground" />;
  if (status === "sent") return <Check className="h-3 w-3 text-muted-foreground" />;
  return null;
};

const roleLabel = (role: InboxMessage["role"]) => {
  if (role === "contact") return "Cliente";
  if (role === "ai") return "IA";
  if (role === "agent") return "Agente";
  return "Sistema";
};

const RoleIcon = ({ role }: { role: InboxMessage["role"] }) => {
  if (role === "contact") return <User className="h-3 w-3" />;
  if (role === "ai") return <Bot className="h-3 w-3" />;
  return <UserCheck className="h-3 w-3" />;
};

function locationLink(content?: string | null) {
  if (!content) return null;
  try {
    const location = JSON.parse(content) as { latitude?: number; longitude?: number };
    if (typeof location.latitude === "number" && typeof location.longitude === "number") {
      return `https://www.google.com/maps?q=${location.latitude},${location.longitude}`;
    }
  } catch {
    // Older messages may contain a plain maps URL.
  }
  return /^https:\/\//i.test(content) ? content : null;
}

function usePrivateMediaUrl(path?: string | null) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    if (!path) { setUrl(null); return; }
    if (/^(https?:|data:|blob:)/i.test(path)) { setUrl(path); return; }
    supabase.storage.from("media").createSignedUrl(path, 900).then(({ data }) => {
      if (active) setUrl(data?.signedUrl ?? null);
    });
    return () => { active = false; };
  }, [path]);
  return url;
}

function MessageMedia({ message }: { message: InboxMessage }) {
  const url = usePrivateMediaUrl(message.media_url);
  const type = message.message_type;

  if (type === "location") {
    const href = locationLink(message.content);
    return href ? (
      <a href={href} target="_blank" rel="noopener noreferrer" className="mb-2 flex items-center gap-2 rounded-lg border p-2 underline">
        <MapPin className="h-4 w-4" /> Abrir localizaÃ§Ã£o
      </a>
    ) : null;
  }
  if (!url) return null;
  if (type === "image" || type === "sticker") {
    return <a href={url} target="_blank" rel="noopener noreferrer"><img src={url} alt={type === "sticker" ? "Figurinha" : "Imagem"} loading="lazy" className={cn("mb-2 rounded-lg object-contain", type === "sticker" ? "max-h-40 max-w-40" : "max-h-80 max-w-full")} /></a>;
  }
  if (type === "audio") {
    return <audio className="mb-2 w-full min-w-64" controls preload="metadata" src={url}>Seu navegador nÃ£o conseguiu reproduzir o Ã¡udio.</audio>;
  }
  if (type === "video") {
    return <video className="mb-2 max-h-80 max-w-full rounded-lg" controls preload="metadata" src={url}>Seu navegador nÃ£o conseguiu reproduzir o vÃ­deo.</video>;
  }
  return (
    <a href={url} target="_blank" rel="noopener noreferrer" download className="mb-2 flex items-center gap-2 rounded-lg border p-2 underline">
      <FileText className="h-4 w-4" /> Abrir documento
    </a>
  );
}

export function MessageBubble({ message }: MessageBubbleProps) {
  const isIncoming = message.role === "contact";
  const isInternal = message.is_internal;
  const isDraft = message.delivery_status === "draft";
  const locationHasOwnContent = message.message_type === "location" && locationLink(message.content);

  return (
    <div className={cn("flex", isIncoming ? "justify-start" : "justify-end")}>
      <div className={cn("max-w-[72%] rounded-xl px-3 py-2 text-sm shadow-sm", isInternal ? "border border-yellow-500/30 bg-yellow-500/15 text-foreground" : isIncoming ? "rounded-tl-none bg-muted text-foreground" : message.role === "ai" ? isDraft ? "border border-dashed border-primary/40 bg-primary/10 text-foreground" : "rounded-tr-none bg-primary/20 text-foreground" : "rounded-tr-none bg-primary text-primary-foreground")}>
        <div className="mb-1 flex items-center gap-1 opacity-70">
          <RoleIcon role={message.role} />
          <span className="text-xs font-medium">{roleLabel(message.role)}</span>
          {isInternal && <Badge variant="outline" className="h-4 py-0 text-xs">Interno</Badge>}
          {isDraft && <Badge variant="outline" className="h-4 border-primary/40 py-0 text-xs text-primary">SugestÃ£o IA</Badge>}
        </div>
        <MessageMedia message={message} />
        {message.content && !locationHasOwnContent && <p className="whitespace-pre-wrap break-words leading-relaxed">{message.content}</p>}
        {!message.content && !message.media_url && message.message_type !== "text" && <p className="text-xs opacity-70">MÃ­dia ainda nÃ£o disponÃ­vel.</p>}
        <div className={cn("mt-1 flex items-center justify-end gap-1", isIncoming ? "text-muted-foreground" : message.role === "agent" ? "text-primary-foreground/70" : "text-muted-foreground")}>
          <span className="text-xs">{new Date(message.created_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</span>
          {!isIncoming && deliveryIcon(message.delivery_status)}
        </div>
      </div>
    </div>
  );
}

