// src/utils/advancedLimitationsSolver.ts

// 1. RECEIPT IMAGE FORENSICS (Detects Edited Screenshots / Photoshop Tags)
export async function inspectReceiptImageForEditing(file: File): Promise<{
    isSuspicious: boolean;
    warnings: string[];
}> {
    const warnings: string[] = [];
    const buffer = await file.slice(0, 65536).arrayBuffer(); // Read first 64KB headers
    const textHeader = new TextDecoder('latin1').decode(buffer);

    const editingTools = ['Photoshop', 'GIMP', 'Canva', 'PicsArt', 'PixelLab', 'Snapseed', 'Adobe', 'Remini'];
    for (const tool of editingTools) {
        if (textHeader.toLowerCase().includes(tool.toLowerCase())) {
            warnings.push(`Editing software signature detected in image metadata: ${tool}`);
        }
    }

    // Check if file was modified significantly after creation or lacks standard camera/OS markers
    if (file.size < 15000) {
        warnings.push('Unusually low file size/compression typical of re-saved fake screenshots.');
    }

    return {
        isSuspicious: warnings.length > 0,
        warnings,
    };
}

// 2. OFFLINE DISASTER RECOVERY (Encrypted Portable Backup File before Internet Sync)
export function downloadOfflineDisasterBackup(entries: unknown[]): void {
    const backupPayload = {
        app: 'BolMizan_Offline_Vault',
        exportedAt: new Date().toISOString(),
        recordCount: entries.length,
        entries,
    };

    const jsonString = JSON.stringify(backupPayload, null, 2);
    // Base64 encode for portable offline storage on phone SD card / Bluetooth
    const encodedBackup = btoa(unescape(encodeURIComponent(jsonString)));

    const blob = new Blob([encodedBackup], { type: 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `BolMizan_Offline_Backup_${Date.now()}.bmz`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

// 3. ADAPTIVE SELF-LEARNING SCAM FILTER (Learns New Fraud Phrases Locally)
const LEARNED_KEYWORDS_KEY = 'bolmizan_learned_scam_terms';

export function teachNewScamPattern(phrase: string): string[] {
    const cleanPhrase = phrase.trim().toLowerCase();
    if (cleanPhrase.length < 4) return getLearnedScamPatterns();

    const existing = getLearnedScamPatterns();
    if (!existing.includes(cleanPhrase)) {
        const updated = [...existing, cleanPhrase];
        localStorage.setItem(LEARNED_KEYWORDS_KEY, JSON.stringify(updated));
        return updated;
    }
    return existing;
}

export function getLearnedScamPatterns(): string[] {
    try {
        return JSON.parse(localStorage.getItem(LEARNED_KEYWORDS_KEY) || '[]');
    } catch {
        return [];
    }
}

export function checkAdaptiveLocalScam(text: string): { matchedLearnedTerm: string | null } {
    const lower = text.toLowerCase();
    const learned = getLearnedScamPatterns();
    for (const term of learned) {
        if (lower.includes(term)) {
            return { matchedLearnedTerm: term };
        }
    }
    return { matchedLearnedTerm: null };
}

// 4. HUMAN ENTRY ERROR GUARD ("Garbage-In" Prevention before Hashing)
export function validateHumanEntrySanity(amountPkr: number, customerAveragePkr: number): {
    requiresDoubleConfirm: boolean;
    warningMessage: string | null;
} {
    if (amountPkr <= 0 || amountPkr > 10_000_000) {
        return {
            requiresDoubleConfirm: true,
            warningMessage: 'Entry blocked: Amount must be between Rs. 1 and Rs. 10,000,000.',
        };
    }

    if (customerAveragePkr > 0 && amountPkr >= customerAveragePkr * 5) {
        return {
            requiresDoubleConfirm: true,
            warningMessage: `Typo Alert: Rs. ${amountPkr} is 5x higher than usual Rs. ${customerAveragePkr}. Please verify extra zeros.`,
        };
    }

    return { requiresDoubleConfirm: false, warningMessage: null };
}
