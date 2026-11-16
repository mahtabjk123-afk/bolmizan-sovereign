import crypto from 'node:crypto';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

export type LedgerEntryType = 'udhaar_given' | 'payment_received' | 'cash_sale';

export interface TenantRecord {
    id: string;
    phone: string;
    businessName: string;
    ownerName: string;
    city: string;
    raastIban: string;
    pinHash: string;
    createdAt: string;
}

export interface TenantSummary {
    id: string;
    phone: string;
    businessName: string;
    ownerName: string;
    city: string;
    raastIban: string;
    createdAt: string;
}

export interface LedgerBlock {
    block_index: number;
    tenant_id: string;
    party_name: string;
    party_phone: string;
    entry_type: LedgerEntryType;
    amount_pkr: number;
    items_summary: string;
    timestamp: string;
    previous_hash: string;
    block_hash: string;
}

export interface AppendTenantBlockInput {
    tenantId: string;
    idempotencyKey: string;
    partyName: string;
    partyPhone: string;
    entryType: LedgerEntryType;
    amountPkr: number;
    itemsSummary: string;
}

export interface ReconciliationStatementRow {
    reference: string;
    amountPkr: number;
    currency: string;
}

export class IdempotencyConflictError extends Error {
    constructor() {
        super('This idempotency key was already used with different ledger data.');
        this.name = 'IdempotencyConflictError';
    }
}

interface RegisterOrLoginInput {
    phone: string;
    pin: string;
    businessName?: string;
    ownerName?: string;
    city?: string;
    raastIban?: string;
}

const PIN_SCRYPT_COST = 16_384;
const PIN_SCRYPT_BLOCK_SIZE = 8;
const PIN_SCRYPT_PARALLELISM = 1;
const PIN_KEY_LENGTH = 64;
const PIN_MAX_MEMORY = 64 * 1024 * 1024;
const GENESIS_HASH = 'GENESIS';

function normalizePhone(phone: string): string {
    const digits = phone.replace(/\D/g, '');
    if (/^03\d{9}$/.test(digits)) return `92${digits.slice(1)}`;
    if (/^923\d{9}$/.test(digits)) return digits;
    if (/^3\d{9}$/.test(digits)) return `92${digits}`;
    return '';
}

function isValidPin(pin: string): boolean {
    return /^\d{4,6}$/.test(pin);
}

function hashPin(pin: string): string {
    const salt = crypto.randomBytes(16);
    const derivedKey = crypto.scryptSync(pin, salt, PIN_KEY_LENGTH, {
        N: PIN_SCRYPT_COST,
        r: PIN_SCRYPT_BLOCK_SIZE,
        p: PIN_SCRYPT_PARALLELISM,
        maxmem: PIN_MAX_MEMORY,
    });
    return `scrypt$${PIN_SCRYPT_COST}$${PIN_SCRYPT_BLOCK_SIZE}$${PIN_SCRYPT_PARALLELISM}$${salt.toString('base64url')}$${derivedKey.toString('base64url')}`;
}

function verifyPin(pin: string, storedHash: string): boolean {
    const [algorithm, costText, blockSizeText, parallelismText, saltText, keyText, extra] = storedHash.split('$');
    if (algorithm !== 'scrypt' || !costText || !blockSizeText || !parallelismText || !saltText || !keyText || extra !== undefined) {
        return false;
    }

    const cost = Number(costText);
    const blockSize = Number(blockSizeText);
    const parallelism = Number(parallelismText);
    if (cost !== PIN_SCRYPT_COST || blockSize !== PIN_SCRYPT_BLOCK_SIZE || parallelism !== PIN_SCRYPT_PARALLELISM) {
        return false;
    }

    try {
        const salt = Buffer.from(saltText, 'base64url');
        const expected = Buffer.from(keyText, 'base64url');
        if (salt.length !== 16 || expected.length !== PIN_KEY_LENGTH) return false;
        const actual = crypto.scryptSync(pin, salt, PIN_KEY_LENGTH, {
            N: PIN_SCRYPT_COST,
            r: PIN_SCRYPT_BLOCK_SIZE,
            p: PIN_SCRYPT_PARALLELISM,
            maxmem: PIN_MAX_MEMORY,
        });
        return crypto.timingSafeEqual(actual, expected);
    } catch {
        return false;
    }
}

function serializeTenant(tenant: TenantRecord): TenantSummary {
    return {
        id: tenant.id,
        phone: tenant.phone,
        businessName: tenant.businessName,
        ownerName: tenant.ownerName,
        city: tenant.city,
        raastIban: tenant.raastIban,
        createdAt: tenant.createdAt,
    };
}

