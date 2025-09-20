# ADR 0002 — NMI as first card gateway
- **Status:** Accepted (2025-09-02)
- **Context:** BYO merchant card processing via NMI; want hosted-fields tokenization + gateway routing.
- **Decision:** Implement NMI adapter with simulation flag; store per-merchant NMI security_key via connect endpoint.
- **Consequences:** Fast local testing; easy flip to live; PCI scope minimized via Collect.js.
- **Alternatives:** Authorize.Net first (kept for Phase 2).
