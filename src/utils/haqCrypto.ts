export type ProofKind = 'RECEIPT' | 'AGREEMENT';

export type ProofPayload = {
    version: 1;
    kind: ProofKind;
    title: string;
    details: string;
    transactionId?: string | null;
    amountPaisa: number | null;
    createdAt: string;
    nonce: string;
};

export type HaqProofEnvelope = {
    protocol: 'HAQPROOF';
    version: 1;
    algorithm: 'ECDSA-P256-SHA256';
    publicKey: string;
    payload: ProofPayload;
    signature: string;
};

export type IdentityEnvelope = {
    protocol: 'HAQ_IDENTITY';
    version: 1;
    algorithm: 'ECDSA-P256-SHA256';
    publicKey: string;
    fingerprint: string;
    label: string;
};

export type TrustedContact = IdentityEnvelope & { pinnedAt: string };

export type ReplayRecord = {
    envelopeHash: string;
    transactionHash: string;
    firstSeenAt: string;
    previousHash: string;
    recordHash: string;
};

export type HaqBackup = {
    protocol: 'HAQ_BACKUP';
    version: 1;
    exportedAt: string;
    contacts: TrustedContact[];
    replays: ReplayRecord[];
};

export const MAX_ENVELOPE_BYTES = 20_000;

export function bytesToBase64(bytes: Uint8Array<ArrayBuffer>): string {
    let binary = '';
    const chunkSize = 0x8000;
    for (let offset = 0; offset < bytes.length; offset += chunkSize) {
        binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
    }
    return btoa(binary);
}

export function base64ToBytes(value: string): Uint8Array<ArrayBuffer> {
    if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)) {
        throw new Error('Invalid base64 data.');
    }
    const binary = atob(value);
    return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

export function canonicalPayload(payload: ProofPayload): Uint8Array<ArrayBuffer> {
    return new TextEncoder().encode(JSON.stringify(payload));
}

