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
const QR_GENERATION_TIMEOUT_MS = Math.max(10000, Number(process.env.QR_GENERATION_TIMEOUT_MS || 20000));
const WHATSAPP_WEBHOOK_URL = String(process.env.WHATSAPP_WEBHOOK_URL || "").trim();
const WEBHOOK_TIMEOUT_MS = Math.max(3000, Number(process.env.WEBHOOK_TIMEOUT_MS || 15000));
const WEBHOOK_QUEUE_DIR = path.join(DATA_DIR, "_webhook-outbox");
const HISTORY_MAX_PER_REQUEST = 50;

app.use(cors({ origin: ALLOWED_ORIGIN === "*" ? true : ALLOWED_ORIGIN.split(",").map((v) => v.trim()) }));
app.use(express.json({ limit: "4mb" }));

const sessions = new Map();
const recentSentIds = new Map();
const recentMessages = new Map();
const lidToPn = new Map();

const sanitizeId = (value) => String(value || "").replace(/[^a-zA-Z0-9_-]/g, "");
const sessionDir = (id) => path.join(DATA_DIR, sanitizeId(id));
const metaPath = (id) => path.join(sessionDir(id), "meta.json");

async function ensureDataDir() {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.mkdir(WEBHOOK_QUEUE_DIR, { recursive: true });
}

function normalizePnJid(value) {
  const raw = String(value || "").trim();
  if (!raw) return null;
  if (raw.endsWith("@s.whatsapp.net")) return raw;
  const digits = raw.replace(/\D/g, "");
  return digits ? `${digits}@s.whatsapp.net` : null;
}

function rememberLidMapping(mapping) {
  if (!mapping) return;
  const lid = String(mapping.lid || "").trim();
  const pn = normalizePnJid(mapping.pn);
  if (!lid || !pn) return;
  lidToPn.set(lid, pn);
}

function rememberLidMappings(mappings) {
  for (const mapping of mappings || []) rememberLidMapping(mapping);
}

function resolveJid(rawJid, altCandidates = []) {
  const raw = String(rawJid || "").trim();
  if (!raw) return "";
  if (!raw.endsWith("@lid")) return raw;

  const mapped = lidToPn.get(raw);
  if (mapped) return mapped;

  for (const candidate of altCandidates || []) {
    const value = String(candidate || "").trim();
    if (value.endsWith("@s.whatsapp.net")) return value;
    const normalized = normalizePnJid(value);
    if (normalized) return normalized;
  }

  return raw;
}

function messageResolvedJid(msg) {
  const key = msg?.key || {};
  return resolveJid(key.remoteJid, [
    key.remoteJidAlt,
    key.senderPn,
    key.participantPn,
    key.participantAlt,
  ]);
}

const webhookQueuePath = (payload) => {
  const stableId =
    payload.wa_message_id ||
    `${payload.event || "event"}-${payload.chat_id || payload.raw_chat_id || "unknown"}-${Date.now()}`;
  const hash = crypto.createHash("sha256").update(String(stableId)).digest("hex");
  return path.join(WEBHOOK_QUEUE_DIR, `${sanitizeId(payload.session_id)}-${hash}.json`);
};

async function queueWebhookPayload(payload) {
  await fs.mkdir(WEBHOOK_QUEUE_DIR, { recursive: true });
  await fs.writeFile(webhookQueuePath(payload), JSON.stringify(payload));
}

async function sendWebhookPayload(payload) {
  if (!WHATSAPP_WEBHOOK_URL) return { ok: false, status: 0, detail: "webhook_not_configured" };
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
    const detail = response.ok ? "" : await response.text().catch(() => "");
    return { ok: response.ok, status: response.status, detail };
  } finally {
    clearTimeout(timer);
  }
}

async function deliverWebhook(payload, logContext) {
  try {
    const result = await sendWebhookPayload(payload);
    if (!result.ok) {
      await queueWebhookPayload(payload);
      logger.warn(
        { ...logContext, status: result.status, detail: String(result.detail || "").slice(0, 500) },
        "Webhook recusou evento; preservado para nova tentativa",
      );
      return false;
    }
    return true;
  } catch (error) {
    await queueWebhookPayload(payload).catch(() => {});
    logger.warn({ ...logContext, err: error }, "Falha ao enviar evento ao Supabase");
    return false;
  }
}

