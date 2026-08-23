import { useEffect, useState } from "react";
import { Check, CheckCheck, Bot, FileText, MapPin } from "lucide-react";
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
  if (status === "read") return <CheckCheck className="h-3.5 w-3.5 text-sky-500" />;
  if (status === "delivered" || status === "received") return <CheckCheck className="h-3.5 w-3.5 text-slate-500" />;
  if (status === "sent") return <Check className="h-3.5 w-3.5 text-slate-500" />;
  return null;
};

function locationLink(content?: string | null) {
  if (!content) return null;
  try {
    const location = JSON.parse(content) as { latitude?: number; longitude?: number };
    if (typeof location.latitude === "number" && typeof location.longitude === "number") {
      return `https://www.google.com/maps?q=${location.latitude},${location.longitude}`;
    }
  } catch {
    // Mensagens antigas podem conter URL do Maps em texto puro.
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
        <MapPin className="h-4 w-4" /> Abrir localização
      </a>
    ) : null;
  }
  if (!url) return null;
  if (type === "image" || type === "sticker") {
    return <a href={url} target="_blank" rel="noopener noreferrer"><img src={url} alt={type === "sticker" ? "Figurinha" : "Imagem"} loading="lazy" className={cn("mb-2 rounded-lg object-contain", type === "sticker" ? "max-h-40 max-w-40" : "max-h-80 max-w-full")} /></a>;
  }
  if (type === "audio") {
    return <audio className="mb-2 w-full min-w-64" controls preload="metadata" src={url}>Seu navegador não conseguiu reproduzir o áudio.</audio>;
  }
  if (type === "video") {
    return <video className="mb-2 max-h-80 max-w-full rounded-lg" controls preload="metadata" src={url}>Seu navegador não conseguiu reproduzir o vídeo.</video>;
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
  const isAi = message.role === "ai";
  const locationHasOwnContent = message.message_type === "location" && locationLink(message.content);

  return (
    <div className={cn("flex w-full", isIncoming ? "justify-start" : "justify-end")}>
      <div
        className={cn(
          "relative max-w-[78%] rounded-lg px-3 py-2 text-sm shadow-sm",
          isInternal
            ? "border border-amber-300 bg-amber-50 text-slate-900 dark:border-amber-700 dark:bg-amber-950/40 dark:text-foreground"
            : isIncoming
              ? "rounded-tl-none border border-border/60 bg-background text-foreground"
              : isAi
                ? "rounded-tr-none border border-dashed border-primary/40 bg-primary/10 text-foreground"
                : "rounded-tr-none bg-emerald-100 text-slate-900 dark:bg-emerald-900/60 dark:text-foreground"
        )}
      >
        {(isInternal || isAi) && (
          <div className="mb-1 flex items-center gap-1.5">
            {isAi && <Bot className="h-3.5 w-3.5 text-primary" />}
            {isAi && <span className="text-xs font-semibold text-primary">IA</span>}
            {isInternal && <Badge variant="outline" className="h-4 border-amber-400 py-0 text-[10px]">Nota interna</Badge>}
            {isDraft && <Badge variant="outline" className="h-4 border-primary/40 py-0 text-[10px] text-primary">Sugestão</Badge>}
          </div>
        )}

        <MessageMedia message={message} />
        {message.content && !locationHasOwnContent && (
          <p className="whitespace-pre-wrap break-words pr-10 leading-relaxed">{message.content}</p>
        )}
        {!message.content && !message.media_url && message.message_type !== "text" && (
          <p className="text-xs opacity-70">Mídia ainda não disponível.</p>
        )}

        <div className="mt-1 flex items-center justify-end gap-1 text-[10px] text-slate-500 dark:text-muted-foreground">
          <span>{new Date(message.created_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</span>
          {!isIncoming && !isInternal && deliveryIcon(message.delivery_status)}
        </div>
      </div>
    </div>
  );
}