function hashLedgerBlock(block: Omit<LedgerBlock, 'block_hash'>): string {
    const payload = JSON.stringify([
        1,
        block.block_index,
        block.tenant_id,
        block.party_name,
        block.party_phone,
        block.entry_type,
        block.amount_pkr,
        block.items_summary,
        block.timestamp,
        block.previous_hash,
    ]);
    return crypto.createHash('sha256').update(payload, 'utf8').digest('hex');
}

function isLedgerEntryType(value: unknown): value is LedgerEntryType {
    return value === 'udhaar_given' || value === 'payment_received' || value === 'cash_sale';
}

export class RealDatabase {
    private readonly database: DatabaseSync;

    constructor(databasePath: string) {
        if (databasePath !== ':memory:') mkdirSync(path.dirname(path.resolve(databasePath)), { recursive: true });
        this.database = new DatabaseSync(databasePath);
        this.database.exec('PRAGMA journal_mode = WAL; PRAGMA synchronous = FULL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');
        this.database.exec(`
            CREATE TABLE IF NOT EXISTS tenants (
                id TEXT PRIMARY KEY,
                phone TEXT NOT NULL UNIQUE,
                business_name TEXT NOT NULL,
                owner_name TEXT NOT NULL,
                city TEXT NOT NULL,
                raast_iban TEXT NOT NULL DEFAULT '',
                pin_hash TEXT NOT NULL,
                created_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS ledger_blocks (
                tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
                block_index INTEGER NOT NULL CHECK (block_index > 0),
                party_name TEXT NOT NULL,
                party_phone TEXT NOT NULL DEFAULT '',
                entry_type TEXT NOT NULL CHECK (entry_type IN ('udhaar_given', 'payment_received', 'cash_sale')),
                amount_pkr INTEGER NOT NULL CHECK (amount_pkr > 0),
                items_summary TEXT NOT NULL,
                timestamp TEXT NOT NULL,
                previous_hash TEXT NOT NULL,
                block_hash TEXT NOT NULL,
                PRIMARY KEY (tenant_id, block_index)
            ) STRICT;
            CREATE TRIGGER IF NOT EXISTS ledger_blocks_no_update
            BEFORE UPDATE ON ledger_blocks BEGIN
                SELECT RAISE(ABORT, 'ledger blocks are append-only');
            END;
            CREATE TRIGGER IF NOT EXISTS ledger_blocks_no_delete
            BEFORE DELETE ON ledger_blocks BEGIN
                SELECT RAISE(ABORT, 'ledger blocks are append-only');
            END;
            CREATE TABLE IF NOT EXISTS ledger_idempotency (
                tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
                idempotency_key TEXT NOT NULL,
                request_hash TEXT NOT NULL,
                block_index INTEGER NOT NULL,
                created_at TEXT NOT NULL,
                PRIMARY KEY (tenant_id, idempotency_key),
                FOREIGN KEY (tenant_id, block_index) REFERENCES ledger_blocks(tenant_id, block_index)
            ) STRICT;
        `);
    }

    hasTenantPhone(phone: string): boolean {
        const normalized = normalizePhone(phone);
        if (!normalized) return false;
        return Boolean(this.database.prepare('SELECT 1 FROM tenants WHERE phone = ?').get(normalized));
    }

    getTenantById(tenantId: string): TenantSummary | undefined {
        const row = this.database.prepare(`
            SELECT id, phone, business_name AS businessName, owner_name AS ownerName,
                   city, raast_iban AS raastIban, pin_hash AS pinHash, created_at AS createdAt
            FROM tenants WHERE id = ?
        `).get(tenantId) as unknown as TenantRecord | undefined;
        return row ? serializeTenant(row) : undefined;
    }

