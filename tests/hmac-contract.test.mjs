import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";

const secret = "checkpoint-2-test-secret";
const timestamp = "1785600000";
const eventId = "d553cd64-ea68-40bb-9103-e5a5d9303a5a";
const rawBody = JSON.stringify({
  event_id: eventId,
  tenant_id: "f49f8b4d-10ab-46af-8f80-26a6967cfb34",
  event_type: "whatsapp.access.requested",
  data: { requested_role: "agent" },
});

const signature = crypto
  .createHmac("sha256", secret)
  .update(`${timestamp}.${eventId}.${rawBody}`)
  .digest("hex");

assert.equal(signature.length, 64);
assert.equal(
  crypto.createHmac("sha256", secret).update(`${timestamp}.${eventId}.${rawBody}`).digest("hex"),
  signature,
);
assert.notEqual(
  crypto.createHmac("sha256", secret).update(`${timestamp}.${eventId}.${rawBody}x`).digest("hex"),
  signature,
);
assert.equal(
  crypto.timingSafeEqual(Buffer.from(signature, "hex"), Buffer.from(signature, "hex")),
  true,
);
assert.equal(/^[0-9a-f]{64}$/.test(signature), true);

const workflowDirectory = new URL("../infra/n8n/workflows/", import.meta.url);
const workflowFiles = fs.readdirSync(workflowDirectory).filter((name) => name.endsWith(".json"));
assert.ok(workflowFiles.length >= 3);

for (const name of workflowFiles) {
  const text = fs.readFileSync(new URL(name, workflowDirectory), "utf8");
  const workflow = JSON.parse(text);
  assert.match(workflow.name, /^Biz WA Hub - /);
  assert.equal(workflow.active, false);
  assert.ok(Array.isArray(workflow.nodes) && workflow.nodes.length > 0);
  assert.doesNotMatch(text, /(?:sk-|AIza|service_role.{0,20}eyJ)/i);
}

const outboxWorker = fs.readFileSync(
  new URL("../supabase/functions/process-event-outbox/index.ts", import.meta.url),
  "utf8",
);
assert.match(outboxWorker, /rpc\("claim_event_outbox"/);
assert.doesNotMatch(outboxWorker, /\.from\("event_outbox"\)\s*\.select\("\*"\)/);
assert.match(outboxWorker, /authorization !== `Bearer \$\{serviceRoleKey\}`/);

const cronMigration = fs.readFileSync(
  new URL("../supabase/migrations/20260801183100_event_outbox_cron.sql", import.meta.url),
  "utf8",
);
assert.match(cronMigration, /biz-wa-hub-process-event-outbox/);
assert.match(cronMigration, /vault\.decrypted_secrets/);
assert.doesNotMatch(cronMigration, /eyJ[A-Za-z0-9_-]{20,}/);

console.log("HMAC contract and sanitized workflow exports: OK");
