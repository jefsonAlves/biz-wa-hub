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

app.use(cors({ origin: ALLOWED_ORIGIN === "*" ? true : ALLOWED_ORIGIN.split(",").map((v) => v.trim()) }));
app.use(express.json({ limit: "2mb" }));

const sessions = new Map();

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
  if (existing?.socket) return existing;

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
    syncFullHistory: false,
  });

  const entry = { id, socket, reconnectTimer: null };
  sessions.set(id, entry);

  socket.ev.on("creds.update", saveCreds);

  socket.ev.on("connection.update", async (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      await writeMeta(id, { status: "QRCODE", qrcode: qr, connectionError: null });
    }

    if (connection === "open") {
      const number = socket.user?.id?.split(":")[0]?.split("@")[0] || null;
      await writeMeta(id, {
        status: "CONNECTED",
        qrcode: null,
        number,
        connectionError: null,
        lastConnectedAt: new Date().toISOString(),
      });
      logger.info({ sessionId: id, number }, "WhatsApp conectado");
    }

    if (connection === "close") {
      const statusCode = lastDisconnect?.error?.output?.statusCode;
      const loggedOut = statusCode === DisconnectReason.loggedOut;
      sessions.delete(id);

      await writeMeta(id, {
        status: "DISCONNECTED",
        qrcode: null,
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
  res.json({ ok: true, service: "biz-wa-hub-baileys", sessions: sessions.size });
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
  res.json(meta);
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
  await writeMeta(id, { status: "DISCONNECTED", qrcode: null, number: null });
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
    const number = String(req.body?.number || "").replace(/\D/g, "");
    const body = String(req.body?.body || req.body?.message || "");

    if (!sessionId) return res.status(400).json({ error: "session_id_required" });
    if (!number) return res.status(400).json({ error: "number_required" });
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

    const jid = `${number}@s.whatsapp.net`;
    const result = await entry.socket.sendMessage(jid, { text: body });
    res.json({ success: true, messageId: result?.key?.id || null, sessionId });
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
  logger.info({ port: PORT, dataDir: DATA_DIR }, "Baileys service iniciado");
  restoreSessions().catch((error) => logger.error({ err: error }, "Falha ao restaurar sessões"));
});
