import assert from "node:assert/strict";
import { chooseRotationPlan, verifyWebhookSignature } from "./healthcare_rotation.ts";
import { createHmac } from "node:crypto";

assert.deepEqual(chooseRotationPlan(3), { grace_hours: 24, reason: "keep the checkout-like handoff open for active deployments" });
const payload = "appointment-safe-notification";
const signature = createHmac("sha256", "test-secret").update(payload).digest("hex");
assert.equal(verifyWebhookSignature(payload, signature, "test-secret"), true);
console.log("rotation decision and webhook boundary pass");
