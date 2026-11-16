<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://ai.google.dev/static/site-assets/images/share-ais-513315318.png" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/3749c5c2-4dd6-4336-afd2-1490df2d3a5c

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Set the `GEMINI_API_KEY` in [.env.local](.env.local) to your Gemini API key
3. Run the app:
   `npm run dev`

## Commercial readiness and payment boundaries

This repository is an early merchant-ledger and anti-scam application, not a licensed bank, EMI, payment service provider, lending platform, or investment adviser. The tenant ledger is stored in a local SQLite WAL database at `data/tenants.sqlite` (override with `BOLMIZAN_TENANT_DB_FILE`). Back up and protect this file; SQLite on one host is not a multi-region or multi-writer financial ledger.

Production merchant enrollment is intentionally disabled until phone ownership verification is integrated. Existing accounts can authenticate with their PIN; the PIN is stored as a salted scrypt hash. A generated Raast QR is returned only when a registered merchant Raast identifier is configured. QR generation does not initiate, confirm, or settle a payment. The JazzCash endpoint only verifies a return signature and deliberately does not accept a payment as settled; reconciliation, replay protection, idempotency, and provider sandbox/live certification are still required.

## Required before any public fintech claim

This project is not yet a public fintech product, licensed wallet, bank, or regulated payment operator. Before any public launch, live customer funds exposure, or commercial sale, the following must be completed and independently verified:

- Real KYC / OTP / identity verification for merchant enrollment.
- Real payment provider integration and testing in a live sandbox, then production certification.
- Bank or wallet licensing review and legal compliance approval for any funds movement, settlement, or wallet features.
- Live merchant onboarding approval flow with operations approval and approver records.
- Daily encrypted database backups with restore testing and monitoring alerts.
- Production audit logs, incident response process, and security review workflow.
- Internal fraud and compliance process for merchant review, dispute management, and escalation.
- Verified domain, SSL, and production secrets in the actual hosting account.
- Clear public product messaging that excludes public fintech claims, real-money movement claims, unverified merchant onboarding, and licensed financial service branding.

This project remains a secure pilot-grade merchant ledger and anti-scam operating system, not a public consumer fintech platform. It may be used for controlled field pilots only while the above operational and regulatory requirements are being completed.

Do not advertise authentication, payment rails, Shariah/legal compliance, AI fraud accuracy, solvency proofs, or certification as independently audited or production-ready without the applicable provider integration, legal review, security assessment, and evidence from a real deployment. Before handling customer funds or production-scale personal data, complete regulatory/licensing review, phone verification, durable/distributed rate limiting, backup/restore drills, monitoring, incident response, and an independent security audit.