    registerOrLoginShop(input: RegisterOrLoginInput, allowRegistration = true):
        | { ok: true; isNew: boolean; tenant: TenantSummary }
        | { ok: false; error: string } {
        const phone = normalizePhone(input.phone);
        if (!phone) return { ok: false, error: 'A valid Pakistan mobile number is required.' };
        if (!isValidPin(input.pin)) return { ok: false, error: 'PIN must contain 4 to 6 digits.' };

        const existing = this.database.prepare(`
            SELECT id, phone, business_name AS businessName, owner_name AS ownerName,
                   city, raast_iban AS raastIban, pin_hash AS pinHash, created_at AS createdAt
            FROM tenants WHERE phone = ?
        `).get(phone) as unknown as TenantRecord | undefined;
        if (existing) {
            if (!verifyPin(input.pin, existing.pinHash)) {
                return { ok: false, error: 'Invalid mobile number or PIN.' };
            }
            return { ok: true, isNew: false, tenant: serializeTenant(existing) };
        }
        if (!allowRegistration) {
            // Reduce account-enumeration timing differences for unknown phone numbers.
            verifyPin(input.pin, DUMMY_PIN_HASH);
            return { ok: false, error: 'Invalid mobile number or PIN.' };
        }

        const tenantId = `tn_${crypto.randomUUID().replaceAll('-', '')}`;
        const createdAt = new Date().toISOString();
        const tenant: TenantRecord = {
            id: tenantId,
            phone,
            businessName: input.businessName?.trim().slice(0, 120) || 'Sakrand Shop',
            ownerName: input.ownerName?.trim().slice(0, 120) || 'Shop Owner',
            city: input.city?.trim().slice(0, 120) || 'Sakrand, Sindh',
            // Never fabricate a payment alias. Configure a verified Raast ID separately.
            raastIban: input.raastIban?.trim().slice(0, 34) || '',
            pinHash: hashPin(input.pin),
            createdAt,
        };
        this.database.prepare(`
            INSERT INTO tenants (id, phone, business_name, owner_name, city, raast_iban, pin_hash, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `).run(tenant.id, tenant.phone, tenant.businessName, tenant.ownerName, tenant.city, tenant.raastIban, tenant.pinHash, tenant.createdAt);

        return { ok: true, isNew: true, tenant: serializeTenant(tenant) };
    }

    getTenantLedger(tenantId: string): LedgerBlock[] {
        return this.database.prepare(`
            SELECT block_index, tenant_id, party_name, party_phone, entry_type, amount_pkr,
                   items_summary, timestamp, previous_hash, block_hash
            FROM ledger_blocks WHERE tenant_id = ? ORDER BY block_index ASC
        `).all(tenantId) as unknown as LedgerBlock[];
    }

    appendTenantBlock(input: AppendTenantBlockInput): { block: LedgerBlock; replayed: boolean } {
        if (!this.getTenantById(input.tenantId)) throw new Error('Tenant not found.');
        if (!/^[A-Za-z0-9._:-]{8,128}$/.test(input.idempotencyKey)) {
            throw new Error('A stable 8 to 128 character idempotency key is required.');
        }
        if (!isLedgerEntryType(input.entryType) || !Number.isSafeInteger(input.amountPkr) || input.amountPkr <= 0) {
            throw new Error('Ledger entry type and positive integer PKR amount are required.');
        }

        const canonicalInput = {
            tenantId: input.tenantId,
            partyName: input.partyName.trim().slice(0, 120),
            partyPhone: normalizePhone(input.partyPhone || ''),
            entryType: input.entryType,
            amountPkr: input.amountPkr,
            itemsSummary: input.itemsSummary.trim().slice(0, 500) || 'Mandi / Shop Trade Goods',
        };
        if (!canonicalInput.partyName) throw new Error('Customer name is required.');
        const requestHash = crypto.createHash('sha256').update(JSON.stringify(canonicalInput), 'utf8').digest('hex');

        this.database.exec('BEGIN IMMEDIATE;');
        try {
            const prior = this.database.prepare(`
                SELECT request_hash AS requestHash, block_index AS blockIndex
                FROM ledger_idempotency WHERE tenant_id = ? AND idempotency_key = ?
            `).get(input.tenantId, input.idempotencyKey) as { requestHash: string; blockIndex: number } | undefined;
            if (prior) {
                if (prior.requestHash !== requestHash) throw new IdempotencyConflictError();
                const block = this.database.prepare(`
                    SELECT block_index, tenant_id, party_name, party_phone, entry_type, amount_pkr,
                           items_summary, timestamp, previous_hash, block_hash
                    FROM ledger_blocks WHERE tenant_id = ? AND block_index = ?
                `).get(input.tenantId, prior.blockIndex) as unknown as LedgerBlock | undefined;
                if (!block) throw new Error('Idempotency record points to a missing ledger block.');
                this.database.exec('COMMIT;');
                return { block, replayed: true };
            }

            const previous = this.database.prepare(`
                SELECT block_index, block_hash FROM ledger_blocks WHERE tenant_id = ? ORDER BY block_index DESC LIMIT 1
            `).get(input.tenantId) as { block_index: number; block_hash: string } | undefined;
            const block: LedgerBlock = {
                block_index: (previous?.block_index ?? 0) + 1,
                tenant_id: input.tenantId,
                party_name: canonicalInput.partyName,
                party_phone: canonicalInput.partyPhone,
                entry_type: canonicalInput.entryType,
                amount_pkr: canonicalInput.amountPkr,
                items_summary: canonicalInput.itemsSummary,
                timestamp: new Date().toISOString(),
                previous_hash: previous?.block_hash ?? GENESIS_HASH,
                block_hash: '',
            };
            if (!block.party_name) throw new Error('Customer name is required.');
            block.block_hash = hashLedgerBlock(block);
            this.database.prepare(`
                INSERT INTO ledger_blocks (
                    tenant_id, block_index, party_name, party_phone, entry_type, amount_pkr,
                    items_summary, timestamp, previous_hash, block_hash
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `).run(
                block.tenant_id, block.block_index, block.party_name, block.party_phone, block.entry_type,
                block.amount_pkr, block.items_summary, block.timestamp, block.previous_hash, block.block_hash,
            );
            this.database.prepare(`
                INSERT INTO ledger_idempotency (tenant_id, idempotency_key, request_hash, block_index, created_at)
                VALUES (?, ?, ?, ?, ?)
            `).run(input.tenantId, input.idempotencyKey, requestHash, block.block_index, block.timestamp);
            this.database.exec('COMMIT;');
            return { block, replayed: false };
        } catch (error) {
            this.database.exec('ROLLBACK;');
            throw error;
        }
    }

