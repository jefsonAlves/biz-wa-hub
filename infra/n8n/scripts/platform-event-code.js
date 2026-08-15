const crypto = require('crypto');

const input = $input.first().json;
const headers = Object.fromEntries(
  Object.entries(input.headers ?? {}).map(([key, value]) => [key.toLowerCase(), String(value)]),
);
const tenantId = headers['x-tenant-id'];
const eventId = headers['x-event-id'];
const timestamp = headers['x-timestamp'];
const signature = (headers['x-signature'] ?? '').toLowerCase();
const rawBody = typeof input.rawBody === 'string' ? input.rawBody : JSON.stringify(input.body ?? {});
const result = (statusCode, response) => [{ json: { statusCode, response } }];
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

if (!tenantId || !eventId || !timestamp || !signature) {
  return result(400, { ok: false, error: 'missing_headers' });
}
if (!uuid.test(tenantId) || !uuid.test(eventId)) {
  return result(400, { ok: false, error: 'invalid_identifiers' });
}
if (Math.abs(Math.floor(Date.now() / 1000) - Number(timestamp)) > 300) {
  return result(401, { ok: false, error: 'expired_timestamp' });
}

const secret = $env.N8N_WEBHOOK_SECRET;
if (!secret) return result(503, { ok: false, error: 'webhook_secret_not_configured' });

const expected = crypto.createHmac('sha256', secret).update(`${timestamp}.${eventId}.${rawBody}`).digest('hex');
const expectedBytes = Buffer.from(expected, 'hex');
const signatureBytes = /^[0-9a-f]{64}$/.test(signature) ? Buffer.from(signature, 'hex') : Buffer.alloc(0);
if (expectedBytes.length !== signatureBytes.length || !crypto.timingSafeEqual(expectedBytes, signatureBytes)) {
  return result(401, { ok: false, error: 'invalid_signature' });
}

let event;
try {
  event = JSON.parse(rawBody);
} catch {
  return result(400, { ok: false, error: 'invalid_json' });
}
if (event.tenant_id !== tenantId || event.event_id !== eventId || typeof event.event_type !== 'string') {
  return result(400, { ok: false, error: 'invalid_event' });
}
if (event.event_type === 'system.integration.test') {
  return result(202, { ok: true, accepted: true, event_id: eventId });
}

const supported = new Set([
  'whatsapp.connection.create',
  'whatsapp.connection.qr.request',
  'whatsapp.connection.status.request',
  'whatsapp.connection.disconnect',
  'whatsapp.connection.reconnect',
  'whatsapp.connection.delete',
  'whatsapp.messages.sync.request',
  'whatsapp.message.send',
]);
if (!supported.has(event.event_type)) {
  return result(202, { ok: true, accepted: true, event_id: eventId, ignored: true, reason: 'unsupported_event_type' });
}
if (!event.connection_id || !uuid.test(event.connection_id)) {
  return result(400, { ok: false, error: 'connection_id_required' });
}

const apiBase = ($env.EVOLUTION_API_URL || '').replace(/\/+$/, '');
const apiKey = $env.EVOLUTION_API_KEY;
const publicN8nUrl = ($env.WEBHOOK_URL || $env.N8N_PUBLIC_URL || '').replace(/\/+$/, '');
if (!apiBase || !apiKey) return result(503, { ok: false, error: 'evolution_not_configured' });

const instanceName = event.data?.provider_instance_id || event.data?.provider_session_id || `bizwa_${event.connection_id.replace(/-/g, '')}`;
const webhookToken = crypto.createHmac('sha256', secret).update(`${tenantId}.${event.connection_id}.${instanceName}`).digest('hex');

const parseJson = (text) => {
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    return { raw: String(text || '').slice(0, 500) };
  }
};

