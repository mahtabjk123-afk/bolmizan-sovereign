import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { after, describe, it } from 'node:test';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { MukasaEdge } from '../src/types/sovereign.ts';
import { parseExplicitPkrAmount, sha256Hex } from '../src/utils/receiptIntegrity.ts';
import { getSovereignCopy, SOVEREIGN_COPY, type SupportedSovereignLanguage } from '../src/utils/i18nSovereign.ts';
import { shouldRegisterServiceWorker } from '../src/utils/serviceWorker.ts';
import {
    createTenantSessionToken,
    isSameOriginRequest,
    readTenantSessionCookie,
    isSovereignMutationDisabledInProduction,
    parseTrustedProxyHops,
    sanitizeSovereignStateForProduction,
    serializeTenantSessionCookie,
    validateSessionSecret,
    verifyTenantSessionToken,
} from '../server/tenantSession.ts';
import { computeLedgerBlockHash, type LedgerBlockHashInput } from '../server/ledgerIntegrity.ts';
import { createProductionDatabase } from '../server/realDatabase.ts';

const isolatedDataRoot = mkdtempSync(path.join(tmpdir(), 'bolmizan-sovereign-tests-'));
const originalLedgerPath = process.env.BOLMIZAN_SOVEREIGN_LEDGER_FILE;
const originalSeedDemoData = process.env.SEED_DEMO_DATA;
let engine: typeof import('../server/sovereignEngine.ts');

try {
    process.env.BOLMIZAN_SOVEREIGN_LEDGER_FILE = path.join(isolatedDataRoot, 'sovereign-ledger.json');
    delete process.env.SEED_DEMO_DATA;
    engine = await import('../server/sovereignEngine.ts');
} finally {
    if (originalLedgerPath === undefined) {
        delete process.env.BOLMIZAN_SOVEREIGN_LEDGER_FILE;
    } else {
        process.env.BOLMIZAN_SOVEREIGN_LEDGER_FILE = originalLedgerPath;
    }
    if (originalSeedDemoData === undefined) {
        delete process.env.SEED_DEMO_DATA;
    } else {
        process.env.SEED_DEMO_DATA = originalSeedDemoData;
    }
}

after(() => {
    rmSync(isolatedDataRoot, { recursive: true, force: true });
});

