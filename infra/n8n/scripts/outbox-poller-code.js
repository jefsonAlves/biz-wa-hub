const crypto = require('crypto');
const http = require('http');
const https = require('https');

const secret = $env.N8N_WEBHOOK_SECRET;
const backendUrl = ($env.SUPABASE_URL || '').replace(/\/+$/, '');
const receiverUrl = 'http://127.0.0.1:5678/webhook/biz-wa-hub/platform';
if (!secret || !backendUrl) {
  throw new Error('poller_configuration_missing');
}

const signedHeaders = (rawBody) => {
  const timestamp = String(Math.floor(Date.now() / 1000));
  const eventId = crypto.randomUUID();
  const signature = crypto.createHmac('sha256', secret)
    .update(`${timestamp}.${eventId}.${rawBody}`)
    .digest('hex');
  return {
    'Content-Type': 'application/json',
    'X-Event-Id': eventId,
    'X-Timestamp': timestamp,
    'X-Signature': signature,
  };
};

const request = (urlString, headers, rawBody) => new Promise((resolve, reject) => {
  const transport = urlString.startsWith('https://') ? https : http;
  const req = transport.request(urlString, {
    method: 'POST',
    headers: { ...headers, 'Content-Length': Buffer.byteLength(rawBody) },
  }, (response) => {
    const chunks = [];
    response.on('data', (chunk) => chunks.push(chunk));
    response.on('end', () => resolve({
      ok: (response.statusCode || 0) >= 200 && (response.statusCode || 0) < 300,
      status: response.statusCode || 0,
      text: Buffer.concat(chunks).toString('utf8'),
    }));
  });
  req.setTimeout(15000, () => req.destroy(new Error('request_timeout')));
  req.on('error', reject);
  req.write(rawBody);
  req.end();
});

const callBackend = async (payload) => {
  const rawBody = JSON.stringify(payload);
  const response = await request(
    `${backendUrl}/functions/v1/n8n-poll-events`,
    signedHeaders(rawBody),
    rawBody,
  );
  if (!response.ok) throw new Error(`poll_backend_http_${response.status}:${response.text.slice(0, 160)}`);
  return response.text ? JSON.parse(response.text) : {};
};

const claim = await callBackend({ action: 'claim', limit: 10 });
const results = [];
for (const entry of claim.events || []) {
  const event = entry.payload;
  const rawBody = JSON.stringify(event);
  const timestamp = String(Math.floor(Date.now() / 1000));
  const signature = crypto.createHmac('sha256', secret)
    .update(`${timestamp}.${event.event_id}.${rawBody}`)
    .digest('hex');
  try {
    const response = await request(receiverUrl, {
        'Content-Type': 'application/json',
        'X-Tenant-Id': event.tenant_id,
        'X-Event-Id': event.event_id,
        'X-Timestamp': timestamp,
        'X-Signature': signature,
      }, rawBody);
    results.push({
      event_id: event.event_id,
      success: response.ok,
      error: response.ok ? null : `platform_http_${response.status}:${response.text.slice(0, 200)}`,
    });
  } catch (error) {
    results.push({
      event_id: event.event_id,
      success: false,
      error: error instanceof Error ? error.message : 'platform_request_failed',
    });
  }
}

if (results.length) await callBackend({ action: 'ack', results });
return results.map((result) => ({ json: result }));