async function flushWebhookQueue() {
  if (!WHATSAPP_WEBHOOK_URL) return;
  const files = await fs.readdir(WEBHOOK_QUEUE_DIR).catch(() => []);
  for (const file of files.slice(0, 200)) {
    if (!file.endsWith(".json")) continue;
    const queuedPath = path.join(WEBHOOK_QUEUE_DIR, file);
    try {
      const payload = JSON.parse(await fs.readFile(queuedPath, "utf8"));
      const result = await sendWebhookPayload(payload);
      if (result.ok) {
        await fs.rm(queuedPath, { force: true });
        continue;
      }
      if (result.status >= 400 && result.status < 500 && result.status !== 408 && result.status !== 429) {
        logger.warn({ status: result.status, detail: String(result.detail || "").slice(0, 300) }, "Webhook pendente ainda foi recusado");
      }
      break;
    } catch (error) {
      logger.warn({ err: error, file }, "Falha ao reenviar webhook pendente");
      break;
    }
  }
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
  return (req.headers.authorization || "") === `Bearer ${BACKEND_TOKEN}`;
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

function messageCacheKey(key) {
  if (!key?.remoteJid || !key?.id) return null;
  return `${key.remoteJid}:${key.id}`;
}

function cacheMessage(msg) {
  const key = messageCacheKey(msg?.key);
  if (!key || !msg?.message) return;
  recentMessages.set(key, { message: msg.message, expiresAt: Date.now() + 30 * 60 * 1000 });
  if (recentMessages.size > 2500) {
    const now = Date.now();
    for (const [cacheKey, value] of recentMessages) {
      if (value.expiresAt <= now || recentMessages.size > 2000) recentMessages.delete(cacheKey);
    }
  }
}

async function getCachedMessage(key) {
  const cacheKey = messageCacheKey(key);
  if (!cacheKey) return undefined;
  const cached = recentMessages.get(cacheKey);
  if (!cached) return undefined;
  if (cached.expiresAt <= Date.now()) {
    recentMessages.delete(cacheKey);
    return undefined;
  }
  return cached.message;
}

function unwrapMessage(message) {
  let current = message || null;
  for (let i = 0; current && i < 6; i += 1) {
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
  if (typeof message.conversation === "string") return { messageType: "text", content: message.conversation };
  if (message.extendedTextMessage) return { messageType: "text", content: message.extendedTextMessage.text || "" };
  if (message.imageMessage) return { messageType: "image", content: message.imageMessage.caption || "[Imagem]", mimeType: message.imageMessage.mimetype || null };
  if (message.videoMessage) return { messageType: "video", content: message.videoMessage.caption || "[Vídeo]", mimeType: message.videoMessage.mimetype || null };
  if (message.audioMessage) return { messageType: "audio", content: "[Áudio]", mimeType: message.audioMessage.mimetype || null };
  if (message.documentMessage) return { messageType: "document", content: message.documentMessage.fileName || "[Documento]", mimeType: message.documentMessage.mimetype || null };
  if (message.stickerMessage) return { messageType: "text", content: "[Figurinha]", mimeType: message.stickerMessage.mimetype || null };
  if (message.contactMessage || message.contactsArrayMessage) return { messageType: "text", content: "[Contato]" };
  if (message.locationMessage || message.liveLocationMessage) return { messageType: "text", content: "[Localização]" };
  if (message.reactionMessage) return { messageType: "text", content: `[Reação ${message.reactionMessage.text || ""}]` };
  if (message.protocolMessage) return { messageType: "text", content: "[Mensagem de sistema]" };
  return { messageType: "text", content: "[Mensagem não suportada]" };
}

function timestampToIso(value) {
  try {
    const seconds = typeof value === "number" ? value : Number(value?.toString?.() || value || 0);
    if (seconds > 0) return new Date(seconds * 1000).toISOString();
  } catch {}
  return new Date().toISOString();
}

function contactEventPayload(sessionId, contact, source = "live", fallback = {}) {
  const rawId = String(contact?.id || fallback.id || "").trim();
  if (!rawId) return null;

  const explicitPhoneJid =
    contact?.phoneNumber ||
    contact?.pnJid ||
    fallback.phoneNumber ||
    fallback.pnJid ||
    null;

  const explicitLid = contact?.lid || contact?.lidJid || fallback.lid || fallback.lidJid || null;
  if (explicitLid && explicitPhoneJid) rememberLidMapping({ lid: explicitLid, pn: explicitPhoneJid });
  if (rawId.endsWith("@lid") && explicitPhoneJid) rememberLidMapping({ lid: rawId, pn: explicitPhoneJid });

  const chatId = resolveJid(rawId, [explicitPhoneJid]);
  const name = String(
    contact?.name ||
      contact?.notify ||
      contact?.verifiedName ||
      contact?.displayName ||
      contact?.username ||
      fallback.name ||
      fallback.notify ||
      "",
  ).trim();

  return {
    event: "contact.upsert",
    source,
    session_id: sessionId,
    chat_id: chatId,
    raw_chat_id: rawId,
    lid: rawId.endsWith("@lid") ? rawId : explicitLid || null,
    phone_jid: chatId.endsWith("@s.whatsapp.net") ? chatId : normalizePnJid(explicitPhoneJid),
    name: name || null,
    notify: contact?.notify || fallback.notify || null,
    username: contact?.username || fallback.username || null,
    is_group: rawId.endsWith("@g.us") || chatId.endsWith("@g.us"),
  };
}

async function dispatchContactToPlatform(sessionId, contact, source = "live", fallback = {}) {
  if (!WHATSAPP_WEBHOOK_URL) return;
  const payload = contactEventPayload(sessionId, contact, source, fallback);
  if (!payload) return;
  if (payload.chat_id === "status@broadcast" || payload.chat_id.endsWith("@broadcast")) return;

  const ok = await deliverWebhook(payload, { sessionId, chatId: payload.chat_id, source, event: payload.event });
  if (ok) logger.info({ sessionId, chatId: payload.chat_id, source }, "Contato encaminhado ao Inbox");
}

async function dispatchContacts(sessionId, contacts, source = "live") {
  for (const contact of contacts || []) await dispatchContactToPlatform(sessionId, contact, source);
}

async function dispatchChatsAsContacts(sessionId, chats, source = "history") {
  for (const chat of chats || []) {
    await dispatchContactToPlatform(
      sessionId,
      {
        id: chat?.id,
        name: chat?.displayName || chat?.name || chat?.username || undefined,
        phoneNumber: chat?.pnJid || undefined,
        lid: chat?.lidJid || chat?.accountLid || undefined,
        username: chat?.username || undefined,
      },
      source,
    );
  }
}

async function dispatchMessageToPlatform(sessionId, msg, source = "live") {
  if (!WHATSAPP_WEBHOOK_URL || !msg?.key?.remoteJid || !msg?.message) return;
  cacheMessage(msg);

  const rawChatId = String(msg.key.remoteJid);
  const chatId = messageResolvedJid(msg);
  if (!chatId || chatId === "status@broadcast" || chatId.endsWith("@broadcast")) return;

  const messageId = msg.key.id ? String(msg.key.id) : null;
  if (msg.key.fromMe && wasSentByApi(messageId)) return;

  const parsed = extractMessageData(msg.message);
  const payload = {
    event: "message.upsert",
    source,
    session_id: sessionId,
    wa_message_id: messageId,
    chat_id: chatId,
    raw_chat_id: rawChatId,
    from_me: Boolean(msg.key.fromMe),
    participant: msg.key.participant || null,
    participant_pn: msg.key.participantPn || null,
    push_name: msg.pushName || null,
    is_group: chatId.endsWith("@g.us") || rawChatId.endsWith("@g.us"),
    message_type: parsed.messageType,
    content: parsed.content,
    mime_type: parsed.mimeType || null,
    timestamp: timestampToIso(msg.messageTimestamp),
  };

  const ok = await deliverWebhook(payload, { sessionId, messageId, chatId, rawChatId, source });
  if (ok) logger.info({ sessionId, messageId, chatId, source }, "Mensagem encaminhada ao Inbox");
}

async function dispatchMany(sessionId, messages, source) {
  for (const msg of messages || []) await dispatchMessageToPlatform(sessionId, msg, source);
}

function clearSessionTimers(entry) {
  if (!entry) return;
  if (entry.reconnectTimer) clearTimeout(entry.reconnectTimer);
  if (entry.qrWatchdog) clearTimeout(entry.qrWatchdog);
}

async function closeSocket(id) {
  const entry = sessions.get(id);
  if (!entry) return;
  clearSessionTimers(entry);
  if (entry.socket) {
    try {
      entry.socket.end?.(new Error("manual_disconnect"));
    } catch {}
  }
  sessions.delete(id);
}

async function startSession(rawId, options = {}) {
  const id = sanitizeId(rawId);
  if (!id) throw new Error("invalid_session_id");
  const forceRestart = options.forceRestart === true;

  const existing = sessions.get(id);
  if (existing?.socket) {
    const meta = await readMeta(id);
    const updatedAt = meta?.updatedAt ? new Date(meta.updatedAt).getTime() : 0;
    const openingAge = updatedAt ? Date.now() - updatedAt : Number.POSITIVE_INFINITY;
    const openingStale = meta?.status === "OPENING" && openingAge >= QR_GENERATION_TIMEOUT_MS;
    const shouldRestart = forceRestart || meta?.status === "TIMEOUT" || meta?.status === "DISCONNECTED" || openingStale;
    if (!shouldRestart) return existing;

    logger.warn({ sessionId: id, status: meta?.status, openingAge, forceRestart }, "Reiniciando socket Baileys");
    clearSessionTimers(existing);
    sessions.delete(id);
    try {
      existing.socket.end?.(new Error("restart_for_qr"));
    } catch {}
  }

  await ensureDataDir();
  await fs.mkdir(sessionDir(id), { recursive: true });
  await writeMeta(id, { status: "OPENING", qrcode: null, qrExpiresAt: null, connectionError: null });

  const { state, saveCreds } = await useMultiFileAuthState(sessionDir(id));
  const { version } = await fetchLatestBaileysVersion();

  const socket = makeWASocket({
    version,
    auth: state,
    printQRInTerminal: false,
    logger: logger.child({ sessionId: id }),
    browser: Browsers.macOS("Desktop"),
    markOnlineOnConnect: false,
    fireInitQueries: true,
    syncFullHistory: true,
    shouldSyncHistoryMessage: () => true,
    getMessage: getCachedMessage,
  });

  const entry = { id, socket, reconnectTimer: null, qrWatchdog: null, startedAt: Date.now() };
  sessions.set(id, entry);

  entry.qrWatchdog = setTimeout(async () => {
    if (sessions.get(id) !== entry) return;
    const meta = await readMeta(id);
    if (meta?.status !== "OPENING") return;

    logger.warn({ sessionId: id }, "QR não foi gerado no tempo esperado; reiniciando socket Baileys");
    sessions.delete(id);
    try {
      socket.end?.(new Error("qr_generation_timeout"));
    } catch {}
    await writeMeta(id, {
      status: "DISCONNECTED",
      qrcode: null,
      qrExpiresAt: null,
      connectionError: "O servidor demorou para gerar o QR Code. Tentando novamente.",
    });

    setTimeout(() => {
      startSession(id, { forceRestart: true }).catch((error) =>
        logger.error({ err: error, sessionId: id }, "Falha ao reiniciar sessão após timeout do QR"),
      );
    }, 1000).unref();
  }, QR_GENERATION_TIMEOUT_MS);
  entry.qrWatchdog.unref?.();

  socket.ev.on("creds.update", saveCreds);

  socket.ev.on("messages.upsert", (event) => {
    logger.info(
      { sessionId: id, count: event.messages?.length || 0, type: event.type, requestId: event.requestId || null },
      "messages.upsert recebido do WhatsApp",
    );
    for (const msg of event.messages || []) cacheMessage(msg);
    dispatchMany(id, event.messages, event.type === "notify" ? "live" : `upsert:${event.type || "unknown"}`).catch((error) =>
      logger.warn({ err: error, sessionId: id }, "Falha ao processar messages.upsert"),
    );
  });

  socket.ev.on("messaging-history.set", (event) => {
    const messages = event.messages || [];
    const contacts = event.contacts || [];
    const chats = event.chats || [];
    const mappings = event.lidPnMappings || [];

    rememberLidMappings(mappings);
    logger.info(
      {
        sessionId: id,
        messages: messages.length,
        contacts: contacts.length,
        chats: chats.length,
        mappings: mappings.length,
        isLatest: event.isLatest,
        progress: event.progress ?? null,
        syncType: event.syncType ?? null,
      },
      "messaging-history.set recebido do WhatsApp",
    );

    for (const msg of messages) cacheMessage(msg);
    Promise.resolve()
      .then(() => dispatchContacts(id, contacts, "history"))
      .then(() => dispatchChatsAsContacts(id, chats, "history"))
      .then(() => dispatchMany(id, messages, "history"))
      .catch((error) => logger.warn({ err: error, sessionId: id }, "Falha ao importar histórico completo"));
  });

  socket.ev.on("contacts.upsert", (contacts) => {
    logger.info({ sessionId: id, count: contacts?.length || 0 }, "contacts.upsert recebido do WhatsApp");
    dispatchContacts(id, contacts, "contacts.upsert").catch((error) =>
      logger.warn({ err: error, sessionId: id }, "Falha ao sincronizar contatos"),
    );
  });

  socket.ev.on("contacts.update", (contacts) => {
    logger.info({ sessionId: id, count: contacts?.length || 0 }, "contacts.update recebido do WhatsApp");
    dispatchContacts(id, contacts, "contacts.update").catch((error) =>
      logger.warn({ err: error, sessionId: id }, "Falha ao atualizar contatos"),
    );
  });

  socket.ev.on("chats.upsert", (chats) => {
    logger.info({ sessionId: id, count: chats?.length || 0 }, "chats.upsert recebido do WhatsApp");
    dispatchChatsAsContacts(id, chats, "chats.upsert").catch((error) =>
      logger.warn({ err: error, sessionId: id }, "Falha ao sincronizar chats"),
    );
  });

  socket.ev.on("lid-mapping.update", (mapping) => {
    rememberLidMapping(mapping);
    logger.info({ sessionId: id, lid: mapping?.lid || null, pn: mapping?.pn || null }, "LID/telefone atualizado");
  });

  socket.ev.on("connection.update", async (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      if (entry.qrWatchdog) {
        clearTimeout(entry.qrWatchdog);
        entry.qrWatchdog = null;
      }
      await writeMeta(id, {
        status: "QRCODE",
        qrcode: qr,
        qrExpiresAt: new Date(Date.now() + QR_TTL_MS).toISOString(),
        connectionError: null,
      });
      logger.info({ sessionId: id }, "QR Code recebido do WhatsApp");
    }

    if (connection === "open") {
      clearSessionTimers(entry);
      const number = socket.user?.id?.split(":")[0]?.split("@")[0] || null;
      await writeMeta(id, {
        status: "CONNECTED",
        qrcode: null,
        qrExpiresAt: null,
        number,
        connectionError: null,
        lastConnectedAt: new Date().toISOString(),
      });
      logger.info({ sessionId: id, number, webhookConfigured: Boolean(WHATSAPP_WEBHOOK_URL) }, "WhatsApp conectado");
    }

    if (connection === "close") {
      if (sessions.get(id) !== entry) return;
      clearSessionTimers(entry);
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

      logger.warn({ sessionId: id, statusCode, loggedOut, error: lastDisconnect?.error?.message || null }, "Conexão Baileys fechada");

      if (!loggedOut) {
        const timer = setTimeout(() => {
          startSession(id).catch((error) => logger.error({ err: error, sessionId: id }, "Falha ao reconectar"));
        }, 2500);
        sessions.set(id, { id, socket: null, reconnectTimer: timer, qrWatchdog: null });
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
  res.json({
    ok: true,
    service: "biz-wa-hub-baileys",
    sessions: sessions.size,
    messageSync: Boolean(WHATSAPP_WEBHOOK_URL),
    contactsSync: Boolean(WHATSAPP_WEBHOOK_URL),
    historySync: true,
    baileysVersionFloor: "6.7.22",
    qrRecovery: true,
  });
});

app.get("/health/secure", async (_req, res) => {
  await ensureDataDir();
  res.json({
    ok: true,
    authenticated: true,
    service: "biz-wa-hub-baileys",
    sessions: sessions.size,
    messageSync: Boolean(WHATSAPP_WEBHOOK_URL),
    contactsSync: Boolean(WHATSAPP_WEBHOOK_URL),
    historySync: true,
    baileysVersionFloor: "6.7.22",
    qrRecovery: true,
  });
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
    const existingMeta = await readMeta(id);
    const forceRestart = existingMeta?.status === "OPENING" && !existingMeta?.qrcode;
    await startSession(id, { forceRestart });
    res.status(202).json({ success: true, id, status: "OPENING", forceRestart });
  } catch (error) {
    logger.error({ err: error, id: req.params.id }, "Erro ao iniciar sessão");
    res.status(500).json({ error: "session_start_failed" });
  }
});

app.get("/whatsapp/:id", async (req, res) => {
  const id = sanitizeId(req.params.id);
  const meta = await readMeta(id);
  if (!meta) return res.status(404).json({ error: "session_not_found" });

  if (meta.status === "OPENING") {
    const updatedAt = meta.updatedAt ? new Date(meta.updatedAt).getTime() : 0;
    if (updatedAt && Date.now() - updatedAt >= QR_GENERATION_TIMEOUT_MS) {
      logger.warn({ sessionId: id }, "Consulta detectou sessão presa em OPENING; forçando recuperação");
      startSession(id, { forceRestart: true }).catch((error) =>
        logger.error({ err: error, sessionId: id }, "Falha ao recuperar sessão presa em OPENING"),
      );
    }
  }

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
  clearSessionTimers(entry);
  if (entry?.socket) {
    try {
      await entry.socket.logout();
    } catch {
      try {
        entry.socket.end?.(new Error("manual_logout"));
      } catch {}
    }
  }
  sessions.delete(id);
  await writeMeta(id, { status: "DISCONNECTED", qrcode: null, qrExpiresAt: null, number: null });
  res.json({ success: true });
});

app.delete("/whatsapp/:id", async (req, res) => {
  const id = sanitizeId(req.params.id);
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
    if (!entry?.socket || meta?.status !== "CONNECTED") return res.status(409).json({ error: "session_not_connected" });

    let jid = rawJid.includes("@") ? resolveJid(rawJid) : `${number}@s.whatsapp.net`;
    if (!jid) return res.status(400).json({ error: "invalid_destination" });

    if (!rawJid.includes("@") && number) {
      const [exists] = await entry.socket.onWhatsApp(jid).catch(() => []);
      if (exists?.exists === false) return res.status(404).json({ error: "number_not_on_whatsapp" });
      if (exists?.jid) jid = exists.jid;
    }

    const result = await entry.socket.sendMessage(jid, { text: body });
    cacheMessage(result);
    const messageId = result?.key?.id || null;
    rememberSentMessage(messageId);
    res.json({ success: true, messageId, sessionId, jid });
  } catch (error) {
    logger.error({ err: error }, "Erro ao enviar mensagem");
    res.status(500).json({ error: "send_failed", message: error instanceof Error ? error.message : "erro desconhecido" });
  }
});

app.post("/api/history/:id", async (req, res) => {
  try {
    const sessionId = sanitizeId(req.params.id);
    const entry = sessions.get(sessionId);
    const meta = await readMeta(sessionId);
    if (!entry?.socket || meta?.status !== "CONNECTED") return res.status(409).json({ error: "session_not_connected" });

    const rawJid = String(req.body?.jid || "").trim();
    const jid = resolveJid(rawJid);
    const oldestKey = req.body?.oldest_key || req.body?.key || null;
    const oldestTimestamp = req.body?.oldest_timestamp || req.body?.message_timestamp || null;
    const count = Math.min(HISTORY_MAX_PER_REQUEST, Math.max(1, Number(req.body?.count || 50)));

    if (!jid || !oldestKey || !oldestTimestamp) {
      return res.status(400).json({
        error: "jid_oldest_key_and_timestamp_required",
        message: "Para buscar histórico anterior o Baileys exige o JID, a chave da mensagem mais antiga e o timestamp dela.",
      });
    }

    await entry.socket.fetchMessageHistory(count, oldestKey, oldestTimestamp);
    res.status(202).json({ success: true, requested: count, jid, message: "O histórico solicitado chegará em messaging-history.set." });
  } catch (error) {
    logger.error({ err: error, sessionId: req.params.id }, "Erro ao solicitar histórico sob demanda");
    res.status(500).json({ error: "history_request_failed", message: error instanceof Error ? error.message : "erro desconhecido" });
  }
});

app.use((err, _req, res, _next) => {
  logger.error({ err }, "Erro não tratado");
  res.status(500).json({ error: "internal_error" });
});

await ensureDataDir();
app.listen(PORT, "0.0.0.0", () => {
  logger.info(
    {
      port: PORT,
      dataDir: DATA_DIR,
      messageSync: Boolean(WHATSAPP_WEBHOOK_URL),
      contactsSync: Boolean(WHATSAPP_WEBHOOK_URL),
      qrGenerationTimeoutMs: QR_GENERATION_TIMEOUT_MS,
    },
    "Baileys service iniciado",
  );
  restoreSessions().catch((error) => logger.error({ err: error }, "Falha ao restaurar sessões"));
  flushWebhookQueue().catch((error) => logger.warn({ err: error }, "Falha ao recuperar webhooks pendentes"));
  setInterval(() => {
    flushWebhookQueue().catch((error) => logger.warn({ err: error }, "Falha ao reenviar webhooks pendentes"));
  }, 10000).unref();
});
