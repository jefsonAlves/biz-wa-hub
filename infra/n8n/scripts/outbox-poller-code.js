const crypto = require('crypto');

const secret = $env.N8N_WEBHOOK_SECRET;
const backendUrl = ($env.SUPABASE_URL || '').replace(/\/+$/, '');
const receiverUrl = 'http://n8n:5678/webhook/biz-wa-hub/platform';
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

const callBackend = async (payload) => {
  const rawBody = JSON.stringify(payload);
  const response = await fetch(`${backendUrl}/functions/v1/n8n-poll-events`, {
    method: 'POST',
    headers: signedHeaders(rawBody),
    body: rawBody,
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`poll_backend_http_${response.status}:${text.slice(0, 160)}`);
  return text ? JSON.parse(text) : {};
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
    const response = await fetch(receiverUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Tenant-Id': event.tenant_id,
        'X-Event-Id': event.event_id,
        'X-Timestamp': timestamp,
        'X-Signature': signature,
      },
      body: rawBody,
    });
    const responseText = await response.text();
    results.push({
      event_id: event.event_id,
      success: response.ok,
      error: response.ok ? null : `platform_http_${response.status}:${responseText.slice(0, 200)}`,
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

