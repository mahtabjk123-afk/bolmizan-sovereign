# BolMizan — Merchant Ledger & Scam-Awareness Prototype

**A pilot-stage bookkeeping and scam-awareness application for small merchants.** The current repository is a software prototype, not a financial service or production-ready fintech platform.

---

## Overview & Problem Statement
Small-scale merchants in semi-urban and rural regions (such as interior Sindh, Pakistan) rely on handwritten paper ledgers (*kacha khata*), exposing them to:
1. **Retroactive Record Tampering & Disputes** over credit (*udhaar*) balances.
2. **Connectivity Blackouts** that break cloud-only accounting applications.
3. **Circular Debt Illiquidity** across local B2B supply chains (`Merchant A -> B -> C -> A`).
4. **Regional-Language SMS Payment Scams** targeting non-English-speaking shopkeepers.

BolMizan explores these problems through a local SQLite ledger, a deterministic message-risk heuristic, and merchant workflow screens. Impact, adoption, fraud-detection performance, and commercial viability have not been independently validated.

---

## Core Architecture

1. **SQLite Merchant Ledger (`server.ts`)**
   * The authenticated `/api/ledger/entry` and `/api/ledger/summary` routes use SQLite integer paisa in the append-only `ledger_entries` table, with idempotency keys, hash-chain checks, and database update/delete triggers.
   * An authenticated sync endpoint exists, but reliable offline-first operation and conflict recovery have not been verified across real devices and network interruptions.
2. **Graph-Based *Mukasa* Circular Debt Solver (`server/bolmizanFinalCore.ts`)**
   * Models inter-merchant credit obligations as a directed weighted graph $G = (V, E)$ and computes greedy net-balance settlements to eliminate circular debt cycles without physical cash.
3. **Multilingual Edge Anti-Scam Classifier (`server/scamClassifier.ts`)**
   * Deterministic weighted heuristic classifier supporting **Sindhi, Urdu, Roman Urdu, and English** to flag spoofed shortcodes, credential harvesting (OTP/PIN), and personal numbers masquerading as automated payment alerts.
4. **Experimental finance utilities (`server/fintechStandards.ts` & `server/enterpriseHardening.ts`)**
   * The repository contains integer-paisa and journal-validation helpers. These are not evidence of bank-grade controls, a credit score, an audit opinion, or regulatory compliance, and are not all wired into active ledger routes.

---

## Verification Status

No independent security review, regulatory approval, live-provider settlement, field study, or reproducible performance benchmark is claimed. The hash chain is an application-level tamper-evidence mechanism, not an externally anchored or independently audited immutable record. The active database stores customer names, optional phone numbers, notes, and optional voice transcripts; protect the database and backups as sensitive personal data.

## HaqProof local prototype

The HaqProof Lab is an experimental browser-only feature in `src/components/HaqProofWorkbench.tsx`. It creates an ECDSA P-256 signed JSON envelope (`.haq`), renders QR codes, verifies envelopes on-device, optionally scans QR codes with the browser's Barcode Detection API, and shows a recompression-difference image preview with a local SHA-256 digest. It persists a non-extractable device signing key, pinned public contacts, and a local duplicate/replay log in IndexedDB. It also offers a password-encrypted backup for contacts and replay history, a zero-width signed-text wrapper with a visible `[MZN:…]` fallback tag, deterministic contract keyword highlighting, and synthetic local judge scenarios. Open `/?mode=haqproof` without a merchant API session; use HTTPS or localhost for Web Crypto and camera access. Load the app once online before attempting offline access. `/?mode=haqproof&founder=true` opens a local-only device inspector; it is not an administrator console or global analytics dashboard.

Limits remain material: the identity public key is self-asserted until the user compares and pins it out-of-band; a signature proves only that the signed payload has not changed relative to that key, not who signed it or whether payment occurred. Replay detection only covers the current browser's locally stored history and can be lost with browser storage; it is not global or atomic across untrusted devices. The non-extractable device key is intentionally not included in backups and may be lost on profile/device/storage loss. Encrypted backups contain contacts/replay history, not merchant ledger records. Zero-width characters may be removed by messaging apps. Contract highlighting is a local keyword aid, not legal or religious advice. Image recompression differences are not proof of manipulation. QR camera support varies by browser. `.haq` is an experimental project format, not a published standard. No physics liveness, OCR, wallet validation, or deepfake detector is implemented.

---

## Quick Start & Verification

```bash
# 1. Install dependencies
npm install

# 2. Run the checked-in automated unit and integration tests
npx tsx --test tests/*.test.ts

# 3. Start the development server
npm run dev
```

---

## Explicit limitations and launch gates

- The application does not process money, hold funds, or connect to live banking rails. Any payment-adapter behavior is a local simulation, not settlement.
- The server uses shared PIN-based login and a client-selected terminal identifier; this is not verified merchant identity or sufficient production tenant provisioning.
- Sensitive customer fields are stored in SQLite without database-level encryption. Apply strict access controls and use synthetic data outside an approved pilot.
- Some frontend screens call API routes not implemented by the active server. Treat those screens as incomplete until each route is implemented and tested end to end.
- Before any public commercial launch: implement per-merchant identity and authorization; close route and data-integrity gaps; conduct independent security/privacy review; validate retention, consent, dispute and incident processes; complete applicable regulatory analysis; and test backup restoration and any provider integration in an authorized sandbox.

## Regulatory and product scope

BolMizan is a non-custodial software prototype. It is not a licensed bank, EMI, wallet, payment processor, credit bureau, certified fraud detector, or audited financial system. Do not use it to make real-money settlement or regulatory-compliance claims.
