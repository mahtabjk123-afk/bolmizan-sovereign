export interface QrCapabilityReport {
    hasNativeBarcodeDetector: boolean;
    hasCameraMediaDevices: boolean;
    recommendedMode: 'live-camera' | 'photo-or-text-fallback';
}

export function detectAndroidQrCapabilities(): QrCapabilityReport {
    const hasNativeBarcodeDetector =
        typeof window !== 'undefined' && 'BarcodeDetector' in window;
    const hasCameraMediaDevices =
        typeof navigator !== 'undefined' &&
        Boolean(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);

    return {
        hasNativeBarcodeDetector,
        hasCameraMediaDevices,
        recommendedMode:
            hasNativeBarcodeDetector && hasCameraMediaDevices
                ? 'live-camera'
                : 'photo-or-text-fallback',
    };
}

/**
 * Extracts a BolMizan [MZN:...] tag or raw JSON .haq envelope from pasted WhatsApp text
 */
export function extractHaqPayloadFromText(rawText: string): string | null {
    const trimmed = rawText.trim();
    if (!trimmed) return null;

    // Match [MZN:...] fallback tag
    const tagMatch = trimmed.match(/\[MZN:([A-Za-z0-9+/=_-]+)\]/);
    if (tagMatch && tagMatch[1]) {
        return tagMatch[1];
    }

    // Match raw JSON envelope
    if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
        return trimmed;
    }

    return null;
}
