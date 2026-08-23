import express from "express";
import cors from "cors";
import pino from "pino";
import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import makeWASocket, {
  Browsers,
  DisconnectReason,
  fetchLatestBaileysVersion,
  useMultiFileAuthState,
} from "@whiskeysockets/baileys";

const app = express();
const logger = pino({ level: process.env.LOG_LEVEL || "info" });
const PORT = Number(process.env.PORT || 3001);
const DATA_DIR = path.resolve(process.env.WHATSAPP_DATA_DIR || "./sessions");
const BACKEND_TOKEN = process.env.BACKEND_TOKEN || "";
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || "*";
const QR_TTL_MS = Math.max(30000, Number(process.env.QR_TTL_MS || 60000));
const WHATSAPP_WEBHOOK_URL = String(process.env.WHATSAPP_WEBHOOK_URL || "").trim();
const WEBHOOK_TIMEOUT_MS = Math.max(3000, Number(process.env.WEBHOOK_TIMEOUT_MS || 15000));

app.use(cors({ origin: ALLOWED_ORIGIN === "*" ? true : ALLOWED_ORIGIN.split(",").map((v) => v.trim()) }));
app.use(express.json({ limit: "2mb" }));

const sessions = new Map();
const recentSentIds = new Map();

const sanitizeId = (value) => String(value || "").replace(/[^a-zA-Z0-9_-]/g, "");
const sessionDir = (id) => path.join(DATA_DIR, sanitizeId(id));
const metaPath = (id) => path.join(sessionDir(id), "meta.json");

async function ensureDataDir() {
  await fs.mkdir(DATA_DIR, { recursive: true });
}

async function readMeta(id) {
  try {
    return JSON.parse(await fs.readFile(metaPath(id), "utf8"));
  } catch {
    return null;
  }
}

async function writeMeta(id, patch) {
  await fs.mkdir(sessionDir(id), { recursive: true });
  const current = (await readMeta(id)) || {
    id,
    name: "WhatsApp",
    status: "DISCONNECTED",
    qrcode: null,
    qrExpiresAt: null,
    number: null,
    createdAt: new Date().toISOString(),
  };
  const next = { ...current, ...patch, id, updatedAt: new Date().toISOString() };
  await fs.writeFile(metaPath(id), JSON.stringify(next, null, 2));
  return next;
}

function authorized(req) {
  if (!BACKEND_TOKEN) return true;
  const header = req.headers.authorization || "";
  return header === `Bearer ${BACKEND_TOKEN}`;
}

app.use((req, res, next) => {
  if (req.path === "/health") return next();
  if (!authorized(req)) return res.status(401).json({ error: "unauthorized" });
  next();
});

function rememberSentMessage(messageId) {
  if (!messageId) return;
  recentSentIds.set(messageId, Date.now() + 5 * 60 * 1000);
  if (recentSentIds.size > 1000) {
    const now = Date.now();
    for (const [id, expiresAt] of recentSentIds) {
      if (expiresAt <= now) recentSentIds.delete(id);
    }
  }
}

function wasSentByApi(messageId) {
  if (!messageId) return false;
  const expiresAt = recentSentIds.get(messageId);
  if (!expiresAt) return false;
  recentSentIds.delete(messageId);
  return expiresAt > Date.now();
}

function unwrapMessage(message) {
  let current = message || null;
  for (let i = 0; current && i < 5; i += 1) {
    if (current.ephemeralMessage?.message) current = current.ephemeralMessage.message;
    else if (current.viewOnceMessage?.message) current = current.viewOnceMessage.message;
    else if (current.viewOnceMessageV2?.message) current = current.viewOnceMessageV2.message;
    else if (current.documentWithCaptionMessage?.message) current = current.documentWithCaptionMessage.message;
    else break;
  }
  return current || {};
}

