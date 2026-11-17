import assert from 'node:assert/strict';
import crypto from 'crypto';
import test from 'node:test';
import {
    computeLedgerMerkleRoot,
    createLedgerBlock,
    verifyLedgerChain,
    type LedgerBlock,
} from '../server/bolmizanFinalCore.ts';

test('computeLedgerMerkleRoot returns a stable root for a valid chain', () => {
    const first = createLedgerBlock(0, 'TERMINAL-1', 'Ayesha', 5000, 'CREDIT', 'sig-a', '0'.repeat(64));
    const second = createLedgerBlock(1, 'TERMINAL-1', 'Bilal', 3000, 'DEBIT', 'sig-b', first.blockHash);
    const blocks: LedgerBlock[] = [first, second];

    const root = computeLedgerMerkleRoot(blocks);
    assert.equal(typeof root, 'string');
    assert.equal(root.length, 64);
    assert.match(root, /^[0-9a-f]+$/);
    assert.notEqual(root, '0'.repeat(64));
});

test('verifyLedgerChain accepts clean entries and rejects tampering', () => {
    const first = createLedgerBlock(0, 'TERMINAL-1', 'Ayesha', 5000, 'CREDIT', 'sig-a', '0'.repeat(64));
    const second = createLedgerBlock(1, 'TERMINAL-1', 'Bilal', 3000, 'DEBIT', 'sig-b', first.blockHash);

    assert.equal(verifyLedgerChain([first, second]).isValid, true);

    const tampered = { ...first, customerName: 'Changed Buyer' };
    const tamperedPayload = `${tampered.index}|${tampered.timestamp}|${tampered.merchantId}|${tampered.customerName}|${tampered.amount}|${tampered.type}|${tampered.signatureHash}|${tampered.previousHash}`;
    tampered.blockHash = crypto.createHash('sha256').update(tamperedPayload).digest('hex');

    assert.equal(verifyLedgerChain([tampered, second]).isValid, false);
});

test('empty ledger merkle root stays deterministic', () => {
    assert.equal(computeLedgerMerkleRoot([]), '0'.repeat(64));
});
