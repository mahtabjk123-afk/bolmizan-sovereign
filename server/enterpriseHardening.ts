// server/enterpriseHardening.ts
import crypto from 'crypto';

// 1. Unicode NFC Normalization (Fixes Sindhi/Urdu dual-codepoint inconsistencies)
export function normalizeMultilingualText(input: string): string {
    return input
        .normalize('NFC')
        .replace(/\u200C|\u200D/g, '') // Remove invisible zero-width joiners
        .trim()
        .replace(/\s+/g, ' ');
}

// 2. Zero-PII Masking (Protects user privacy for ISEF Compliance)
export function sanitizePII(text: string): string {
    // Mask Pakistani mobile numbers (0300-1234567 -> 03XX-XXXX567)
    const maskedPhones = text.replace(/(\b03\d{2})[-\s]?\d{4}(\d{3}\b)/g, '$1-XXXX$2');
    // Mask 13-digit CNICs (42101-1234567-1 -> XXXXX-XXXXXXX-1)
    return maskedPhones.replace(/\b\d{5}[-\s]?\d{7}[-\s]?(\d)\b/g, 'XXXXX-XXXXXXX-$1');
}

// 3. Deterministic Canonical JSON Hashing (Key-order independent SHA-256)
export function computeCanonicalHash(data: Record<string, unknown>): string {
    const sortedKeys = Object.keys(data).sort();
    const canonicalObj: Record<string, unknown> = {};
    for (const key of sortedKeys) {
        const val = data[key];
        canonicalObj[key] = typeof val === 'string' ? normalizeMultilingualText(val) : val;
    }
    const serialized = JSON.stringify(canonicalObj);
    return crypto.createHash('sha256').update(serialized).digest('hex');
}

// 4. Lamport Logical Clock (Guarantees transaction order even if phone clock resets)
export class LamportClock {
    private counter: number;

    constructor(initialValue = 0) {
        this.counter = initialValue;
    }

    public tick(): number {
        this.counter += 1;
        return this.counter;
    }

    public sync(receivedTimestamp: number): number {
        this.counter = Math.max(this.counter, receivedTimestamp) + 1;
        return this.counter;
    }

    public current(): number {
        return this.counter;
    }
}

// 5. Idempotency Guard (Prevents duplicate credit entries on slow 3G/4G networks)
const processedIdempotencyKeys = new Set<string>();

export function checkAndRegisterIdempotency(key: string): boolean {
    if (!key || processedIdempotencyKeys.has(key)) {
        return false; // Duplicate request rejected
    }
    processedIdempotencyKeys.add(key);
    // Keep memory bounded to last 10,000 keys
    if (processedIdempotencyKeys.size > 10000) {
        const firstKey = processedIdempotencyKeys.values().next().value;
        if (firstKey) processedIdempotencyKeys.delete(firstKey);
    }
    return true;
}