function extractMessageData(rawMessage) {
  const message = unwrapMessage(rawMessage);
  if (typeof message.conversation === "string") {
    return { messageType: "text", content: message.conversation };
  }
  if (message.extendedTextMessage) {
    return { messageType: "text", content: message.extendedTextMessage.text || "" };
  }
  if (message.imageMessage) {
    return { messageType: "image", content: message.imageMessage.caption || "[Imagem]", mimeType: message.imageMessage.mimetype || null };
  }
  if (message.videoMessage) {
    return { messageType: "video", content: message.videoMessage.caption || "[Vídeo]", mimeType: message.videoMessage.mimetype || null };
  }
  if (message.audioMessage) {
    return { messageType: "audio", content: "[Áudio]", mimeType: message.audioMessage.mimetype || null };
  }
  if (message.documentMessage) {
    return { messageType: "document", content: message.documentMessage.fileName || "[Documento]", mimeType: message.documentMessage.mimetype || null };
  }
  if (message.stickerMessage) {
    return { messageType: "text", content: "[Figurinha]", mimeType: message.stickerMessage.mimetype || null };
  }
  if (message.contactMessage || message.contactsArrayMessage) {
    return { messageType: "text", content: "[Contato]" };
  }
  if (message.locationMessage || message.liveLocationMessage) {
    return { messageType: "text", content: "[Localização]" };
  }
  if (message.reactionMessage) {
    return { messageType: "text", content: `[Reação ${message.reactionMessage.text || ""}]` };
  }
  return { messageType: "text", content: "[Mensagem não suportada]" };
}

function timestampToIso(value) {
  try {
    const seconds = typeof value === "number" ? value : Number(value?.toString?.() || value || 0);
    if (seconds > 0) return new Date(seconds * 1000).toISOString();
  } catch {}
  return new Date().toISOString();
}

async function dispatchMessageToPlatform(sessionId, msg, source = "live") {
  if (!WHATSAPP_WEBHOOK_URL || !msg?.key?.remoteJid || !msg?.message) return;
  const chatId = String(msg.key.remoteJid);
  if (chatId === "status@broadcast" || chatId.endsWith("@broadcast")) return;

  const messageId = msg.key.id ? String(msg.key.id) : null;
  if (msg.key.fromMe && wasSentByApi(messageId)) return;

  const parsed = extractMessageData(msg.message);
  const payload = {
    event: "message.upsert",
    source,
    session_id: sessionId,
    wa_message_id: messageId,
    chat_id: chatId,
    from_me: Boolean(msg.key.fromMe),
    participant: msg.key.participant || null,
    push_name: msg.pushName || null,
    is_group: chatId.endsWith("@g.us"),
    message_type: parsed.messageType,
    content: parsed.content,
    mime_type: parsed.mimeType || null,
    timestamp: timestampToIso(msg.messageTimestamp),
  };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), WEBHOOK_TIMEOUT_MS);
  try {
    const response = await fetch(WHATSAPP_WEBHOOK_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(BACKEND_TOKEN ? { Authorization: `Bearer ${BACKEND_TOKEN}` } : {}),
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      logger.warn({ sessionId, status: response.status, detail: detail.slice(0, 500) }, "Webhook recusou mensagem");
    }
  } catch (error) {
    logger.warn({ err: error, sessionId }, "Falha ao enviar mensagem ao Supabase");
  } finally {
    clearTimeout(timer);
  }
}

async function dispatchMany(sessionId, messages, source) {
  for (const msg of messages || []) {
    await dispatchMessageToPlatform(sessionId, msg, source);
  }
}

async function closeSocket(id) {
  const entry = sessions.get(id);
  if (!entry?.socket) return;
  try {
    entry.socket.end?.(new Error("manual_disconnect"));
  } catch {}
  sessions.delete(id);
}