describe('sovereign core invariants', () => {
    it('signs tenant sessions, rejects tampering/expiry, and requires strong production secrets', () => {
        const secret = 'a'.repeat(64);
        const issuedAt = 1_800_000_000_000;
        const tenantId = 'tn_0123456789abcdef0123456789abcdef';
        const token = createTenantSessionToken(tenantId, secret, issuedAt);
        assert.equal(verifyTenantSessionToken(token, secret, issuedAt)?.tenantId, tenantId);
        assert.equal(verifyTenantSessionToken(`${token.slice(0, -1)}x`, secret, issuedAt), null);
        assert.equal(verifyTenantSessionToken(token, secret, issuedAt + 8 * 60 * 60 * 1000), null);
        assert.throws(() => validateSessionSecret('weak', true), /at least 32 characters/);
        assert.equal(validateSessionSecret(secret, true), secret);
    });

    it('uses HttpOnly, SameSite=Strict, Secure production cookies and enforces same-origin writes', () => {
        const cookie = serializeTenantSessionCookie('signed-value', true);
        assert.match(cookie, /HttpOnly/);
        assert.match(cookie, /SameSite=Strict/);
        assert.match(cookie, /Secure/);
        assert.equal(readTenantSessionCookie(`other=x; ${cookie}`), 'signed-value');
        assert.equal(isSameOriginRequest('https://shop.example', 'shop.example', true), true);
        assert.equal(isSameOriginRequest('https://attacker.example', 'shop.example', true), false);
        assert.equal(isSameOriginRequest('http://localhost:3000', 'localhost:3000', true), false);
        assert.equal(isSameOriginRequest('http://localhost:3000', 'localhost:3000', false), true);
    });

    it('trusts proxy IP headers only with an explicit valid hop count', () => {
        assert.equal(parseTrustedProxyHops(undefined), false);
        assert.equal(parseTrustedProxyHops(''), false);
        assert.equal(parseTrustedProxyHops('1'), 1);
        assert.equal(parseTrustedProxyHops('0'), 0);
        assert.equal(parseTrustedProxyHops('-1'), false);
        assert.equal(parseTrustedProxyHops('1.5'), false);
        assert.equal(parseTrustedProxyHops('not-a-number'), false);
    });

    it('does not present a client-side hardcoded PIN as authentication', () => {
        const appPath = fileURLToPath(new URL('../src/App.tsx', import.meta.url));
        const passportPath = fileURLToPath(new URL('../src/components/JudgePassportModal.tsx', import.meta.url));
        const ledgerPath = fileURLToPath(new URL('../src/components/VeritasLedger.tsx', import.meta.url));
        const appSource = readFileSync(appPath, 'utf8');
        const passportSource = readFileSync(passportPath, 'utf8');
        const ledgerSource = readFileSync(ledgerPath, 'utf8');
        assert.doesNotMatch(appSource, /AjrakSovereignGate|vaultLocked/);
        assert.doesNotMatch(passportSource, /Default Sovereign PIN|7860/);
        assert.doesNotMatch(ledgerSource, /Sovereign PIN \(7860\)/);
    });

    it('fails closed for shared sovereign writes in production until roles are implemented', () => {
        assert.equal(isSovereignMutationDisabledInProduction('POST', '/deals', true), true);
        assert.equal(isSovereignMutationDisabledInProduction('POST', '/mukasa/clear', true), true);
        assert.equal(isSovereignMutationDisabledInProduction('POST', '/kill-switch', true), true);
        assert.equal(isSovereignMutationDisabledInProduction('POST', '/reset', true), true);
        assert.equal(isSovereignMutationDisabledInProduction('GET', '/state', true), false);
        assert.equal(isSovereignMutationDisabledInProduction('POST', '/deals', false), false);
    });

    it('persists tenant auth and ledger data in SQLite WAL, verifies salted PINs, and detects tampering', () => {
        const dbPath = path.join(isolatedDataRoot, 'tenant-auth.sqlite');
        const db = createProductionDatabase(dbPath);
        const registration = db.registerOrLoginShop({
            phone: '03001234567',
            pin: '5831',
            businessName: 'Test Merchant',
        });
        assert.equal(registration.ok, true);
        if (!registration.ok) return;
        assert.match(registration.tenant.id, /^tn_[a-f0-9]{32}$/);
        assert.equal(registration.tenant.raastIban, '', 'must not fabricate a payment identifier');
        assert.equal(db.registerOrLoginShop({ phone: '923001234567', pin: '0000' }).ok, false);
        assert.equal(db.registerOrLoginShop({ phone: '+92 300 1234567', pin: '5831' }).ok, true);

        const appendInput = {
            tenantId: registration.tenant.id,
            idempotencyKey: 'merchant-entry-0001',
            partyName: 'Ali',
            partyPhone: '03005551234',
            entryType: 'udhaar_given',
            amountPkr: 1200,
            itemsSummary: 'Rice',
        } as const;
        const firstAppend = db.appendTenantBlock(appendInput);
        const block = firstAppend.block;
        assert.equal(firstAppend.replayed, false);
        assert.equal(block.previous_hash, 'GENESIS');
        const replay = db.appendTenantBlock(appendInput);
        assert.equal(replay.replayed, true);
        assert.equal(replay.block.block_index, block.block_index);
        assert.throws(
            () => db.appendTenantBlock({ ...appendInput, amountPkr: 1201 }),
            /idempotency key was already used/i,
        );
        const secondBlock = db.appendTenantBlock({
            ...appendInput,
            idempotencyKey: 'merchant-entry-0002',
            entryType: 'payment_received',
            amountPkr: 500,
        }).block;
        assert.equal(secondBlock.block_index, 2);
        assert.equal(db.verifyTenantChain(registration.tenant.id).valid, true);
        assert.equal(db.verifyTenantChain('tn_ffffffffffffffffffffffffffffffff').blockCount, 0);
        const reconciliation = db.previewTenantStatementReconciliation(registration.tenant.id, [
            { reference: 'BLK-1', amountPkr: 1200, currency: 'PKR' },
            { reference: 'BLK-2', amountPkr: 450, currency: 'PKR' },
            { reference: 'BLK-999', amountPkr: 100, currency: 'PKR' },
            { reference: 'BLK-1', amountPkr: 1200, currency: 'PKR' },
        ]);
        assert.equal(reconciliation.statementAuthenticated, false);
        assert.equal(reconciliation.settlementConfirmed, false);
        assert.equal(reconciliation.matchedRows, 1);
        assert.equal(reconciliation.exceptionRows, 3);
        assert.equal(reconciliation.unmatchedLocalBlocks, 1);
        db.close();

        const reopened = createProductionDatabase(dbPath);
        assert.equal(reopened.getTenantLedger(registration.tenant.id).length, 2);
        assert.equal(reopened.appendTenantBlock(appendInput).replayed, true, 'idempotency survives process restarts');
        assert.equal(reopened.verifyTenantChain(registration.tenant.id).valid, true);
        reopened.close();

        const tamper = new DatabaseSync(dbPath);
        assert.throws(
            () => tamper.prepare('UPDATE ledger_blocks SET amount_pkr = 1201 WHERE tenant_id = ? AND block_index = 1').run(registration.tenant.id),
            /append-only/,
        );
        tamper.exec('DROP TRIGGER ledger_blocks_no_update;');
        tamper.prepare('UPDATE ledger_blocks SET amount_pkr = 1201 WHERE tenant_id = ? AND block_index = 1').run(registration.tenant.id);
        tamper.close();
        const verifier = createProductionDatabase(dbPath);
        assert.equal(verifier.verifyTenantChain(registration.tenant.id).valid, false);
        verifier.close();
    });

    it('rejects invalid tenant PIN formats and disables unverified production enrollment', () => {
        const db = createProductionDatabase(':memory:');
        assert.equal(db.registerOrLoginShop({ phone: '03001234567', pin: '123' }).ok, false);
        assert.equal(db.registerOrLoginShop({ phone: '03001234567', pin: '1234567' }).ok, false);
        const blocked = db.registerOrLoginShop({ phone: '03001234567', pin: '1234' }, false);
        assert.equal(blocked.ok, false);
        if (!blocked.ok) assert.match(blocked.error, /Invalid mobile number or PIN/);
        db.close();
    });

    it('does not expose shared deals, worker details, debt, or balances from the production state endpoint', () => {
        const sourceState = structuredClone(engine.sovereignStore.getState());
        sourceState.deals = [{ id: 'private-deal' } as (typeof sourceState.deals)[number]];
        sourceState.mukasaEdges = [{ from: 'private-A', to: 'private-B' } as (typeof sourceState.mukasaEdges)[number]];
        sourceState.wages = [{ workerName: 'Private Worker', raastId: 'private-account' } as (typeof sourceState.wages)[number]];
        sourceState.maalGuard = [{ item: 'Private Inventory' } as (typeof sourceState.maalGuard)[number]];
        sourceState.recentIntentSeals = [{ alertEnglish: 'Private alert' } as (typeof sourceState.recentIntentSeals)[number]];
        sourceState.totals.activeDealsPkr = 123_456;
        sourceState.totals.wagesPaidPkr = 54_321;

        const publicState = sanitizeSovereignStateForProduction(sourceState);
        assert.deepEqual(publicState.deals, []);
        assert.deepEqual(publicState.mukasaEdges, []);
        assert.deepEqual(publicState.wages, []);
        assert.deepEqual(publicState.maalGuard, []);
        assert.deepEqual(publicState.recentIntentSeals, []);
        assert.equal(publicState.totals.activeDealsPkr, 0);
        assert.equal(publicState.totals.wagesPaidPkr, 0);
        assert.equal(sourceState.deals.length, 1, 'sanitizing the API response must not mutate source state');
    });

    it('binds every financially meaningful ledger field into the versioned block hash', () => {
        const base: LedgerBlockHashInput = {
            tenantId: 'tn_0123456789ab',
            blockIndex: 0,
            previousHash: '0'.repeat(64),
            partyName: 'Ali',
            partyPhone: '03001234567',
            entryType: 'udhaar_given',
            amountPkr: 1200,
            itemsSummary: 'Rice',
            status: 'open',
            createdAt: '2026-11-15T00:00:00.000Z',
        };
        const hash = computeLedgerBlockHash(base);
        assert.match(hash, /^v2:[a-f0-9]{64}$/);
        for (const change of [
            { partyPhone: '03009999999' },
            { entryType: 'payment_received' as const },
            { itemsSummary: 'Wheat' },
            { amountPkr: 1201 },
            { status: 'closed' },
        ]) {
            assert.notEqual(computeLedgerBlockHash({ ...base, ...change }), hash);
        }
    });

    it('provides complete UTF-8 copy and correct text direction for all supported languages', () => {
        const languages: SupportedSovereignLanguage[] = ['en', 'ur', 'sd', 'ar'];
        const expectedKeys = Object.keys(SOVEREIGN_COPY.en).sort();
        for (const language of languages) {
            const copy = getSovereignCopy(language);
            assert.deepEqual(Object.keys(copy).sort(), expectedKeys);
            assert.equal(copy.direction, language === 'en' ? 'ltr' : 'rtl');
            assert.ok(copy.languageName.length > 0);
            assert.ok(copy.scamScannerPlaceholder.length > 0);
        }
    });

    it('registers the offline app shell only for secure production contexts with service-worker support', () => {
        assert.equal(shouldRegisterServiceWorker({ production: false, secureContext: true, supported: true }), false);
        assert.equal(shouldRegisterServiceWorker({ production: true, secureContext: false, supported: true }), false);
        assert.equal(shouldRegisterServiceWorker({ production: true, secureContext: true, supported: false }), false);
        assert.equal(shouldRegisterServiceWorker({ production: true, secureContext: true, supported: true }), true);
    });

    it('keeps API and cross-origin requests outside the service-worker cache policy', () => {
        const workerPath = fileURLToPath(new URL('../public/sw.js', import.meta.url));
        const workerSource = readFileSync(workerPath, 'utf8');
        assert.match(workerSource, /request\.method !== 'GET'/);
        assert.match(workerSource, /url\.origin !== self\.location\.origin/);
        assert.match(workerSource, /API_PATH\.test\(url\.pathname\)/);
        assert.match(workerSource, /request\.headers\.has\('authorization'\)/);
    });

    it('parses only explicit PKR/currency amounts instead of guessing from quantities', () => {
        assert.equal(parseExplicitPkrAmount('Rice, 80 kg, price PKR 18,500'), 18_500);
        assert.equal(parseExplicitPkrAmount('Rs. 700 received'), 700);
        assert.equal(parseExplicitPkrAmount('روپے ۴۵٬۰۰۰ وصول ہوئے'), 45_000);
        assert.equal(parseExplicitPkrAmount('85 bags of rice'), null);
        assert.equal(parseExplicitPkrAmount('Rs. 12.50'), null);
    });

    it('creates a standard SHA-256 digest for receipt content', async () => {
        assert.equal(
            await sha256Hex('abc'),
            'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
        );
    });

    it('starts fresh without demo data at zero balances unless demo seeding is explicitly enabled', async () => {
        const cleanState = engine.sovereignStore.getState();
        assert.equal(cleanState.deals.length, 0);
        assert.equal(cleanState.mukasaEdges.length, 0);
        assert.equal(cleanState.wages.length, 0);
        assert.equal(cleanState.maalGuard.length, 0);
        assert.equal(cleanState.totals.activeDealsPkr, 0);
        assert.equal(cleanState.totals.mukasaClearedTotalPkr, 0);
        assert.equal(cleanState.totals.wagesPaidPkr, 0);
        assert.equal(cleanState.totals.sadaqahReservePkr, 0);

        const demoLedgerPath = path.join(isolatedDataRoot, 'demo-sovereign-ledger.json');
        const previousLedgerPath = process.env.BOLMIZAN_SOVEREIGN_LEDGER_FILE;
        const previousSeedFlag = process.env.SEED_DEMO_DATA;
        let demoEngine: typeof engine;
        try {
            process.env.BOLMIZAN_SOVEREIGN_LEDGER_FILE = demoLedgerPath;
            process.env.SEED_DEMO_DATA = 'true';
            demoEngine = await import(new URL('../server/sovereignEngine.ts?demo-seed-test', import.meta.url).href);
        } finally {
            if (previousLedgerPath === undefined) {
                delete process.env.BOLMIZAN_SOVEREIGN_LEDGER_FILE;
            } else {
                process.env.BOLMIZAN_SOVEREIGN_LEDGER_FILE = previousLedgerPath;
            }
            if (previousSeedFlag === undefined) {
                delete process.env.SEED_DEMO_DATA;
            } else {
                process.env.SEED_DEMO_DATA = previousSeedFlag;
            }
        }

        const demoState = demoEngine.sovereignStore.getState();
        assert.ok(demoState.deals.length > 0);
        assert.ok(demoState.mukasaEdges.length > 0);
        assert.ok(demoState.wages.length > 0);
        assert.ok(demoState.totals.activeDealsPkr > 0);
    });

    it('does not mutate persisted state without an explicit action or run background server tickers', async () => {
        const ledgerPath = path.join(isolatedDataRoot, 'sovereign-ledger.json');
        const serverPath = fileURLToPath(new URL('../server.ts', import.meta.url));
        const initialState = JSON.stringify(engine.sovereignStore.getState());
        const initialLedger = readFileSync(ledgerPath, 'utf8');
        const serverSource = readFileSync(serverPath, 'utf8');

        assert.doesNotMatch(serverSource, /\bsetInterval\s*\(/, 'server.ts must not register simulated recurring tickers');
        await new Promise((resolve) => setTimeout(resolve, 100));

        assert.equal(JSON.stringify(engine.sovereignStore.getState()), initialState);
        assert.equal(readFileSync(ledgerPath, 'utf8'), initialLedger);
    });

    it('accepts a positive, interest-free invoice and blocks interest, Riba, sood, and late penalties', () => {
        const valid = engine.runTruthFilter({
            content: 'Basmati rice sale, payment due on delivery.',
            documentType: 'digital-invoice',
            lineItems: [{ label: 'Basmati rice', qty: 2, unitPrice: 5_000 }],
            claimedTotal: 10_000,
        });

        assert.equal(valid.verdict, 'VERIFIED');
        assert.equal(valid.ribaDetected, false);
        assert.ok(valid.mathCheck.computedTotal > 0);
        assert.equal(valid.mathCheck.valid, true);

        for (const term of ['interest', 'Riba', 'sood', 'late penalty']) {
            const result = engine.runTruthFilter({
                content: `Contract includes a ${term} charge.`,
                documentType: 'whatsapp-forward',
            });
            assert.equal(result.ribaDetected, true, `${term} should be flagged`);
            assert.equal(result.verdict, 'RIBA_OR_MATH_ALERT', `${term} should be blocked`);
        }
    });

    it('nets a three-party PKR 10,000 circular debt without external cash transfers', () => {
        const edges: MukasaEdge[] = [
            { id: 'ab', from: 'A', to: 'B', amountPkr: 10_000, invoiceRef: 'AB-1', cleared: false },
            { id: 'bc', from: 'B', to: 'C', amountPkr: 10_000, invoiceRef: 'BC-1', cleared: false },
            { id: 'ca', from: 'C', to: 'A', amountPkr: 10_000, invoiceRef: 'CA-1', cleared: false },
        ];

        const report = engine.detectAndClearMukasaCycles(edges);
        const netByParty = new Map<string, number>([['A', 0], ['B', 0], ['C', 0]]);
        for (const edge of edges) {
            netByParty.set(edge.from, (netByParty.get(edge.from) ?? 0) - edge.amountPkr);
            netByParty.set(edge.to, (netByParty.get(edge.to) ?? 0) + edge.amountPkr);
        }

        assert.equal(report.cyclesDetected, 1);
        assert.deepEqual(report.clearedLoops, [{ path: ['A', 'B', 'C', 'A'], clearedAmountPkr: 10_000 }]);
        assert.equal(report.totalClearedPkr, 30_000, 'reports the gross value removed across all three ledger edges');
        assert.ok(report.remainingEdges.every((edge) => edge.cleared && edge.amountPkr === 0));
        assert.deepEqual([...netByParty.values()], [0, 0, 0]);
    });

    it('blocks clearing and wage settlement while frozen, then permits them after restore', () => {
        const store = engine.sovereignStore;
        store.resetDemoState('7860');
        store.addMukasaEdge('A', 'B', 10_000, 'AB-TEST');
        store.addMukasaEdge('B', 'C', 10_000, 'BC-TEST');
        store.addMukasaEdge('C', 'A', 10_000, 'CA-TEST');
        const wage = store.addWage('Test Worker', 'Worker', '03001234567', 5_000, 5);

        const frozen = store.toggleKillSwitch({ pin: '7860', action: 'freeze' });
        assert.equal(frozen.ok, true);
        assert.equal(frozen.state.killSwitch.active, true);
        assert.equal(frozen.state.killSwitch.agentTokensRevoked, true);
        assert.equal(frozen.state.killSwitch.activeAgentTokenCount, 0);
        assert.ok(frozen.state.killSwitch.rails.every((rail) => rail.frozen));

        const blockedClear = store.clearMukasa();
        assert.equal(blockedClear.blocked, true);
        assert.equal(blockedClear.totalClearedPkr, 0);
        assert.ok(blockedClear.remainingEdges.some((edge) => edge.from === 'A' && edge.amountPkr === 10_000));
        assert.equal(store.settleWage(wage.id).ok, false);

        const restored = store.toggleKillSwitch({ pin: '7860', action: 'restore' });
        assert.equal(restored.ok, true);
        assert.equal(restored.state.killSwitch.active, false);
        assert.equal(restored.state.killSwitch.agentTokensRevoked, false);
        assert.ok(restored.state.killSwitch.rails.every((rail) => !rail.frozen));
        const cleared = store.clearMukasa();
        assert.ok(cleared.clearedLoops.some((loop) => loop.path.join(' -> ') === 'A -> B -> C -> A'));
        assert.equal(store.settleWage(wage.id).ok, true);
    });

    it('blocks OTP/PIN bank-manager lures and seals a normal bazaar entry', () => {
        const scam = engine.verifyIntentCognitiveFirewall({
            transcript: 'HBL bank manager: your account will be blocked. Send your OTP and PIN immediately.',
        });
        assert.equal(scam.decision, 'BLOCKED_SCAM');
        assert.ok(scam.triggers.length > 0);
        assert.equal(scam.humanIntentSeal, null);

        const legitimate = engine.verifyIntentCognitiveFirewall({
            transcript: 'Sold 2 bags of basmati rice to Ali for PKR 10,000, payment due Friday.',
        });
        assert.equal(legitimate.decision, 'SEALED');
        assert.ok(legitimate.humanIntentSeal);
    });
});
