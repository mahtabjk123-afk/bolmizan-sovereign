// tests/fullSystemIntegration.test.ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { pkrToPaisa, validateDoubleEntryJournal, calculateMerchantTrustScore } from '../server/fintechStandards';
import { normalizeMultilingualText, sanitizePII, LamportClock, checkAndRegisterIdempotency } from '../server/enterpriseHardening';

test('FinTech Integer Paisa & Double-Entry Journal Invariant', () => {
    const paisa = pkrToPaisa(150.75);
    assert.equal(paisa, 15075);

    const journal = validateDoubleEntryJournal([
        { accountId: 'CASH_DRAWER', direction: 'DEBIT', amountPaisa: paisa },
        { accountId: 'SALES_REVENUE', direction: 'CREDIT', amountPaisa: paisa },
    ]);
    assert.equal(journal.isBalanced, true);
    assert.equal(journal.imbalancePaisa, 0);
    assert.ok(journal.e2eReferenceId.startsWith('BMZ-PKR-'));
});

test('Merchant Trust Score drops to 300 on Tamper Violation', () => {
    const cleanScore = calculateMerchantTrustScore({
        verifiedDaysActive: 90,
        totalEntriesCount: 250,
        repaymentRatio: 0.95,
        tamperViolations: 0,
    });
    assert.ok(cleanScore.score >= 750);
    assert.equal(cleanScore.tier, 'PRIME');

    const tamperedScore = calculateMerchantTrustScore({
        verifiedDaysActive: 90,
        totalEntriesCount: 250,
        repaymentRatio: 0.95,
        tamperViolations: 1,
    });
    assert.equal(tamperedScore.score, 300);
    assert.equal(tamperedScore.tier, 'HIGH_RISK');
});

test('Enterprise Hardening: PII Masking, Unicode NFC & Idempotency', () => {
    const masked = sanitizePII('Customer Ali 0300-1234567 CNIC 42101-1234567-1');
    assert.equal(masked.includes('1234567'), false);

    const norm = normalizeMultilingualText('  سکرنڊ   منڊي  ');
    assert.equal(norm, 'سکرنڊ منڊي');

    const clock = new LamportClock(5);
    assert.equal(clock.sync(10), 11);

    assert.equal(checkAndRegisterIdempotency('TXN-UNIQUE-99'), true);
    assert.equal(checkAndRegisterIdempotency('TXN-UNIQUE-99'), false);
});
