export interface OfflineLedgerDraft {
    id: string;
    merchantId: string;
    customerName: string;
    amountPaisa: number;
    entryType: 'CREDIT_GIVEN' | 'PAYMENT_RECEIVED' | 'EXPENSE';
    note: string;
    signatureDataUrl: string;
    timestamp: string;
    localHash: string;
    synced: boolean;
}

const DB_NAME = 'BolMizanOfflineVault';
const STORE_NAME = 'pendingEntries';

async function computeSHA256(message: string): Promise<string> {
    const subtle = globalThis.crypto?.subtle;
    if (!subtle) {
        throw new Error('Web Crypto is unavailable; offline ledger drafts cannot be hashed in this browser.');
    }

    const digest = await subtle.digest('SHA-256', new TextEncoder().encode(message));
    return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function openVault(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, 1);
        request.onupgradeneeded = () => {
            const db = request.result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                db.createObjectStore(STORE_NAME, { keyPath: 'id' });
            }
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

export async function saveOfflineEntry(
    merchantId: string,
    customerName: string,
    amountPaisa: number,
    entryType: 'CREDIT_GIVEN' | 'PAYMENT_RECEIVED' | 'EXPENSE',
    note: string,
    signatureDataUrl: string,
): Promise<OfflineLedgerDraft> {
    const timestamp = new Date().toISOString();
    const localHash = await computeSHA256(`${merchantId}|${customerName}|${amountPaisa}|${entryType}|${timestamp}`);

    const entry: OfflineLedgerDraft = {
        id: `OFF-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        merchantId,
        customerName,
        amountPaisa,
        entryType,
        note,
        signatureDataUrl,
        timestamp,
        localHash,
        synced: false,
    };

    const db = await openVault();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        tx.objectStore(STORE_NAME).put(entry);
        tx.oncomplete = () => resolve(entry);
        tx.onerror = () => reject(tx.error);
    });
}

export async function syncPendingEntries(apiEndpoint: string): Promise<{ syncedCount: number }> {
    if (!navigator.onLine) return { syncedCount: 0 };

    const db = await openVault();
    const entries: OfflineLedgerDraft[] = await new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const req = tx.objectStore(STORE_NAME).getAll();
        req.onsuccess = () => resolve(req.result.filter((item) => !item.synced));
        req.onerror = () => reject(req.error);
    });

    let syncedCount = 0;
    for (const entry of entries) {
        try {
            const response = await fetch(apiEndpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'same-origin',
                body: JSON.stringify({
                    customerName: entry.customerName,
                    customerPhone: '',
                    entryType: entry.entryType,
                    amountPaisa: entry.amountPaisa,
                    note: entry.note || undefined,
                    idempotencyKey: `offline-${entry.id}`,
                    voiceTranscript: entry.signatureDataUrl ? `Offline signature captured: ${entry.signatureDataUrl}` : undefined,
                }),
            });

            if (response.ok) {
                const updateTx = db.transaction(STORE_NAME, 'readwrite');
                entry.synced = true;
                updateTx.objectStore(STORE_NAME).put(entry);
                syncedCount += 1;
            }
        } catch {
            break;
        }
    }

    return { syncedCount };
}
