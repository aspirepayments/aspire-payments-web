# Runbook — Webhooks

## Goals
- Verify signatures (Auth.Net signature key; NMI HMAC; Plaid headers when enabled)
- Deduplicate events (unique provider+externalId)
- Project events to payment states

## Steps (dev)
1. Expose local server via `ngrok http 3000`.
2. Configure provider to call `https://<ngrok>/v1/webhooks/...`.
3. Tail logs; expect 202 responses.
4. Check DB table `WebhookEvent` to confirm ingestion.

## 2025-09-02 – Backend MVP smoke test
- Health: GET /health → {"ok":true}
- Create ACH (stub): POST /v1/payments (Idempotency-Key: demo-4)
- Get + Refund: /v1/payments/{id}, /v1/payments/{id}/refunds
- Idempotency replay returns same response for same key
- Simulated Plaid webhook accepted (202)

## 2025-09-02 – NMI Gateway (sim) smoke test
- Connected NMI creds: POST /v1/merchants/:id/gateways/nmi/connect -> {"ok":true}
- NMI_SIMULATE=true in .env
- Card payment (NMI): POST /v1/payments (provider_pref=nmi, token=tok_stub) -> status=captured
- Next: flip NMI_SIMULATE=false after storing a real security_key

## 2025-09-02 – NMI Gateway (sim) smoke test
- Connected NMI creds: POST /v1/merchants/:id/gateways/nmi/connect -> {"ok":true}
- NMI_SIMULATE=true in .env
- Card payment (NMI): POST /v1/payments (provider_pref=nmi, token=tok_stub) -> status=captured
- Next: flip NMI_SIMULATE=false after storing a real security_key
