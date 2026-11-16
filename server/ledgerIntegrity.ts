import crypto from 'node:crypto';

export type LedgerEntryType = 'udhaar_given' | 'payment_received' | 'cash_sale';

export interface LedgerBlockHashInput {
  tenantId: string;
  blockIndex: number;
  previousHash: string;
  partyName: string;
  partyPhone: string;
  entryType: LedgerEntryType;
  amountPkr: number;
  itemsSummary: string;
  status: string;
  createdAt: string;
}

export function computeLedgerBlockHash(input: LedgerBlockHashInput): string {
  const canonical = JSON.stringify({
    version: 2,
    tenantId: input.tenantId,
    blockIndex: input.blockIndex,
    previousHash: input.previousHash,
    partyName: input.partyName,
    partyPhone: input.partyPhone,
    entryType: input.entryType,
    amountPkr: input.amountPkr,
    itemsSummary: input.itemsSummary,
    status: input.status,
    createdAt: input.createdAt,
  });
  return `v2:${crypto.createHash('sha256').update(canonical, 'utf8').digest('hex')}`;
}
