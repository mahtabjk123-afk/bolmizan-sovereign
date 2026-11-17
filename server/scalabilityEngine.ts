// server/scalabilityEngine.ts
import crypto from 'crypto';

// 1. Consistent Shard Router (Distributes 100,000+ merchants across 16 logical partitions)
export function getMerchantShardId(merchantId: string, totalShards = 16): number {
    const hash = crypto.createHash('md5').update(merchantId).digest('hex');
    const numericPrefix = parseInt(hash.slice(0, 8), 16);
    return numericPrefix % totalShards;
}

// 2. Non-Blocking Concurrent Write Queue (Prevents SQLite 'SQLITE_BUSY' lock under heavy load)
type WriteTask<T> = () => Promise<T> | T;

export class ConcurrentWriteSerializer {
    private queue: Promise<unknown> = Promise.resolve();
    private pendingCount = 0;

    public enqueue<T>(task: WriteTask<T>): Promise<T> {
        this.pendingCount++;
        const nextTask = this.queue.then(async () => {
            try {
                return await task();
            } finally {
                this.pendingCount--;
            }
        });

        // Keep queue alive even if a single task fails
        this.queue = nextTask.catch(() => { });
        return nextTask;
    }

    public getQueueDepth(): number {
        return this.pendingCount;
    }
}