const evo = async (method, path, body) => {
  const response = await fetch(apiBase + path, {
    method,
    headers: { apikey: apiKey, 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  return { ok: response.ok, status: response.status, data: parseJson(text), text };
};

const evoAny = async (attempts) => {
  const errors = [];
  for (const attempt of attempts) {
    const response = await evo(attempt.method, attempt.path, attempt.body);
    if (response.ok) return response;
    errors.push(`${attempt.method} ${attempt.path} -> ${response.status}`);
    if (![404, 405, 400].includes(response.status)) break;
  }
  return { ok: false, status: 0, data: { errors }, text: errors.join('; ') };
};

const callback = async (eventType, data) => {
  const callbackId = crypto.randomUUID();
  const body = JSON.stringify({
    event_id: callbackId,
    event_type: eventType,
    tenant_id: tenantId,
    connection_id: event.connection_id,
    conversation_id: event.conversation_id ?? null,
    occurred_at: new Date().toISOString(),
    source: 'n8n',
    version: 1,
    data,
  });
  const ts = String(Math.floor(Date.now() / 1000));
  const sig = crypto.createHmac('sha256', secret).update(`${ts}.${callbackId}.${body}`).digest('hex');
  const response = await fetch($env.SUPABASE_URL.replace(/\/+$/, '') + '/functions/v1/n8n-webhook-receiver', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Tenant-Id': tenantId,
      'X-Event-Id': callbackId,
      'X-Timestamp': ts,
      'X-Signature': sig,
    },
    body,
  });
  return { ok: response.ok, status: response.status, event_id: callbackId };
};

const extractArray = (payload, keys) => {
  if (Array.isArray(payload)) return payload;
  for (const key of keys) {
    const value = payload?.[key];
    if (Array.isArray(value)) return value;
    if (Array.isArray(value?.records)) return value.records;
    if (Array.isArray(value?.data)) return value.data;
  }
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.response)) return payload.response;
  return [];
};

const messageContent = (message) => {
  const body = message.message ?? message;
  return body.conversation
    ?? body.extendedTextMessage?.text
    ?? body.imageMessage?.caption
    ?? body.videoMessage?.caption
    ?? body.documentMessage?.caption
    ?? message.text
    ?? message.body
    ?? message.content
    ?? '';
};

const normalizeMessage = (message) => {
  const key = message.key ?? {};
  const remoteJid = String(key.remoteJid ?? message.remoteJid ?? message.chatId ?? message.chat_id ?? message.from ?? '');
  if (!remoteJid || remoteJid === 'status@broadcast' || remoteJid.endsWith('@newsletter')) return null;
  const body = message.message ?? message;
  const media = body.imageMessage ?? body.audioMessage ?? body.videoMessage ?? body.documentMessage ?? body.stickerMessage ?? null;
  const messageType = body.imageMessage ? 'image'
    : body.audioMessage ? 'audio'
      : body.videoMessage ? 'video'
        : body.documentMessage ? 'document'
          : body.stickerMessage ? 'sticker'
            : body.locationMessage ? 'location'
              : 'text';
  const timestampValue = message.messageTimestamp ?? message.timestamp ?? message.createdAt ?? message.messageTimestampLong;
  const timestampMs = typeof timestampValue === 'number'
    ? (timestampValue > 9999999999 ? timestampValue : timestampValue * 1000)
    : Date.parse(String(timestampValue || ''));
  return {
    chat_id: remoteJid,
    phone: remoteJid.split('@')[0].replace(/\D/g, ''),
    name: message.pushName ?? message.notifyName ?? message.name ?? null,
    content: String(messageContent(message)),
    from_me: key.fromMe === true || message.fromMe === true,
    direction: key.fromMe === true || message.fromMe === true ? 'outgoing' : 'incoming',
    message_type: messageType,
    media_url: media?.url ?? message.media_url ?? null,
    media_base64: message.base64 ?? media?.base64 ?? null,
    media_mime_type: media?.mimetype ?? message.media_mime_type ?? null,
    file_name: media?.fileName ?? message.fileName ?? null,
    provider_message_id: key.id ?? message.id ?? message.messageId ?? null,
    is_unread: message.unread === true || message.is_unread === true,
    occurred_at: Number.isFinite(timestampMs) ? new Date(timestampMs).toISOString() : new Date().toISOString(),
    session_id: instanceName,
  };
};

