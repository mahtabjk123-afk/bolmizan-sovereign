export interface OfflineLedgerPayload {
    idempotencyKey: string;
    customerName: string;
    phone?: string;
    amountPaisa: number;
    entryType: 'CREDIT_GIVEN' | 'PAYMENT_RECEIVED';
    notes?: string;
    createdAt: string;
}

const QUEUE_STORAGE_KEY = 'bolmizan_offline_ledger_queue_v1';

export function getOfflineQueue(): OfflineLedgerPayload[] {
    try {
        const raw = localStorage.getItem(QUEUE_STORAGE_KEY);
        return raw ? (JSON.parse(raw) as OfflineLedgerPayload[]) : [];
    } catch {
        return [];
    }
}

function saveOfflineQueue(queue: OfflineLedgerPayload[]): void {
    localStorage.setItem(QUEUE_STORAGE_KEY, JSON.stringify(queue));
}

export function enqueueLedgerEntry(
    entry: Omit<OfflineLedgerPayload, 'idempotencyKey' | 'createdAt'>
): OfflineLedgerPayload {
    const queue = getOfflineQueue();
    const item: OfflineLedgerPayload = {
        ...entry,
        idempotencyKey: `offline_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
        createdAt: new Date().toISOString(),
    };
    queue.push(item);
    saveOfflineQueue(queue);
    return item;
}

export async function flushOfflineQueue(
    onProgress?: (syncedCount: number, remainingCount: number) => void
): Promise<{ synced: number; failed: number }> {
    const queue = getOfflineQueue();
    if (queue.length === 0 || !navigator.onLine) {
        return { synced: 0, failed: queue.length };
    }

    let synced = 0;
    const remaining: OfflineLedgerPayload[] = [];

    for (const item of queue) {
        try {
            const response = await fetch('/api/ledger/entry', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Idempotency-Key': item.idempotencyKey,
                },
                credentials: 'same-origin',
                body: JSON.stringify(item),
            });

            if (response.ok || response.status === 409) {
                // 200/201 means saved; 409 means idempotency key already processed
                synced += 1;
                onProgress?.(synced, queue.length - synced);
            } else if (response.status >= 400 && response.status < 500 && response.status !== 429) {
                // Permanent validation error: drop or log separately so it doesn't block queue
                console.error('Dropping invalid offline entry:', item.idempotencyKey, response.status);
            } else {
                // Server error (5xx) or rate limit (429): keep in queue for retry
                remaining.push(item);
            }
        } catch {
            // Network dropped mid-sync: keep remaining items safely
            remaining.push(item);
        }
    }

    saveOfflineQueue(remaining);
    return { synced, failed: remaining.length };
}
