export async function sha256Hex(value: string): Promise<string> {
    const subtle = globalThis.crypto?.subtle;
    if (!subtle) {
        throw new Error('Web Crypto is unavailable; a SHA-256 receipt fingerprint cannot be created.');
    }

    const digest = await subtle.digest('SHA-256', new TextEncoder().encode(value));
    return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function parseExplicitPkrAmount(value: string): number | null {
    const match = value.match(
        /(?:(?:PKR|Rs\.?|rupees?)\s*([\d,٬۰-۹٠-٩]+)(?![\d,٬]|\.\d)|([\d,٬۰-۹٠-٩]+)(?![\d,٬]|\.\d)\s*(?:PKR|Rs\.?|rupees?)|(?:روپے|رپيا)\s*([\d,٬۰-۹٠-٩]+)(?![\d,٬]|\.\d)|([\d,٬۰-۹٠-٩]+)(?![\d,٬]|\.\d)\s*(?:روپے|رپيا))/i,
    );
    const digits = match?.slice(1).find((part) => part !== undefined);
    if (!digits) return null;

    const urduDigits = '۰۱۲۳۴۵۶۷۸۹';
    const arabicDigits = '٠١٢٣٤٥٦٧٨٩';
    const normalized = digits
        .replace(/[۰-۹٠-٩]/g, (character) => {
            const urduIndex = urduDigits.indexOf(character);
            return String(urduIndex >= 0 ? urduIndex : arabicDigits.indexOf(character));
        })
        .replace(/[٬,]/g, '');
    const amount = Number(normalized);
    return Number.isSafeInteger(amount) && amount > 0 ? amount : null;
}