const normalizeChat = (chat) => {
  const chatId = String(chat.id ?? chat.remoteJid ?? chat.chatId ?? chat.chat_id ?? '');
  if (!chatId || chatId === 'status@broadcast' || chatId.endsWith('@newsletter')) return null;
  const last = chat.lastMessage ?? chat.messages?.[0] ?? {};
  return {
    chat_id: chatId,
    phone: chatId.split('@')[0].replace(/\D/g, ''),
    name: chat.name ?? chat.pushName ?? chat.subject ?? chat.verifiedName ?? null,
    avatar_url: chat.profilePicUrl ?? chat.picture ?? chat.avatar_url ?? null,
    last_message_preview: String(chat.lastMessagePreview ?? chat.preview ?? messageContent(last) ?? '').slice(0, 100),
    is_pinned: chat.pinned === true,
    is_archived: chat.archived === true,
    unread_count: Number(chat.unreadCount ?? chat.unread_count ?? 0) || 0,
  };
};

const configureWebhook = async () => {
  if (!publicN8nUrl) return { ok: false, skipped: true, reason: 'WEBHOOK_URL_missing' };
  const url = `${publicN8nUrl}/webhook/biz-wa-hub/evolution?tenant_id=${encodeURIComponent(tenantId)}&connection_id=${encodeURIComponent(event.connection_id)}&token=${encodeURIComponent(webhookToken)}`;
  const body = {
    webhook: {
      enabled: true,
      url,
      webhook_by_events: false,
      webhook_base64: true,
      events: ['QRCODE_UPDATED', 'CONNECTION_UPDATE', 'MESSAGES_UPSERT'],
    },
    enabled: true,
    url,
    webhook_by_events: false,
    webhook_base64: true,
    events: ['QRCODE_UPDATED', 'CONNECTION_UPDATE', 'MESSAGES_UPSERT'],
  };
  return evoAny([
    { method: 'POST', path: `/webhook/set/${encodeURIComponent(instanceName)}`, body },
    { method: 'POST', path: `/webhook/${encodeURIComponent(instanceName)}`, body },
  ]);
};

const syncMessages = async () => {
  const chatsResponse = await evoAny([
    { method: 'POST', path: `/chat/findChats/${encodeURIComponent(instanceName)}`, body: { where: {} } },
    { method: 'GET', path: `/chat/findChats/${encodeURIComponent(instanceName)}` },
  ]);
  const messagesResponse = await evoAny([
    { method: 'POST', path: `/chat/findMessages/${encodeURIComponent(instanceName)}`, body: { where: {}, limit: 300 } },
    { method: 'POST', path: `/chat/findMessages/${encodeURIComponent(instanceName)}`, body: { limit: 300 } },
    { method: 'GET', path: `/chat/findMessages/${encodeURIComponent(instanceName)}` },
  ]);
  const contacts = extractArray(chatsResponse.data, ['chats', 'contacts', 'data']).map(normalizeChat).filter(Boolean);
  const messages = extractArray(messagesResponse.data, ['messages', 'records', 'data']).map(normalizeMessage).filter(Boolean);
  const cb = await callback('whatsapp.sync.batch', {
    contacts,
    messages,
    provider: 'evolution',
    session_id: instanceName,
    chats_status: chatsResponse.status,
    messages_status: messagesResponse.status,
    chats_error: chatsResponse.ok ? null : chatsResponse.data?.errors ?? chatsResponse.text,
    messages_error: messagesResponse.ok ? null : messagesResponse.data?.errors ?? messagesResponse.text,
  });
  if (!cb.ok) throw new Error(`callback_http_${cb.status}`);
  return result(202, {
    ok: true,
    accepted: true,
    event_id: eventId,
    callback_event_id: cb.event_id,
    event_type: 'whatsapp.sync.batch',
    contacts: contacts.length,
    messages: messages.length,
  });
};

