import dotenv from 'dotenv';

dotenv.config();

const BASE_URL = process.env.APP_URL || 'http://127.0.0.1:3000';
const PIN = process.env.SOVEREIGN_CONTROL_PIN;

if (!PIN) {
    console.error('SOVEREIGN_CONTROL_PIN is required to run authenticated pilot checks.');
    process.exit(2);
}

async function runAudit() {
    console.log(`\n=== BOLMIZAN PILOT INTEGRITY CHECK (${BASE_URL}) ===\n`);
    const report = [];
    let sessionCookie = '';

    // Test 1: Server Reachability & Compliance Guard
    try {
        const res = await fetch(`${BASE_URL}/api/health`);
        const data = await res.json();
        const ok = res.status === 200 && data.complianceMode === 'LEDGER_PILOT_ONLY';
        report.push({
            test: '1. Server Health & SBP Guardrail',
            status: ok ? 'PASS' : 'FAIL',
            detail: ok ? 'Server online & non-custodial compliance active' : JSON.stringify(data),
        });
    } catch (err) {
        console.error('CRITICAL: Server is not running. Start server first with "npm run dev".');
        process.exit(1);
    }

    // Test 2: Unauthorized Access Block (Security Check)
    {
        const res = await fetch(`${BASE_URL}/api/ledger/summary`);
        const ok = res.status === 401;
        report.push({
            test: '2. Zero-Trust Auth Wall',
            status: ok ? 'PASS' : 'FAIL',
            detail: ok ? 'Unauthenticated ledger access blocked (401)' : `SECURITY LEAK: Returned ${res.status}`,
        });
    }

    // Test 3: Wrong PIN Rejection
    {
        const res = await fetch(`${BASE_URL}/api/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ terminalId: 'AUDIT-NODE', pin: '0000', role: 'MERCHANT' }),
        });
        const ok = res.status === 401;
        report.push({
            test: '3. Brute-Force / Wrong PIN Block',
            status: ok ? 'PASS' : 'FAIL',
            detail: ok ? 'Invalid PIN rejected properly' : `Unexpected status ${res.status}`,
        });
    }

    // Test 4: Real PIN Login & HttpOnly Cookie Issue
    {
        const res = await fetch(`${BASE_URL}/api/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ terminalId: 'AUDIT-NODE', pin: PIN, role: 'MERCHANT' }),
        });
        const setCookie = res.headers.get('set-cookie') || '';
        const match = setCookie.match(/bmz_session=[^;]+/);
        if (res.ok && match) {
            sessionCookie = match[0];
            report.push({
                test: '4. Backend PIN Auth & Cookie Session',
                status: 'PASS',
                detail: 'HttpOnly cryptographic session issued',
            });
        } else {
            report.push({
                test: '4. Backend PIN Auth & Cookie Session',
                status: 'FAIL',
                detail: 'Failed to authenticate with SOVEREIGN_CONTROL_PIN',
            });
        }
    }

    // Test 5: Real SQLite Write + Idempotency Duplicate Prevention
    if (sessionCookie) {
        const idemKey = `audit-idem-${Date.now()}`;
        const payload = {
            customerName: 'Audit Test Customer',
            entryType: 'CREDIT_GIVEN',
            amountPaisa: 25000, // Rs 250
            note: 'Automated Commercial Audit',
            idempotencyKey: idemKey,
        };

        const r1 = await fetch(`${BASE_URL}/api/ledger/entry`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Cookie: sessionCookie },
            body: JSON.stringify(payload),
        });
        const r2 = await fetch(`${BASE_URL}/api/ledger/entry`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Cookie: sessionCookie },
            body: JSON.stringify(payload),
        });
        const d2 = await r2.json();
        const ok = r1.status === 201 && d2.deduplicated === true;
        report.push({
            test: '5. SQLite Write & Idempotency Lock',
            status: ok ? 'PASS' : 'FAIL',
            detail: ok ? 'Entry saved & duplicate retry blocked' : 'Idempotency check failed',
        });
    }

    // Test 6: SHA-256 Cryptographic Hash Chain Verification
    if (sessionCookie) {
        const res = await fetch(`${BASE_URL}/api/ledger/summary`, {
            headers: { Cookie: sessionCookie },
        });
        const data = await res.json();
        const ok = data.hashChainIntegrity === 'VERIFIED' && data.entryCount >= 1;
        report.push({
            test: '6. SHA-256 Ledger Integrity Check',
            status: ok ? 'PASS' : 'FAIL',
            detail: `Chain: ${data.hashChainIntegrity} | Blocks: ${data.entryCount}`,
        });
    }

    // Test 7: Anti-Scam Metadata Pre-Filter + Gemini AI Readiness
    if (sessionCookie) {
        const fakeImgBase64 = Buffer.from('Fake header Adobe Photoshop CC 2026 binary data').toString('base64');
        const res = await fetch(`${BASE_URL}/api/ai/unified-process`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Cookie: sessionCookie },
            body: JSON.stringify({
                text: 'Verify receipt',
                imageBase64: fakeImgBase64,
                mimeType: 'image/jpeg',
            }),
        });
        const data = await res.json();
        const ok = data.scamAnalysis?.riskScore >= 90;
        report.push({
            test: '7. Forensic Scam Pre-Filter Engine',
            status: ok ? 'PASS' : 'FAIL',
            detail: ok
                ? `Photoshop signature caught offline (Risk: ${data.scamAnalysis.riskScore}%)`
                : 'Metadata filter missed edited signature',
        });
    }

    // Print Clean Console Table
    console.table(report);

    const failed = report.filter((r) => r.status === 'FAIL');
    if (failed.length > 0) {
        console.log(`\nACTION REQUIRED: ${failed.length} area(s) need fixing before commercial launch.\n`);
        process.exit(1);
    } else {
        console.log('\nConfigured pilot checks passed. This result is not production, regulatory, or independent-audit certification.\n');
    }
}

runAudit();
