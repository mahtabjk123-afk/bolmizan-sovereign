import { createPersistentIdentity, sha256Hex, type ReplayRecord, type TrustedContact } from './haqCrypto';

const DB_NAME = 'haqproof-local-v1';
const DB_VERSION = 2;
const KEY_STORE = 'identity';
const CONTACT_STORE = 'contacts';
const REPLAY_STORE = 'replays';

function openDatabase(): Promise<IDBDatabase> {
    if (!globalThis.indexedDB) return Promise.reject(new Error('IndexedDB is unavailable in this browser.'));
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        request.onupgradeneeded = () => {
            const db = request.result;
            if (!db.objectStoreNames.contains(KEY_STORE)) db.createObjectStore(KEY_STORE);
            if (!db.objectStoreNames.contains(CONTACT_STORE)) db.createObjectStore(CONTACT_STORE, { keyPath: 'fingerprint' });
            if (!db.objectStoreNames.contains(REPLAY_STORE)) {
                const replayStore = db.createObjectStore(REPLAY_STORE, { keyPath: 'envelopeHash' });
                replayStore.createIndex('transactionHash', 'transactionHash', { unique: true });
            } else {
                const replayStore = request.transaction?.objectStore(REPLAY_STORE);
                if (replayStore && !replayStore.indexNames.contains('transactionHash')) {
                    replayStore.createIndex('transactionHash', 'transactionHash', { unique: true });
                }
            }
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error || new Error('Could not open local storage.'));
        request.onblocked = () => reject(new Error('Close other HaqProof tabs and retry the local database setup.'));
    });
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
    return new Promise((resolve, reject) => {
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error || new Error('Local database request failed.'));
    });
}

function orderReplayRecords(records: ReplayRecord[]): ReplayRecord[] {
    const nextByPreviousHash = new Map(records.map((record) => [record.previousHash, record]));
    if (nextByPreviousHash.size !== records.length) throw new Error('Local replay history has a forked hash chain. Restore a verified backup.');
    const ordered: ReplayRecord[] = [];
    let previousHash = 'HAQ_REPLAY_GENESIS';
    while (nextByPreviousHash.has(previousHash)) {
        const record = nextByPreviousHash.get(previousHash)!;
        ordered.push(record);
        nextByPreviousHash.delete(previousHash);
        previousHash = record.recordHash;
    }
    if (ordered.length !== records.length) throw new Error('Local replay history has a broken hash chain. Restore a verified backup.');
    return ordered;
}

export async function getOrCreateIdentity(): Promise<CryptoKeyPair> {
    const db = await openDatabase();
    try {
        const existing = await requestResult(db.transaction(KEY_STORE, 'readonly').objectStore(KEY_STORE).get('device-keypair')) as CryptoKeyPair | undefined;
        if (existing?.privateKey && existing?.publicKey && !existing.privateKey.extractable) return existing;
        const pair = await createPersistentIdentity();
        const tx = db.transaction(KEY_STORE, 'readwrite');
        tx.objectStore(KEY_STORE).add(pair, 'device-keypair');
        try {
            await new Promise<void>((resolve, reject) => {
                tx.oncomplete = () => resolve();
                tx.onerror = () => reject(tx.error || new Error('Could not persist the signing key.'));
                tx.onabort = () => reject(tx.error || new Error('Could not persist the signing key.'));
            });
            return pair;
        } catch (error) {
            const winner = await requestResult(db.transaction(KEY_STORE, 'readonly').objectStore(KEY_STORE).get('device-keypair')) as CryptoKeyPair | undefined;
            if (winner?.privateKey && winner?.publicKey && !winner.privateKey.extractable) return winner;
            throw error;
        }
    } finally {
        db.close();
    }
}

export async function listTrustedContacts(): Promise<TrustedContact[]> {
    const db = await openDatabase();
    try {
        return await requestResult(db.transaction(CONTACT_STORE, 'readonly').objectStore(CONTACT_STORE).getAll()) as TrustedContact[];
    } finally {
        db.close();
    }
}

export async function pinTrustedContact(contact: TrustedContact): Promise<void> {
    const db = await openDatabase();
    try {
        const tx = db.transaction(CONTACT_STORE, 'readwrite');
        tx.objectStore(CONTACT_STORE).put(contact);
        await new Promise<void>((resolve, reject) => {
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error || new Error('Could not pin contact.'));
            tx.onabort = () => reject(tx.error || new Error('Could not pin contact.'));
        });
    } finally {
        db.close();
    }
}

