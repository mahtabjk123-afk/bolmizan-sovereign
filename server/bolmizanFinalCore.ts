import crypto from 'crypto';

export interface LedgerBlock {
  index: number;
  timestamp: string;
  merchantId: string;
  customerName: string;
  amount: number;
  type: 'CREDIT' | 'DEBIT';
  signatureHash: string;
  previousHash: string;
  blockHash: string;
}

export function createLedgerBlock(
  index: number,
  merchantId: string,
  customerName: string,
  amount: number,
  type: 'CREDIT' | 'DEBIT',
  rawSignatureBase64: string,
  previousHash: string
): LedgerBlock {
  const timestamp = new Date().toISOString();
  const signatureHash = crypto.createHash('sha256').update(rawSignatureBase64 || 'NO_SIG').digest('hex');
  const payload = `${index}|${timestamp}|${merchantId}|${customerName}|${amount}|${type}|${signatureHash}|${previousHash}`;
  const blockHash = crypto.createHash('sha256').update(payload).digest('hex');
  return { index, timestamp, merchantId, customerName, amount, type, signatureHash, previousHash, blockHash };
}

export function verifyLedgerChain(chain: LedgerBlock[]): { isValid: boolean; tamperedBlockIndex: number | null; reason?: string } {
  for (let i = 0; i < chain.length; i++) {
    const current = chain[i];
    const payload = `${current.index}|${current.timestamp}|${current.merchantId}|${current.customerName}|${current.amount}|${current.type}|${current.signatureHash}|${current.previousHash}`;
    const recomputedHash = crypto.createHash('sha256').update(payload).digest('hex');
    if (current.blockHash !== recomputedHash) {
      return { isValid: false, tamperedBlockIndex: current.index, reason: `Data tampering detected at Block #${current.index}` };
    }
    if (i > 0 && current.previousHash !== chain[i - 1].blockHash) {
      return { isValid: false, tamperedBlockIndex: current.index, reason: `Broken link at Block #${current.index}` };
    }
  }
  return { isValid: true, tamperedBlockIndex: null };
}

export function computeLedgerMerkleRoot(blocks: LedgerBlock[]): string {
  if (blocks.length === 0) return '0'.repeat(64);
  let hashes = blocks.map((b) => b.blockHash);
  while (hashes.length > 1) {
    const nextLevel: string[] = [];
    for (let i = 0; i < hashes.length; i += 2) {
      const left = hashes[i];
      const right = i + 1 < hashes.length ? hashes[i + 1] : left;
      nextLevel.push(crypto.createHash('sha256').update(left + right).digest('hex'));
    }
    hashes = nextLevel;
  }
  return hashes[0];
}

export interface DebtEdge {
  from: string;
  to: string;
  amount: number;
}

export function solveMukasaCircularDebt(edges: DebtEdge[]) {
  const startTime = performance.now();
  const netBalance: Record<string, number> = {};
  let initialVolume = 0;

  for (const edge of edges) {
    initialVolume += edge.amount;
    netBalance[edge.from] = (netBalance[edge.from] || 0) - edge.amount;
    netBalance[edge.to] = (netBalance[edge.to] || 0) + edge.amount;
  }

  const debtors = Object.entries(netBalance).filter(([, b]) => b < 0).map(([id, b]) => ({ id, amount: -b })).sort((a, b) => b.amount - a.amount);
  const creditors = Object.entries(netBalance).filter(([, b]) => b > 0).map(([id, b]) => ({ id, amount: b })).sort((a, b) => b.amount - a.amount);

  const settledEdges: DebtEdge[] = [];
  let finalVolume = 0;
  let i = 0, j = 0;

  while (i < debtors.length && j < creditors.length) {
    const settleAmount = Math.min(debtors[i].amount, creditors[j].amount);
    if (settleAmount > 0) {
      settledEdges.push({ from: debtors[i].id, to: creditors[j].id, amount: settleAmount });
      finalVolume += settleAmount;
    }
    debtors[i].amount -= settleAmount;
    creditors[j].amount -= settleAmount;
    if (debtors[i].amount === 0) i++;
    if (creditors[j].amount === 0) j++;
  }

  const executionTimeMs = Number((performance.now() - startTime).toFixed(3));
  const liquiditySaved = initialVolume - finalVolume;
  const reductionPercentage = initialVolume > 0 ? Number(((liquiditySaved / initialVolume) * 100).toFixed(2)) : 0;

  return { initialVolume, finalVolume, liquiditySaved, reductionPercentage, settledEdges, executionTimeMs };
}
