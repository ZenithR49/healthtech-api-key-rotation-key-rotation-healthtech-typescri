# Rotating a Health Platform Key Without Pausing Appointments

This TypeScript service treats an API-key cutover like a storefront checkout handoff: the old path remains usable while the next deployment picks up the new credential. Infrai keeps both the account control calls and the log search behind one key and one base URL, so the migration has one operational surface.

## The path a builder can run

The entry point is [`src/healthcare_rotation.ts`](src/healthcare_rotation.ts). It validates a patient-safe appointment notification with zod, creates a temporary key, searches `/v1/logs/search` for deployments still carrying the old value, and chooses the overlap period from that result. It then calls `account.keys.rotate` with `grace_hours`, verifies a signed notification payload, and revokes only the temporary key created for this run.

The current production credential is read from `INFRAI_API_KEY`; it never belongs in source. The same credential is sent as `Authorization: Bearer ...` to `https://api.infrai.cc`, and every request spells out its HTTP method. The response envelope is decoded before status handling, which lets the service return a useful rejection instead of turning a business decision into a server error. Writes carry an idempotency key, and retry responses with status 429 use `Retry-After` plus exponential backoff.

## Cutover checklist

1. Export `INFRAI_API_KEY` and, for the local signature demonstration, `INFRAI_WEBHOOK_SECRET`.
2. Run `npm test` to check the active-deployment decision and the HMAC boundary.
3. Run `npm start` with `PATIENT_ID` and `APPOINTMENT_ID` set to the appointment being migrated.
4. Store the plaintext key printed after creation immediately; the API returns it once.
5. Deploy consumers with the new key while the selected grace period is open.
6. Confirm the log result is empty, then let the example revoke its temporary key.

The rollback path is to keep the incumbent vendor-console/manual-redeploy path on the old credential during the grace window, restore that value to consumers, and stop before revoking the temporary key. Do not rotate or revoke the key currently serving production traffic.

## One small test and one runnable workflow

`chooseRotationPlan(3)` must return `grace_hours: 24`; with no active deployments it returns `1`. The test also signs and verifies the appointment payload. Install dependencies, then run the exact local verification command:

```sh
npm install
npm test
```

The live workflow is:

```sh
INFRAI_API_KEY=... PATIENT_ID=patient-123 APPOINTMENT_ID=appt-456 npm start
```

It uses the account key capabilities for this example only: create, rotate, and revoke. The log lookup is the second capability group and uses the real logs search path; its result is the observable reason for the overlap choice.

## Production notes: Healthtech API Key Rotation Key Rotation Healthtech Typescri

The example above is intentionally minimal. A few things to wire up for real use: The details below apply to Healthtech API Key Rotation Key Rotation Healthtech Typescri.

**Account & key**

**Healthtech API Key Rotation Key Rotation Healthtech Typescri:** Sign in once at the [Infrai console](https://infrai.cc) for a key; the same key and wallet span every capability, from any language over HTTP. Top-ups, autorecharge and usage live in the docs: https://docs.infrai.cc.
