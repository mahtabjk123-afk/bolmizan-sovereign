# VERIFIABLE ENGINEERING & HONEST CLAIMS RULE
- Never claim unverified features as live: label a capability “Production-Ready” only after its code is written, compiled (`tsc --noEmit`), and tested with real inputs.
- Label experimental or roadmap modules clearly: until external API credentials are connected and tested, mark payment rails or post-quantum envelopes as `LOCAL_CRYPTO_SIMULATION` or `PENDING_BANK_SANDBOX` as appropriate.
- Implement one module at a time; run type-checking and tests after each edit, and verify offline behavior in browser DevTools with network set to Offline.