async function startSession(rawId) {
  const id = sanitizeId(rawId);
  if (!id) throw new Error("invalid_session_id");

  const existing = sessions.get(id);
  if (existing?.socket) {
    const meta = await readMeta(id);
    if (meta?.status !== "TIMEOUT") return existing;
    sessions.delete(id);
    try { existing.socket.end?.(new Error("qr_expired")); } catch {}
  }

  await ensureDataDir();
  await fs.mkdir(sessionDir(id), { recursive: true });
  await writeMeta(id, { status: "OPENING", qrcode: null, connectionError: null });

  const { state, saveCreds } = await useMultiFileAuthState(sessionDir(id));
  const { version } = await fetchLatestBaileysVersion();

  const socket = makeWASocket({
    version,
    auth: state,
    printQRInTerminal: false,
    logger: logger.child({ sessionId: id }),
    browser: Browsers.ubuntu("Chrome"),
    markOnlineOnConnect: false,
    syncFullHistory: true,
    shouldSyncHistoryMessage: () => true,
  });

  const entry = { id, socket, reconnectTimer: null };
  sessions.set(id, entry);

  socket.ev.on("creds.update", saveCreds);

  socket.ev.on("messages.upsert", ({ messages }) => {
    dispatchMany(id, messages, "live").catch((error) => logger.warn({ err: error, sessionId: id }, "Falha ao processar mensagens"));
  });

  socket.ev.on("messaging-history.set", ({ messages }) => {
    dispatchMany(id, messages, "history").catch((error) => logger.warn({ err: error, sessionId: id }, "Falha ao importar histórico"));
  });

  socket.ev.on("connection.update", async (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      await writeMeta(id, {
        status: "QRCODE",
        qrcode: qr,
        qrExpiresAt: new Date(Date.now() + QR_TTL_MS).toISOString(),
        connectionError: null,
      });
    }

    if (connection === "open") {
      const number = socket.user?.id?.split(":")[0]?.split("@")[0] || null;
      await writeMeta(id, {
        status: "CONNECTED",
        qrcode: null,
        qrExpiresAt: null,
        number,
        connectionError: null,
        lastConnectedAt: new Date().toISOString(),
      });
      logger.info({ sessionId: id, number }, "WhatsApp conectado");
    }

    if (connection === "close") {
      if (sessions.get(id) !== entry) return;
      const statusCode = lastDisconnect?.error?.output?.statusCode;
      const loggedOut = statusCode === DisconnectReason.loggedOut;
      sessions.delete(id);

      await writeMeta(id, {
        status: "DISCONNECTED",
        qrcode: null,
        qrExpiresAt: null,
        connectionError: loggedOut ? "Sessão encerrada no WhatsApp." : null,
        lastDisconnectedAt: new Date().toISOString(),
      });

      if (!loggedOut) {
        const timer = setTimeout(() => {
          startSession(id).catch((error) => logger.error({ err: error, sessionId: id }, "Falha ao reconectar"));
        }, 2500);
        sessions.set(id, { id, socket: null, reconnectTimer: timer });
      }
    }
  });

  return entry;
}

async function restoreSessions() {
  await ensureDataDir();
  const dirs = await fs.readdir(DATA_DIR, { withFileTypes: true });
  for (const dir of dirs) {
    if (!dir.isDirectory()) continue;
    const id = sanitizeId(dir.name);
    const meta = await readMeta(id);
    if (!meta) continue;
    startSession(id).catch((error) => logger.error({ err: error, sessionId: id }, "Falha ao restaurar sessão"));
  }
}

app.get("/health", async (_req, res) => {
  await ensureDataDir();
  res.json({ ok: true, service: "biz-wa-hub-baileys", sessions: sessions.size, messageSync: Boolean(WHATSAPP_WEBHOOK_URL) });
});

app.get("/health/secure", async (_req, res) => {
  await ensureDataDir();
  res.json({ ok: true, authenticated: true, service: "biz-wa-hub-baileys", sessions: sessions.size, messageSync: Boolean(WHATSAPP_WEBHOOK_URL) });
});

app.post("/whatsapp/", async (req, res) => {
  try {
    const id = crypto.randomUUID();
    const name = String(req.body?.name || "WhatsApp").slice(0, 80);
    const meta = await writeMeta(id, {
      name,
      status: "DISCONNECTED",
      qrcode: null,
      provider: "baileys",
    });
    res.status(201).json({ whatsapp: meta });
  } catch (error) {
    logger.error({ err: error }, "Erro ao criar sessão");
    res.status(500).json({ error: "session_create_failed" });
  }
});

