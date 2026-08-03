const crypto = require('crypto');
const http = require('http');
const https = require('https');

const input = $input.first().json;
const headers = Object.fromEntries(Object.entries(input.headers ?? {}).map(([key, value]) => [key.toLowerCase(), String(value)]));
const tenantId = headers['x-tenant-id'];
const connectionId = headers['x-connection-id'];
const token = headers['x-evolution-webhook-token'] ?? '';
const payload = input.body ?? {};
const instanceName = String(payload.instance ?? payload.instanceName ?? headers['x-instance-name'] ?? '');
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const result = (statusCode, response) => [{ json: { statusCode, response } }];
if (!uuid.test(tenantId ?? '') || !uuid.test(connectionId ?? '') || !instanceName || !token) return result(401, { ok: false, error: 'invalid_webhook_identity' });
const secret = $env.N8N_WEBHOOK_SECRET;
if (!secret) return result(503, { ok: false, error: 'webhook_secret_not_configured' });
const expectedToken = crypto.createHmac('sha256', secret).update(`${tenantId}.${connectionId}.${instanceName}`).digest('hex');
const expectedBytes = Buffer.from(expectedToken, 'hex');
const tokenBytes = /^[0-9a-f]{64}$/i.test(token) ? Buffer.from(token, 'hex') : Buffer.alloc(0);
if (expectedBytes.length !== tokenBytes.length || !crypto.timingSafeEqual(expectedBytes, tokenBytes)) return result(401, { ok: false, error: 'invalid_webhook_token' });

const requestJson = (method, urlString, requestHeaders = {}, body) => new Promise((resolve, reject) => {
  const bodyText = body === undefined ? null : (typeof body === 'string' ? body : JSON.stringify(body));
  const transport = urlString.startsWith('https://') ? https : http;
  const request = transport.request(urlString, { method, headers: { ...requestHeaders, ...(bodyText ? { 'Content-Length': Buffer.byteLength(bodyText) } : {}) } }, response => {
    response.resume();
    response.on('end', () => resolve({ ok: (response.statusCode ?? 0) >= 200 && (response.statusCode ?? 0) < 300, status: response.statusCode ?? 0 }));
  });
  request.setTimeout(30000, () => request.destroy(new Error('request_timeout')));
  request.on('error', reject);
  if (bodyText) request.write(bodyText);
  request.end();
});

const callback = async (eventType, data) => {
  const callbackId = crypto.randomUUID();
  const body = JSON.stringify({ event_id: callbackId, event_type: eventType, tenant_id: tenantId, connection_id: connectionId, conversation_id: null, occurred_at: new Date().toISOString(), source: 'n8n', version: 1, data });
  const timestamp = String(Math.floor(Date.now() / 1000));
  const signature = crypto.createHmac('sha256', secret).update(`${timestamp}.${callbackId}.${body}`).digest('hex');
  return requestJson('POST', $env.SUPABASE_URL.replace(/\/+$/, '') + '/functions/v1/n8n-webhook-receiver', { 'Content-Type': 'application/json', 'X-Tenant-Id': tenantId, 'X-Event-Id': callbackId, 'X-Timestamp': timestamp, 'X-Signature': signature }, body);
};

try {
  const eventName = String(payload.event ?? payload.event_type ?? '').toLowerCase().replace(/_/g, '.');
  const data = payload.data ?? {};
  if (eventName === 'messages.upsert') {
    const key = data.key ?? {};
    const remoteJid = String(key.remoteJid ?? data.remoteJid ?? '');
    if (!remoteJid || remoteJid === 'status@broadcast' || remoteJid.endsWith('@newsletter')) return result(202, { ok: true, ignored: 'unsupported_chat' });
    const message = data.message ?? {};
    const media = message.imageMessage ?? message.audioMessage ?? message.videoMessage ?? message.documentMessage ?? message.stickerMessage ?? null;
    const content = message.conversation ?? message.extendedTextMessage?.text ?? message.imageMessage?.caption ?? message.videoMessage?.caption ?? message.documentMessage?.caption ?? '';
    const messageType = message.imageMessage ? 'image' : message.audioMessage ? 'audio' : message.videoMessage ? 'video' : message.documentMessage ? 'document' : message.stickerMessage ? 'sticker' : message.locationMessage ? 'location' : 'text';
    const mediaBase64 = payload.base64 ?? data.base64 ?? media?.base64 ?? null;
    const location = message.locationMessage ? JSON.stringify({ latitude: message.locationMessage.degreesLatitude, longitude: message.locationMessage.degreesLongitude }) : null;
    const response = await callback('whatsapp.message.received', {
      chat_id: remoteJid,
      phone: remoteJid.split('@')[0].replace(/\D/g, ''),
      name: data.pushName ?? data.notifyName ?? null,
      content: location ?? String(content),
      from_me: key.fromMe === true,
      direction: key.fromMe === true ? 'outgoing' : 'incoming',
      message_type: messageType,
      media_url: mediaBase64 ? null : (media?.url ?? null),
      media_base64: mediaBase64,
      media_mime_type: media?.mimetype ?? null,
      file_name: media?.fileName ?? null,
      provider_message_id: key.id ?? data.id ?? null,
      occurred_at: data.messageTimestamp ? new Date(Number(data.messageTimestamp) * 1000).toISOString() : new Date().toISOString(),
      session_id: instanceName,
    });
    if (!response.ok) throw new Error(`callback_http_${response.status}`);
    return result(202, { ok: true, accepted: true, event_type: 'whatsapp.message.received' });
  }
  if (eventName === 'connection.update') {
    const state = String(data.state ?? data.status ?? '').toLowerCase();
    const eventType = (state === 'open' || state === 'connected') ? 'whatsapp.connection.connected' : (state === 'close' || state === 'disconnected') ? 'whatsapp.connection.disconnected' : 'whatsapp.connection.creating';
    const response = await callback(eventType, { state, session_id: instanceName, phone_number: data.wuid?.split('@')[0] ?? null });
    if (!response.ok) throw new Error(`callback_http_${response.status}`);
    return result(202, { ok: true, accepted: true, event_type: eventType });
  }
  if (eventName === 'qrcode.updated') {
    const qr = data.base64 ?? data.qrcode?.base64 ?? data.qrcode ?? data.code ?? null;
    if (!qr) return result(202, { ok: true, ignored: 'empty_qr' });
    const response = await callback('whatsapp.connection.qr.generated', { qr_code: qr, expires_at: new Date(Date.now() + 120000).toISOString(), session_id: instanceName });
    if (!response.ok) throw new Error(`callback_http_${response.status}`);
    return result(202, { ok: true, accepted: true, event_type: 'whatsapp.connection.qr.generated' });
  }
  return result(202, { ok: true, ignored: 'unsupported_event' });
} catch (error) {
  return result(502, { ok: false, error: error instanceof Error ? error.message : 'unknown_error' });
}