try {
  let operation;
  if (event.event_type === 'whatsapp.messages.sync.request') {
    return await syncMessages();
  }
  if (event.event_type === 'whatsapp.message.send') {
    const chatId = String(event.data?.chat_id ?? '');
    const text = String(event.data?.content ?? event.data?.text ?? '');
    if (!chatId || !text) throw new Error('send_message_missing_chat_or_text');
    operation = await evo('POST', `/message/sendText/${encodeURIComponent(instanceName)}`, { number: chatId, text });
    if (!operation.ok) throw new Error(`send_text_http_${operation.status}`);
    const cb = await callback('whatsapp.message.sent', {
      provider_message_id: operation.data?.key?.id ?? operation.data?.id ?? null,
      local_message_id: event.data?.local_message_id ?? null,
      chat_id: chatId,
      content: text,
      session_id: instanceName,
    });
    if (!cb.ok) throw new Error(`callback_http_${cb.status}`);
    return result(202, { ok: true, accepted: true, event_id: eventId, callback_event_id: cb.event_id });
  }
  if (event.event_type === 'whatsapp.connection.create') {
    await callback('whatsapp.connection.creating', { session_id: instanceName, state: 'creating' });
    operation = await evo('POST', '/instance/create', { instanceName, qrcode: true, integration: 'WHATSAPP-BAILEYS' });
    if (!operation.ok && ![403, 409].includes(operation.status)) throw new Error(`create_http_${operation.status}`);
    await configureWebhook();
    operation = await evo('GET', `/instance/connect/${encodeURIComponent(instanceName)}`);
  } else if (event.event_type === 'whatsapp.connection.qr.request' || event.event_type === 'whatsapp.connection.reconnect') {
    await configureWebhook();
    operation = await evo('GET', `/instance/connect/${encodeURIComponent(instanceName)}`);
  } else if (event.event_type === 'whatsapp.connection.status.request') {
    operation = await evo('GET', `/instance/connectionState/${encodeURIComponent(instanceName)}`);
  } else if (event.event_type === 'whatsapp.connection.disconnect') {
    operation = await evo('DELETE', `/instance/logout/${encodeURIComponent(instanceName)}`);
  } else {
    operation = await evo('DELETE', `/instance/delete/${encodeURIComponent(instanceName)}`);
  }
  if (!operation.ok) throw new Error(`evolution_http_${operation.status}`);
  const qr = operation.data?.base64 ?? operation.data?.qrcode?.base64 ?? operation.data?.qrcode ?? operation.data?.code ?? null;
  const state = String(operation.data?.instance?.state ?? operation.data?.state ?? operation.data?.instance?.status ?? '').toLowerCase();
  let callbackType = 'whatsapp.connection.creating';
  if (qr) callbackType = 'whatsapp.connection.qr.generated';
  else if (state === 'open' || state === 'connected') callbackType = 'whatsapp.connection.connected';
  else if (event.event_type === 'whatsapp.connection.disconnect' || event.event_type === 'whatsapp.connection.delete') callbackType = 'whatsapp.connection.disconnected';
  const cb = await callback(callbackType, {
    qr_code: qr,
    expires_at: qr ? new Date(Date.now() + 120000).toISOString() : null,
    session_id: instanceName,
    state,
  });
  if (!cb.ok) throw new Error(`callback_http_${cb.status}`);
  return result(202, { ok: true, accepted: true, event_id: eventId, callback_event_id: cb.event_id, event_type: callbackType });
} catch (error) {
  const message = error instanceof Error ? error.message : 'unknown_error';
  try {
    await callback('whatsapp.connection.error', { message, session_id: instanceName });
  } catch {}
  return result(502, { ok: false, error: message, event_id: eventId });
}
