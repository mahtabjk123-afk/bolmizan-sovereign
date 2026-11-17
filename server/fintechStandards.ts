// server/fintechStandards.ts
import crypto from 'crypto';

// 1. Zero-Loss Integer Paisa Math (Eliminates IEEE 754 Floating-Point Errors)
export function pkrToPaisa(pkrAmount: number): number {
    return Math.round(pkrAmount * 100);
}

export function paisaToPkr(paisaAmount: number): number {
    return Number((paisaAmount / 100).toFixed(2));
}

// 2. Double-Entry Accounting Journal Validator (Sum of Debits must equal Credits)
export interface JournalLeg {
    accountId: string;
    direction: 'DEBIT' | 'CREDIT';
    amountPaisa: number;
}

export function validateDoubleEntryJournal(legs: JournalLeg[]): {
    isBalanced: boolean;
    imbalancePaisa: number;
    e2eReferenceId: string;
} {
    let totalDebit = 0;
    let totalCredit = 0;

    for (const leg of legs) {
        if (!Number.isInteger(leg.amountPaisa) || leg.amountPaisa <= 0) {
            throw new Error('FinTech Invariant Violation: Amount must be a positive integer in Paisa.');
        }
        if (leg.direction === 'DEBIT') totalDebit += leg.amountPaisa;
        else totalCredit += leg.amountPaisa;
    }

    const imbalancePaisa = totalDebit - totalCredit;
    // ISO-20022 style End-to-End Transaction Reference ID
    const e2eReferenceId = `BMZ-PKR-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${crypto
        .randomBytes(4)
        .toString('hex')
        .toUpperCase()}`;

    return {
        isBalanced: imbalancePaisa === 0,
        imbalancePaisa,
        e2eReferenceId,
    };
}

// 3. Alternative MSME Credit Score Engine (300 to 850 Scale)
export function calculateMerchantTrustScore(params: {
    verifiedDaysActive: number;
    totalEntriesCount: number;
    repaymentRatio: number; // 0.0 to 1.0 (recovered udhaar / total udhaar)
    tamperViolations: number;
}): { score: number; tier: 'PRIME' | 'STANDARD' | 'BUILDING' | 'HIGH_RISK' } {
    if (params.tamperViolations > 0) {
        return { score: 300, tier: 'HIGH_RISK' };
    }

    const activityPoints = Math.min(params.verifiedDaysActive * 1.5, 150);
    const volumePoints = Math.min(params.totalEntriesCount * 0.5, 150);
    const repaymentPoints = Math.max(0, Math.min(params.repaymentRatio, 1)) * 250;

    const rawScore = Math.round(300 + activityPoints + volumePoints + repaymentPoints);
    const score = Math.min(850, rawScore);

    let tier: 'PRIME' | 'STANDARD' | 'BUILDING' | 'HIGH_RISK' = 'BUILDING';
    if (score >= 750) tier = 'PRIME';
    else if (score >= 650) tier = 'STANDARD';

    return { score, tier };
}

// 4. Transaction Velocity Anomaly Detector
export function checkTransactionVelocityAnomaly(
    currentAmountPaisa: number,
    historicalAveragePaisa: number
): { isAnomaly: boolean; multiplier: number; alertMessage: string } {
    if (historicalAveragePaisa <= 0) {
        return { isAnomaly: false, multiplier: 1, alertMessage: 'Baseline establishing' };
    }

    const multiplier = Number((currentAmountPaisa / historicalAveragePaisa).toFixed(2));
    if (multiplier >= 5.0) {
        return {
            isAnomaly: true,
            multiplier,
            alertMessage: `Velocity Alert: Transaction is ${multiplier}x higher than merchant average.`,
        };
    }

    return { isAnomaly: false, multiplier, alertMessage: 'Normal velocity' };
}