export async function removeTrustedContact(fingerprint: string): Promise<void> {
    const db = await openDatabase();
    try {
        const tx = db.transaction(CONTACT_STORE, 'readwrite');
        tx.objectStore(CONTACT_STORE).delete(fingerprint);
        await new Promise<void>((resolve, reject) => {
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error || new Error('Could not remove contact.'));
            tx.onabort = () => reject(tx.error || new Error('Could not remove contact.'));
        });
    } finally {
        db.close();
    }
}

export async function resetReplayHistory(): Promise<void> {
    const db = await openDatabase();
    try {
        const tx = db.transaction(REPLAY_STORE, 'readwrite');
        tx.objectStore(REPLAY_STORE).clear();
        await new Promise<void>((resolve, reject) => {
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error || new Error('Could not reset local replay history.'));
            tx.onabort = () => reject(tx.error || new Error('Could not reset local replay history.'));
        });
    } finally {
        db.close();
    }
}

export async function listReplayRecords(): Promise<ReplayRecord[]> {
    const db = await openDatabase();
    try {
        const records = await requestResult(db.transaction(REPLAY_STORE, 'readonly').objectStore(REPLAY_STORE).getAll()) as ReplayRecord[];
        const ordered = orderReplayRecords(records);
        let previousHash = 'HAQ_REPLAY_GENESIS';
        const transactionHashes = new Set<string>();
        for (const record of ordered) {
            if (record.previousHash !== previousHash || transactionHashes.has(record.transactionHash)) {
                throw new Error('Local replay history failed integrity checks. Restore a verified backup.');
            }
            const body = {
                envelopeHash: record.envelopeHash,
                transactionHash: record.transactionHash,
                firstSeenAt: record.firstSeenAt,
                previousHash: record.previousHash,
            };
            if (await sha256Hex(new TextEncoder().encode(JSON.stringify(body))) !== record.recordHash) {
                throw new Error('Local replay history failed integrity checks. Restore a verified backup.');
            }
            transactionHashes.add(record.transactionHash);
            previousHash = record.recordHash;
        }
        return ordered;
    } finally {
        db.close();
    }
}

async function registerReplayLocked(envelopeHash: string, transactionHash: string): Promise<{ duplicate: ReplayRecord | null; record?: ReplayRecord }> {
    const allRecords = await listReplayRecords();
    const duplicate = allRecords.find((record) => record.envelopeHash === envelopeHash || record.transactionHash === transactionHash);
    if (duplicate) return { duplicate };
    const previousHash = allRecords.at(-1)?.recordHash || 'HAQ_REPLAY_GENESIS';
    const recordWithoutHash = {
        envelopeHash,
        transactionHash,
        firstSeenAt: new Date().toISOString(),
        previousHash,
    };
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(recordWithoutHash)));
    const record: ReplayRecord = {
        ...recordWithoutHash,
        recordHash: Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join(''),
    };
    const db = await openDatabase();
    try {
        const tx = db.transaction(REPLAY_STORE, 'readwrite');
        tx.objectStore(REPLAY_STORE).add(record);
        await new Promise<void>((resolve, reject) => {
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error || new Error('Could not record this proof locally.'));
            tx.onabort = () => reject(tx.error || new Error('Could not record this proof. It may have been scanned in another tab.'));
        });
        return { duplicate: null, record };
    } catch (error) {
        const recordsAfterConflict = await listReplayRecords();
        const racedDuplicate = recordsAfterConflict.find((item) => item.envelopeHash === envelopeHash || item.transactionHash === transactionHash);
        if (racedDuplicate) return { duplicate: racedDuplicate };
        throw error;
    } finally {
        db.close();
    }
}

export async function registerReplay(envelopeHash: string, transactionHash: string): Promise<{ duplicate: ReplayRecord | null; record?: ReplayRecord }> {
    if (typeof navigator !== 'undefined' && navigator.locks) {
        return navigator.locks.request('haqproof-replay-ledger', () => registerReplayLocked(envelopeHash, transactionHash));
    }
    return registerReplayLocked(envelopeHash, transactionHash);
}

export async function replaceBackupData(contacts: TrustedContact[], records: ReplayRecord[]): Promise<void> {
    const db = await openDatabase();
    try {
        const tx = db.transaction([CONTACT_STORE, REPLAY_STORE], 'readwrite');
        const contactStore = tx.objectStore(CONTACT_STORE);
        const replayStore = tx.objectStore(REPLAY_STORE);
        contactStore.clear();
        replayStore.clear();
        for (const contact of contacts) contactStore.put(contact);
        for (const record of records) replayStore.put(record);
        await new Promise<void>((resolve, reject) => {
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error || new Error('Could not restore local data.'));
            tx.onabort = () => reject(tx.error || new Error('Could not restore local data.'));
        });
    } finally {
        db.close();
    }
}