export async function sha256Hex(data: BufferSource): Promise<string> {
    const digest = await crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(digest) as Uint8Array<ArrayBuffer>, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function createPersistentIdentity(): Promise<CryptoKeyPair> {
    if (!crypto.subtle) throw new Error('Web Crypto is unavailable; use HTTPS or localhost.');
    const pair = await crypto.subtle.generateKey(
        { name: 'ECDSA', namedCurve: 'P-256' },
        false,
        ['sign', 'verify'],
    ) as CryptoKeyPair;
    if (!pair.privateKey || pair.privateKey.extractable) throw new Error('Browser did not create a non-extractable private key.');
    return pair;
}

export async function createIdentityEnvelope(publicKey: CryptoKey, label: string): Promise<IdentityEnvelope> {
    if (!publicKey.extractable) throw new Error('This public key cannot be exported by the browser.');
    const rawKey = new Uint8Array(await crypto.subtle.exportKey('spki', publicKey));
    return {
        protocol: 'HAQ_IDENTITY',
        version: 1,
        algorithm: 'ECDSA-P256-SHA256',
        publicKey: bytesToBase64(rawKey),
        fingerprint: await sha256Hex(rawKey),
        label: label.trim().slice(0, 60) || 'HaqProof contact',
    };
}

export async function signProof(payload: ProofPayload, keyPair: CryptoKeyPair): Promise<HaqProofEnvelope> {
    const publicIdentity = await createIdentityEnvelope(keyPair.publicKey, 'Self-asserted signer');
    const signature = await crypto.subtle.sign(
        { name: 'ECDSA', hash: 'SHA-256' },
        keyPair.privateKey,
        canonicalPayload(payload),
    );
    return {
        protocol: 'HAQPROOF',
        version: 1,
        algorithm: 'ECDSA-P256-SHA256',
        publicKey: publicIdentity.publicKey,
        payload,
        signature: bytesToBase64(new Uint8Array(signature) as Uint8Array<ArrayBuffer>),
    };
}

export function isProofEnvelope(value: unknown): value is HaqProofEnvelope {
    if (!value || typeof value !== 'object') return false;
    const envelope = value as Partial<HaqProofEnvelope>;
    const payload = envelope.payload as Partial<ProofPayload> | undefined;
    if (
        envelope.protocol !== 'HAQPROOF' || envelope.version !== 1 ||
        envelope.algorithm !== 'ECDSA-P256-SHA256' || typeof envelope.publicKey !== 'string' ||
        typeof envelope.signature !== 'string' || !payload || typeof payload !== 'object'
    ) return false;
    const expectedEnvelopeKeys = ['algorithm', 'payload', 'protocol', 'publicKey', 'signature', 'version'];
    const keys = Object.keys(payload).sort().join(',');
    const legacyKeys = ['amountPaisa', 'createdAt', 'details', 'kind', 'nonce', 'title', 'version'].join(',');
    const currentKeys = ['amountPaisa', 'createdAt', 'details', 'kind', 'nonce', 'title', 'transactionId', 'version'].join(',');
    return payload.version === 1 && ['RECEIPT', 'AGREEMENT'].includes(String(payload.kind)) &&
        typeof payload.title === 'string' && payload.title.length <= 100 &&
        typeof payload.details === 'string' && payload.details.length <= 700 &&
        (payload.transactionId === undefined || payload.transactionId === null || (typeof payload.transactionId === 'string' && payload.transactionId.length <= 100)) &&
        typeof payload.createdAt === 'string' && Number.isFinite(Date.parse(payload.createdAt)) &&
        typeof payload.nonce === 'string' && payload.nonce.length > 0 && payload.nonce.length <= 100 &&
        (payload.amountPaisa === null || (Number.isSafeInteger(payload.amountPaisa) && Number(payload.amountPaisa) > 0)) &&
        ((payload.kind === 'RECEIPT') === (payload.amountPaisa !== null)) &&
        Object.keys(envelope).sort().join(',') === expectedEnvelopeKeys.join(',') &&
        (keys === legacyKeys || keys === currentKeys);
}

export async function verifyProof(value: unknown): Promise<{ valid: boolean; fingerprint: string; envelope: HaqProofEnvelope }> {
    if (!isProofEnvelope(value)) throw new Error('Unsupported or malformed HaqProof envelope.');
    const serialized = JSON.stringify(value);
    if (new TextEncoder().encode(serialized).length > MAX_ENVELOPE_BYTES) throw new Error('Proof is too large to verify.');
    const envelope = value;
    const publicKeyBytes = base64ToBytes(envelope.publicKey);
    const signatureBytes = base64ToBytes(envelope.signature);
    if (publicKeyBytes.length > 200 || signatureBytes.length > 100) throw new Error('The proof key or signature is invalid.');
    const fingerprint = await sha256Hex(publicKeyBytes);
    const key = await crypto.subtle.importKey(
        'spki', publicKeyBytes, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify'],
    );
    const valid = await crypto.subtle.verify(
        { name: 'ECDSA', hash: 'SHA-256' }, key, signatureBytes, canonicalPayload(envelope.payload),
    );
    return { valid, fingerprint, envelope };
}

export async function deriveBackupKey(password: string, salt: Uint8Array<ArrayBuffer>): Promise<CryptoKey> {
    if (password.length < 10) throw new Error('Use a backup password with at least 10 characters.');
    const material = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey']);
    return crypto.subtle.deriveKey(
        { name: 'PBKDF2', salt, iterations: 310_000, hash: 'SHA-256' },
        material,
        { name: 'AES-GCM', length: 256 },
        false,
        ['encrypt', 'decrypt'],
    );
}

export async function validateBackup(backup: Partial<HaqBackup>): Promise<boolean> {
    if (
        backup.protocol !== 'HAQ_BACKUP' || backup.version !== 1 || typeof backup.exportedAt !== 'string' ||
        !Number.isFinite(Date.parse(backup.exportedAt)) || !Array.isArray(backup.contacts) || !Array.isArray(backup.replays) ||
        backup.contacts.length > 10_000 || (backup.replays ?? []).length > 100_000
    ) return false;
    if ((backup.replays ?? []).some((record) => !record || typeof record.firstSeenAt !== 'string')) return false;

    for (const candidate of backup.contacts) {
        if (!candidate || candidate.protocol !== 'HAQ_IDENTITY' || candidate.version !== 1 ||
            candidate.algorithm !== 'ECDSA-P256-SHA256' || typeof candidate.label !== 'string' || candidate.label.length > 60 ||
            typeof candidate.fingerprint !== 'string' || !/^[a-f0-9]{64}$/.test(candidate.fingerprint) ||
            typeof candidate.pinnedAt !== 'string' || !Number.isFinite(Date.parse(candidate.pinnedAt))) return false;
        try {
            const publicKeyBytes = base64ToBytes(candidate.publicKey);
            if (await sha256Hex(publicKeyBytes) !== candidate.fingerprint) return false;
            await crypto.subtle.importKey('spki', publicKeyBytes, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
        } catch {
            return false;
        }
    }
    return true;

    const unordered = new Map((backup.replays ?? []).map((record) => [record.previousHash, record]));
    if (unordered.size !== (backup.replays ?? []).length) return false;
    const records: ReplayRecord[] = [];
    let chainCursor = 'HAQ_REPLAY_GENESIS';
    while (unordered.has(chainCursor)) {
        const record = unordered.get(chainCursor)!;
        records.push(record);
        unordered.delete(chainCursor);
        chainCursor = record.recordHash;
    }
    if (unordered.size > 0) return false;
    let previousHash = 'HAQ_REPLAY_GENESIS';
    const seenEnvelopes = new Set<string>();
    const seenTransactions = new Set<string>();
    for (const record of records) {
        if (!record || !/^[a-f0-9]{64}$/.test(record.envelopeHash) || !/^[a-f0-9]{64}$/.test(record.transactionHash) ||
            !/^[a-f0-9]{64}$/.test(record.recordHash) || !Number.isFinite(Date.parse(record.firstSeenAt)) || record.previousHash !== previousHash ||
            seenEnvelopes.has(record.envelopeHash) || seenTransactions.has(record.transactionHash)) return false;
        const body = {
            envelopeHash: record.envelopeHash,
            transactionHash: record.transactionHash,
            firstSeenAt: record.firstSeenAt,
            previousHash: record.previousHash,
        };
        if (await sha256Hex(new TextEncoder().encode(JSON.stringify(body))) !== record.recordHash) return false;
        seenEnvelopes.add(record.envelopeHash);
        seenTransactions.add(record.transactionHash);
        previousHash = record.recordHash;
    }
    return true;
}
