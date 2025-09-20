# ADR 0001 — Idempotency on Create Payment
- **Status:** Accepted
- **Date:** 2025-09-02

## Context
Network retries and client replays can cause duplicate charges.

## Decision
We require clients to send `Idempotency-Key` on `POST /v1/payments`. We store the key and the canonical response.

## Consequences
- Safe retries for clients.
- Additional DB writes.