    previewTenantStatementReconciliation(tenantId: string, rows: ReconciliationStatementRow[]) {
        const ledger = this.getTenantLedger(tenantId);
        const ledgerByReference = new Map(ledger.map((block) => [`BLK-${block.block_index}`, block]));
        const seenReferences = new Set<string>();
        const matches: Array<{ reference: string; blockIndex: number; amountPkr: number }> = [];
        const exceptions: Array<{ row: number; reference: string; reason: string }> = [];
        const matchedBlockIndexes = new Set<number>();

        rows.forEach((row, index) => {
            const reference = row.reference.trim();
            if (seenReferences.has(reference)) {
                exceptions.push({ row: index + 1, reference, reason: 'duplicate_statement_reference' });
                return;
            }
            seenReferences.add(reference);
            if (row.currency !== 'PKR') {
                exceptions.push({ row: index + 1, reference, reason: 'unsupported_currency' });
                return;
            }
            const block = ledgerByReference.get(reference);
            if (!block) {
                exceptions.push({ row: index + 1, reference, reason: 'no_local_ledger_reference' });
                return;
            }
            if (block.amount_pkr !== row.amountPkr) {
                exceptions.push({ row: index + 1, reference, reason: 'amount_mismatch' });
                return;
            }
            matches.push({ reference, blockIndex: block.block_index, amountPkr: block.amount_pkr });
            matchedBlockIndexes.add(block.block_index);
        });

        return {
            tenantId,
            mode: 'reference_and_amount_preview' as const,
            statementAuthenticated: false,
            settlementConfirmed: false,
            importedRows: rows.length,
            matchedRows: matches.length,
            exceptionRows: exceptions.length,
            unmatchedLocalBlocks: ledger.filter((block) => !matchedBlockIndexes.has(block.block_index)).length,
            matches,
            exceptions,
        };
    }

    verifyTenantChain(tenantId: string): {
        tenantId: string;
        blockCount: number;
        valid: boolean;
        lastHash: string;
        chainHash: string;
    } {
        const chain = this.getTenantLedger(tenantId);
        let previousHash = GENESIS_HASH;
        let valid = true;

        for (let index = 0; index < chain.length; index += 1) {
            const block = chain[index];
            const expectedHash = hashLedgerBlock({
                block_index: block.block_index,
                tenant_id: block.tenant_id,
                party_name: block.party_name,
                party_phone: block.party_phone,
                entry_type: block.entry_type,
                amount_pkr: block.amount_pkr,
                items_summary: block.items_summary,
                timestamp: block.timestamp,
                previous_hash: block.previous_hash,
            });
            const actualBuffer = Buffer.from(block.block_hash, 'hex');
            const expectedBuffer = Buffer.from(expectedHash, 'hex');
            const hashMatches = actualBuffer.length === expectedBuffer.length && crypto.timingSafeEqual(actualBuffer, expectedBuffer);
            if (block.block_index !== index + 1 || block.previous_hash !== previousHash || !hashMatches) valid = false;
            previousHash = block.block_hash;
        }

        return {
            tenantId,
            blockCount: chain.length,
            valid,
            lastHash: chain[chain.length - 1]?.block_hash ?? GENESIS_HASH,
            chainHash: previousHash,
        };
    }

    close(): void {
        this.database.close();
    }
}

const DUMMY_PIN_HASH = hashPin(crypto.randomBytes(8).toString('hex').slice(0, 6));

export function createProductionDatabase(databasePath: string): RealDatabase {
    return new RealDatabase(databasePath);
}

const configuredDatabasePath = process.env.BOLMIZAN_TENANT_DB_FILE || path.resolve(process.cwd(), 'data', 'tenants.sqlite');
export const productionDb = createProductionDatabase(configuredDatabasePath);
