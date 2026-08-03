import { Check, CheckCheck, Bot, User, UserCheck, FileText, MapPin, Download, ImageOff, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useSignedMediaUrl, formatBytes, formatDuration } from "@/hooks/useSignedMediaUrl";

interface InboxMessage {
  role: "contact" | "agent" | "ai" | "system";
  is_internal?: boolean;
  delivery_status?: string | null;
  message_type?: "text" | "audio" | "image" | "document" | "video" | "sticker" | "location";
  media_url?: string | null;
  media_mime_type?: string | null;
  media_storage_path?: string | null;
  media_filename?: string | null;
  media_size_bytes?: number | null;
  media_duration_seconds?: number | null;
  media_width?: number | null;
  media_height?: number | null;
  media_caption?: string | null;
  media_status?: string | null;
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

function MediaShell({ children }: { children: React.ReactNode }) {
  return <div className="mb-2">{children}</div>;
}

function MediaUnavailable({ label }: { label: string }) {
  return (
    <MediaShell>
      <div className="flex items-center gap-2 rounded-lg border border-dashed p-2 text-xs text-muted-foreground">
        <ImageOff className="h-4 w-4" aria-hidden="true" /> {label}
      </div>
    </MediaShell>
  );
}

function MediaLoading() {
  return (
    <MediaShell>
      <div className="flex items-center gap-2 rounded-lg border p-2 text-xs text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Carregando mídia...
      </div>
    </MediaShell>
  );
}

function MessageMedia({ message }: { message: InboxMessage }) {
  const type = message.message_type;
  const { url, loading, error } = useSignedMediaUrl(message.media_storage_path, message.media_url);

  if (type === "location") {
    const href = locationLink(message.content);
    return href ? (
      <MediaShell>
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 rounded-lg border p-2 underline"
        >
          <MapPin className="h-4 w-4" aria-hidden="true" /> Abrir localização no mapa
        </a>
      </MediaShell>
    ) : null;
  }

  if (!type || type === "text") return null;
  if (message.media_status === "processing") return <MediaLoading />;
  if (loading) return <MediaLoading />;
  if (error) return <MediaUnavailable label={error} />;
  if (!url) {
    return message.media_status === "failed"
      ? <MediaUnavailable label="Não foi possível processar esta mídia" />
      : <MediaUnavailable label="Mídia ainda não disponível" />;
  }

  const meta = [formatBytes(message.media_size_bytes), formatDuration(message.media_duration_seconds)]
    .filter(Boolean)
    .join(" • ");

  if (type === "image" || type === "sticker") {
    return (
      <MediaShell>
        <a href={url} target="_blank" rel="noopener noreferrer">
          <img
            src={url}
            alt={message.media_caption || (type === "sticker" ? "Figurinha" : "Imagem recebida")}
            loading="lazy"
            width={message.media_width ?? undefined}
            height={message.media_height ?? undefined}
            className={cn(
              "rounded-lg bg-muted object-contain",
              type === "sticker" ? "max-h-32 max-w-32 sm:max-h-40 sm:max-w-40" : "max-h-64 w-auto max-w-full sm:max-h-80",
            )}
          />
        </a>
      </MediaShell>
    );
  }

  if (type === "audio") {
    return (
      <MediaShell>
        <audio className="w-full max-w-full sm:min-w-64" controls preload="metadata" src={url}>
          Seu navegador não conseguiu reproduzir o áudio.
        </audio>
        {meta && <p className="mt-1 text-xs opacity-70">{meta}</p>}
      </MediaShell>
    );
  }

  if (type === "video") {
    return (
      <MediaShell>
        <video className="max-h-64 w-full max-w-full rounded-lg bg-black sm:max-h-80" controls preload="metadata" src={url}>
          Seu navegador não conseguiu reproduzir o vídeo.
        </video>
        {meta && <p className="mt-1 text-xs opacity-70">{meta}</p>}
      </MediaShell>
    );
  }

  return (
    <MediaShell>
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        download={message.media_filename ?? undefined}
        className="flex items-center gap-2 rounded-lg border p-2 hover:bg-muted/50"
      >
        <FileText className="h-4 w-4 shrink-0" aria-hidden="true" />
        <span className="min-w-0 flex-1 truncate underline">{message.media_filename || "Documento"}</span>
        <Download className="h-4 w-4 shrink-0 opacity-70" aria-hidden="true" />
      </a>
      {meta && <p className="mt-1 text-xs opacity-70">{meta}</p>}
    </MediaShell>
  );
}

export function MessageBubble({ message }: MessageBubbleProps) {
  const isIncoming = message.role === "contact";
  const isInternal = message.is_internal;
  const isDraft = message.delivery_status === "draft";
  const locationHasOwnContent = message.message_type === "location" && locationLink(message.content);
  const caption = message.media_caption;

  return (
    <div className={cn("flex", isIncoming ? "justify-start" : "justify-end")}>
      <div
        className={cn(
          "max-w-[85%] rounded-xl px-3 py-2 text-sm shadow-sm sm:max-w-[72%]",
          isInternal
            ? "border border-yellow-500/30 bg-yellow-500/15 text-foreground"
            : isIncoming
              ? "rounded-tl-none bg-muted text-foreground"
              : message.role === "ai"
                ? isDraft
                  ? "border border-dashed border-primary/40 bg-primary/10 text-foreground"
                  : "rounded-tr-none bg-primary/20 text-foreground"
                : "rounded-tr-none bg-primary text-primary-foreground",
        )}
      >
        <div className="mb-1 flex items-center gap-1 opacity-70">
          <RoleIcon role={message.role} />
          <span className="text-xs font-medium">{roleLabel(message.role)}</span>
          {isInternal && <Badge variant="outline" className="h-4 py-0 text-xs">Interno</Badge>}
          {isDraft && <Badge variant="outline" className="h-4 border-primary/40 py-0 text-xs text-primary">Sugestão IA</Badge>}
        </div>
        <MessageMedia message={message} />
        {caption && <p className="whitespace-pre-wrap break-words leading-relaxed">{caption}</p>}
        {message.content && !locationHasOwnContent && message.content !== caption && (
          <p className="whitespace-pre-wrap break-words leading-relaxed">{message.content}</p>
        )}
        <div
          className={cn(
            "mt-1 flex items-center justify-end gap-1",
            isIncoming ? "text-muted-foreground" : message.role === "agent" ? "text-primary-foreground/70" : "text-muted-foreground",
          )}
        >
          <span className="text-xs">
            {new Date(message.created_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
          </span>
          {!isIncoming && deliveryIcon(message.delivery_status)}
        </div>
      </div>
    </div>
  );
}
