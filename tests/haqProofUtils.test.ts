import test from 'node:test';
import assert from 'node:assert/strict';
import { createHaqDeepLink, decodeHaqText, encodeHaqText } from '../src/utils/haqStego';
import { reviewContractText } from '../src/utils/haqContractReview';
import { signProof, verifyProof, type ProofPayload } from '../src/utils/haqCrypto';

test('HaqProof text wrapper round-trips visible text and signed payload', () => {
    const visible = 'رسید: 2,500 روپے وصول ہوئے';
    const signedPayload = JSON.stringify({ protocol: 'HAQPROOF', signature: 'sample' });
    const encoded = encodeHaqText(visible, signedPayload);
    assert.ok(encoded.startsWith(visible));
    assert.equal(decodeHaqText(encoded).visibleText, visible);
    assert.equal(decodeHaqText(encoded).signedEnvelope, signedPayload);
});

test('HaqProof text decoder rejects ordinary unsigned messages', () => {
    assert.throws(() => decodeHaqText('Rs 500 received — HaqProof ✓'), /No HaqProof text signature/);
});

test('HaqProof text decoder recovers the visible fallback tag after zero-width stripping', () => {
    const signedPayload = JSON.stringify({ protocol: 'HAQPROOF', signature: 'sample' });
    const encoded = encodeHaqText('Rs 500 received', signedPayload);
    const stripped = encoded.replace(/[\u200B\u200C\u200D\uFEFF\u2063]/g, '');
    assert.equal(decodeHaqText(stripped).signedEnvelope, signedPayload);
    assert.equal(decodeHaqText(stripped).visibleText, 'Rs 500 received');
});

test('visible MZN tag survives messaging systems that strip zero-width characters', () => {
    const signedPayload = JSON.stringify({ protocol: 'HAQPROOF', signature: 'sample' });
    const encoded = encodeHaqText('Rs 2,500 received', signedPayload);
    const stripped = encoded.replace(/[\u200B\u200C\u200D\uFEFF\u2063]/g, '');
    assert.equal(decodeHaqText(stripped).signedEnvelope, signedPayload);
});

test('HaqProof deep-link fragment contains a recoverable signed envelope', () => {
    const signedPayload = JSON.stringify({ protocol: 'HAQPROOF', signature: 'sample' });
    const link = createHaqDeepLink('https://example.test/?mode=haqproof', signedPayload);
    assert.equal(decodeHaqText(link).signedEnvelope, signedPayload);
});

test('contract keyword review quotes possible rate and penalty wording', () => {
    const flags = reviewContractText('Borrower shall pay 24% annual interest. Late payment incurs a penalty fee.');
    assert.ok(flags.some((flag) => flag.category === 'INTEREST_OR_RATE'));
    assert.ok(flags.some((flag) => flag.category === 'LATE_PENALTY'));
});

test('signed proof verifies and edited amount is rejected', async () => {
    const keyPair = await crypto.subtle.generateKey(
        { name: 'ECDSA', namedCurve: 'P-256' },
        true,
        ['sign', 'verify'],
    ) as CryptoKeyPair;
    const payload: ProofPayload = {
        version: 1,
        kind: 'RECEIPT',
        title: 'Test receipt',
        details: 'Synthetic test only',
        transactionId: 'TEST-TID-1',
        amountPaisa: 50_000,
        createdAt: new Date().toISOString(),
        nonce: 'test-nonce-1',
    };
    const envelope = await signProof(payload, keyPair);
    assert.equal((await verifyProof(envelope)).valid, true);
    const modified = { ...envelope, payload: { ...payload, amountPaisa: 500_000 } };
    assert.equal((await verifyProof(modified)).valid, false);
});