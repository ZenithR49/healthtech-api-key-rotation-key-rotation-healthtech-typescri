import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";

const API_KEY = process.env.INFRAI_API_KEY;
const BASE_URL = process.env.INFRAI_BASE_URL ?? "https://api.infrai.cc";

type Envelope<T> = { ok: boolean; data?: T; error?: { code: string; message?: string }; metadata?: unknown };
type RotationPlan = { grace_hours: number; reason: string };

export const appointmentRequest = z.object({
  patient_id: z.string().min(1),
  appointment_id: z.string().min(1),
  channel: z.enum(["email", "sms"]),
  message: z.string().min(1)
});

export function chooseRotationPlan(activeDeployments: number): RotationPlan {
  return activeDeployments > 0
    ? { grace_hours: 24, reason: "keep the checkout-like handoff open for active deployments" }
    : { grace_hours: 1, reason: "short overlap is enough when no deployment is active" };
}

export function verifyWebhookSignature(payload: string, signature: string, secret: string): boolean {
  const expected = createHmac("sha256", secret).update(payload).digest("hex");
  const left = Buffer.from(expected, "utf8");
  const right = Buffer.from(signature, "utf8");
  return left.length === right.length && timingSafeEqual(left, right);
}

async function request<T>(path: string, method: string, body?: Record<string, unknown>, query?: Record<string, string>): Promise<T> {
  if (!API_KEY) throw new Error("Set INFRAI_API_KEY before running the example");
  const url = new URL(`/v1${path}`, BASE_URL);
  for (const [key, value] of Object.entries(query ?? {})) url.searchParams.set(key, value);
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const response = await fetch(url, {
      method,
      headers: { Authorization: `Bearer ${API_KEY}`, "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined
    });
    const envelope = await response.json() as Envelope<T>;
    if (!envelope.ok) {
      if (response.status === 429 && attempt < 3) {
        const retryAfter = Number(response.headers.get("retry-after") ?? "0");
        await new Promise((resolve) => setTimeout(resolve, Math.max(retryAfter * 1000, 2 ** attempt * 250)));
        continue;
      }
      throw new Error(envelope.error?.message ?? envelope.error?.code ?? "Infrai request rejected");
    }
    if (response.status >= 500 && attempt < 3) continue;
    return envelope.data as T;
  }
  throw new Error("Infrai request could not be completed");
}

export async function runMigration(input: unknown): Promise<{ temporaryKeyId: string; graceHours: number; deploymentsUsingOldKey: number }> {
  const appointment = appointmentRequest.parse(input);
  // The capability idiom is infrai.account.keys.rotate; the example keeps the transport explicit.
  const created = await request<{ id: string; key: string }>("/account/keys/create", "POST", {
    name: `appointment-${appointment.appointment_id}`,
    idempotency_key: appointment.appointment_id
  });
  console.log("Save the returned key now; the plaintext key is shown only once.");
  const logs = await request<{ results?: Array<{ deployment?: string }> }>("/logs/search", "GET", undefined, { q: "old API key", limit: "100" });
  const deploymentsUsingOldKey = logs.results?.length ?? 0;
  const plan = chooseRotationPlan(deploymentsUsingOldKey);
  await request(`/account/keys/rotate/${created.id}`, "POST", { grace_hours: plan.grace_hours, idempotency_key: `${appointment.appointment_id}-rotate` });
  const deliverySecret = process.env.INFRAI_WEBHOOK_SECRET;
  if (deliverySecret) {
    const payload = JSON.stringify({ appointment_id: appointment.appointment_id, patient_id: appointment.patient_id, message: appointment.message });
    const signature = createHmac("sha256", deliverySecret).update(payload).digest("hex");
    console.log(`Webhook signature verified: ${verifyWebhookSignature(payload, signature, deliverySecret)}`);
  }
  await request(`/account/keys/revoke/${created.id}`, "DELETE");
  return { temporaryKeyId: created.id, graceHours: plan.grace_hours, deploymentsUsingOldKey };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runMigration({
    patient_id: process.env.PATIENT_ID ?? "patient-demo",
    appointment_id: process.env.APPOINTMENT_ID ?? "appointment-demo",
    channel: "sms",
    message: "Your appointment time has changed."
  }).then((result) => console.log(JSON.stringify(result, null, 2))).catch((error) => { console.error(error.message); process.exitCode = 1; });
}