app.post("/whatsappsession/:id", async (req, res) => {
  try {
    const id = sanitizeId(req.params.id);
    if (!(await readMeta(id))) return res.status(404).json({ error: "session_not_found" });
    await startSession(id);
    res.status(202).json({ success: true, id, status: "OPENING" });
  } catch (error) {
    logger.error({ err: error, id: req.params.id }, "Erro ao iniciar sessão");
    res.status(500).json({ error: "session_start_failed" });
  }
});

app.get("/whatsapp/:id", async (req, res) => {
  const id = sanitizeId(req.params.id);
  const meta = await readMeta(id);
  if (!meta) return res.status(404).json({ error: "session_not_found" });
  const expiresAt = meta.qrExpiresAt ? new Date(meta.qrExpiresAt).getTime() : 0;
  if (meta.qrcode && expiresAt && expiresAt <= Date.now()) {
    const expired = await writeMeta(id, {
      status: "TIMEOUT",
      qrcode: null,
      qrExpiresAt: null,
      connectionError: "QR Code expirado. Gere um novo código.",
    });
    return res.json({ ...expired, qrExpired: true, qrTtlSeconds: 0 });
  }
  res.json({
    ...meta,
    qrExpired: false,
    qrTtlSeconds: expiresAt ? Math.max(0, Math.ceil((expiresAt - Date.now()) / 1000)) : null,
  });
});

app.delete("/whatsappsession/:id", async (req, res) => {
  const id = sanitizeId(req.params.id);
  const meta = await readMeta(id);
  if (!meta) return res.status(404).json({ error: "session_not_found" });

  const entry = sessions.get(id);
  if (entry?.reconnectTimer) clearTimeout(entry.reconnectTimer);
  if (entry?.socket) {
    try {
      await entry.socket.logout();
    } catch {
      try { entry.socket.end?.(new Error("manual_logout")); } catch {}
    }
  }
  sessions.delete(id);
  await writeMeta(id, { status: "DISCONNECTED", qrcode: null, qrExpiresAt: null, number: null });
  res.json({ success: true });
});

app.delete("/whatsapp/:id", async (req, res) => {
  const id = sanitizeId(req.params.id);
  const entry = sessions.get(id);
  if (entry?.reconnectTimer) clearTimeout(entry.reconnectTimer);
  await closeSocket(id);
  await fs.rm(sessionDir(id), { recursive: true, force: true });
  res.json({ success: true });
});

app.post("/api/send", async (req, res) => {
  try {
    const sessionId = sanitizeId(req.body?.sessionId || req.body?.session_id || req.body?.connectionId);
    const rawJid = String(req.body?.jid || "").trim();
    const number = String(req.body?.number || "").replace(/\D/g, "");
    const body = String(req.body?.body || req.body?.message || "");

    if (!sessionId) return res.status(400).json({ error: "session_id_required" });
    if (!rawJid && !number) return res.status(400).json({ error: "destination_required" });
    if (!body.trim()) return res.status(400).json({ error: "message_required" });

    let entry = sessions.get(sessionId);
    if (!entry?.socket) {
      await startSession(sessionId);
      entry = sessions.get(sessionId);
    }

    const meta = await readMeta(sessionId);
    if (!entry?.socket || meta?.status !== "CONNECTED") {
      return res.status(409).json({ error: "session_not_connected" });
    }

    const jid = rawJid.includes("@") ? rawJid : `${number}@s.whatsapp.net`;
    const result = await entry.socket.sendMessage(jid, { text: body });
    const messageId = result?.key?.id || null;
    rememberSentMessage(messageId);
    res.json({ success: true, messageId, sessionId, jid });
  } catch (error) {
    logger.error({ err: error }, "Erro ao enviar mensagem");
    res.status(500).json({ error: "send_failed" });
  }
});

app.use((err, _req, res, _next) => {
  logger.error({ err }, "Erro não tratado");
  res.status(500).json({ error: "internal_error" });
});

await ensureDataDir();
app.listen(PORT, "0.0.0.0", () => {
  logger.info({ port: PORT, dataDir: DATA_DIR, messageSync: Boolean(WHATSAPP_WEBHOOK_URL) }, "Baileys service iniciado");
  restoreSessions().catch((error) => logger.error({ err: error }, "Falha ao restaurar sessões"));
});
