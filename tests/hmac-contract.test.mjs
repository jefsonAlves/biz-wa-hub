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

const workflowDirectory = new URL("../infra/n8n/workflows/", import.meta.url);
const workflowFiles = fs.readdirSync(workflowDirectory).filter((name) => name.endsWith(".json"));
assert.equal(workflowFiles.length, 3);

for (const name of workflowFiles) {
  const text = fs.readFileSync(new URL(name, workflowDirectory), "utf8");
  const workflow = JSON.parse(text);
  assert.match(workflow.name, /^Biz WA Hub - /);
  assert.equal(workflow.active, false);
  assert.ok(Array.isArray(workflow.nodes) && workflow.nodes.length > 0);
  assert.doesNotMatch(text, /(?:sk-|AIza|service_role.{0,20}eyJ)/i);
}

console.log("HMAC contract and sanitized workflow exports: OK");
