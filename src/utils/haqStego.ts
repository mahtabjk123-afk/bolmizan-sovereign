const MARKER = '\u2063\uFEFF\u2063';
const ZERO_WIDTH_BITS: Record<string, string> = {
    '0': '\u200B',
    '1': '\u200C',
};
const MAX_SIGNED_TEXT_BYTES = 1800;

function encodeBase64Url(bytes: Uint8Array): string {
    let binary = '';
    for (let offset = 0; offset < bytes.length; offset += 0x8000) {
        binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
    }
    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function decodeBase64Url(value: string): string {
    if (!/^[A-Za-z0-9_-]+$/.test(value) || value.length > Math.ceil(MAX_SIGNED_TEXT_BYTES * 4 / 3)) {
        throw new Error('Visible HaqProof tag is invalid or too large.');
    }
    const base64 = value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - value.length % 4) % 4);
    const binary = atob(base64);
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    if (bytes.length > MAX_SIGNED_TEXT_BYTES) throw new Error('Visible HaqProof tag is too large.');
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
}

function bytesToBits(bytes: Uint8Array): string {
    return Array.from(bytes, (byte) => byte.toString(2).padStart(8, '0')).join('');
}

function bitsToBytes(bits: string): Uint8Array {
    if (bits.length % 8 !== 0) throw new Error('Hidden proof data is truncated.');
    const bytes = new Uint8Array(bits.length / 8);
    for (let index = 0; index < bytes.length; index += 1) {
        bytes[index] = Number.parseInt(bits.slice(index * 8, index * 8 + 8), 2);
    }
    return bytes;
}

export function encodeHaqText(visibleText: string, signedEnvelope: string): string {
    const payload = new TextEncoder().encode(signedEnvelope);
    if (payload.length > MAX_SIGNED_TEXT_BYTES) throw new Error('Signed proof is too large to embed in a text message.');
    const encoded = Array.from(bytesToBits(payload), (bit) => ZERO_WIDTH_BITS[bit]).join('');
    const fallbackTag = `[MZN:${encodeBase64Url(payload)}]`;
    return `${visibleText}${MARKER}${encoded}\u2063 ${fallbackTag}`;
}

export function decodeHaqText(message: string): { visibleText: string; signedEnvelope: string } {
    const markerIndex = message.lastIndexOf(MARKER);
    if (markerIndex >= 0) {
        const terminator = message.indexOf('\u2063', markerIndex + MARKER.length);
        if (terminator < 0) throw new Error('Hidden proof data is truncated.');
        const hidden = message.slice(markerIndex + MARKER.length, terminator);
        if (hidden.length > MAX_SIGNED_TEXT_BYTES * 8 || hidden.length % 8 !== 0) {
            throw new Error('Hidden proof data has an invalid length.');
        }
        if (hidden.length > 0) {
            let bits = '';
            for (const char of hidden) {
                if (char === '\u200B') bits += '0';
                else if (char === '\u200C') bits += '1';
                else throw new Error('Hidden proof contains unsupported characters.');
            }
            const decoded = new TextDecoder('utf-8', { fatal: true }).decode(bitsToBytes(bits));
            return { visibleText: message.slice(0, markerIndex), signedEnvelope: decoded };
        }
    }

    const tag = /\[MZN:([A-Za-z0-9_-]+)\]/.exec(message);
    if (tag) {
        return { visibleText: message.replace(tag[0], '').trimEnd(), signedEnvelope: decodeBase64Url(tag[1]) };
    }

    const fragment = message.includes('#') ? message.slice(message.indexOf('#')) : message;
    const hashTag = /(?:^|[#&])haq=([A-Za-z0-9_-]+)/.exec(fragment);
    if (hashTag) return { visibleText: '', signedEnvelope: decodeBase64Url(hashTag[1]) };

    throw new Error('No HaqProof text signature, visible tag, or link fragment was found.');
}

export function createHaqDeepLink(baseUrl: string, signedEnvelope: string): string {
    const payload = new TextEncoder().encode(signedEnvelope);
    if (payload.length > MAX_SIGNED_TEXT_BYTES) throw new Error('Signed proof is too large for a verification link.');
    const url = new URL(baseUrl);
    url.hash = `haq=${encodeBase64Url(payload)}`;
    return url.toString();
}
