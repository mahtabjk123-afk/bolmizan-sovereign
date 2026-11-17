const MAX_ENVELOPE_BYTES = 32768;
import React, { useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { AlertTriangle, Camera, Check, Copy, Download, FileCheck2, ImagePlus, KeyRound, ScanLine, ShieldAlert, ShieldCheck, UserPlus, Volume2, X } from 'lucide-react';
import {
    base64ToBytes,
    bytesToBase64,
    createIdentityEnvelope,
    deriveBackupKey,
    sha256Hex,
    signProof,
    validateBackup,
    verifyProof,
    type HaqBackup,
    type IdentityEnvelope,
    type ProofKind,
    type ProofPayload,
    type ReplayRecord,
    type TrustedContact,
} from '../utils/haqCrypto';
import { reviewContractText, type ContractFlag } from '../utils/haqContractReview';
import { createHaqDeepLink, decodeHaqText, encodeHaqText } from '../utils/haqStego';
import {
    getOrCreateIdentity,
    listReplayRecords,
    listTrustedContacts,
    pinTrustedContact,
    registerReplay,
    resetReplayHistory,
    removeTrustedContact,
    replaceBackupData,
} from '../utils/haqStorage';

type ImageReview = {
    name: string;
    width: number;
    height: number;
    sha256: string;
    elaDataUrl: string;
};

type DetectedBarcode = { rawValue: string };
type LocalBarcodeDetector = {
    detect: (source: HTMLVideoElement) => Promise<DetectedBarcode[]>;
};

const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

function parseRupeesToPaisa(value: string): number | null {
    const match = /^(0|[1-9]\d{0,11})(?:\.(\d{1,2}))?$/.exec(value.trim());
    if (!match) return null;
    const whole = Number(match[1]);
    const fraction = Number((match[2] || '').padEnd(2, '0'));
    const paisa = whole * 100 + fraction;
    return Number.isSafeInteger(paisa) && paisa > 0 ? paisa : null;
}

async function createElaPreview(file: File): Promise<ImageReview> {
    if (file.size > MAX_IMAGE_BYTES) throw new Error('Choose an image smaller than 10 MB.');
    if (!file.type.startsWith('image/')) throw new Error('Choose a supported image file.');
    const bitmap = await createImageBitmap(file);
    try {
        const scale = Math.min(1, 1000 / Math.max(bitmap.width, bitmap.height));
        const width = Math.max(1, Math.round(bitmap.width * scale));
        const height = Math.max(1, Math.round(bitmap.height * scale));
        const source = document.createElement('canvas');
        source.width = width;
        source.height = height;
        const sourceContext = source.getContext('2d', { willReadFrequently: true });
        if (!sourceContext) throw new Error('Canvas image analysis is unavailable in this browser.');
        sourceContext.drawImage(bitmap, 0, 0, width, height);
        const original = sourceContext.getImageData(0, 0, width, height);

        const encoded = await new Promise<Blob>((resolve, reject) => {
            source.toBlob((blob) => blob ? resolve(blob) : reject(new Error('Could not create a local JPEG preview.')), 'image/jpeg', 0.9);
        });
        const recompressedBitmap = await createImageBitmap(encoded);
        const recompressed = document.createElement('canvas');
        recompressed.width = width;
        recompressed.height = height;
        const recompressedContext = recompressed.getContext('2d', { willReadFrequently: true });
        if (!recompressedContext) throw new Error('Canvas image analysis is unavailable in this browser.');
        recompressedContext.drawImage(recompressedBitmap, 0, 0, width, height);
        recompressedBitmap.close();
        const comparison = recompressedContext.getImageData(0, 0, width, height);
        const ela = document.createElement('canvas');
        ela.width = width;
        ela.height = height;
        const elaContext = ela.getContext('2d');
        if (!elaContext) throw new Error('Canvas image analysis is unavailable in this browser.');
        const output = elaContext.createImageData(width, height);
        for (let index = 0; index < original.data.length; index += 4) {
            output.data[index] = Math.min(255, Math.abs(original.data[index] - comparison.data[index]) * 8);
            output.data[index + 1] = Math.min(255, Math.abs(original.data[index + 1] - comparison.data[index + 1]) * 8);
            output.data[index + 2] = Math.min(255, Math.abs(original.data[index + 2] - comparison.data[index + 2]) * 8);
            output.data[index + 3] = 255;
        }
        elaContext.putImageData(output, 0, 0);
        const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
        return {
            name: file.name,
            width: bitmap.width,
            height: bitmap.height,
            sha256: Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join(''),
            elaDataUrl: ela.toDataURL('image/png'),
        };
    } finally {
        bitmap.close();
    }
}

export const HaqProofWorkbench: React.FC = () => {
    const videoRef = useRef<HTMLVideoElement | null>(null);
    const scanFrameRef = useRef<number | null>(null);
    const cameraStreamRef = useRef<MediaStream | null>(null);
    const createSectionRef = useRef<HTMLElement | null>(null);
    const verifySectionRef = useRef<HTMLElement | null>(null);
    const [kind, setKind] = useState<ProofKind>('RECEIPT');
    const [title, setTitle] = useState('Market receipt');
    const [details, setDetails] = useState('');
    const [amount, setAmount] = useState('');
    const [transactionId, setTransactionId] = useState('');
    const [keyPair, setKeyPair] = useState<CryptoKeyPair | null>(null);
    const [identityLabel, setIdentityLabel] = useState('My device');
    const [identityQr, setIdentityQr] = useState('');
    const [identityCode, setIdentityCode] = useState('');
    const [identityFingerprint, setIdentityFingerprint] = useState('');
    const [identityText, setIdentityText] = useState('');
    const [contacts, setContacts] = useState<TrustedContact[]>([]);
    const [replayRecords, setReplayRecords] = useState<ReplayRecord[]>([]);
    const [keyStatus, setKeyStatus] = useState('Loading this browser’s local signing key…');
    const [proofText, setProofText] = useState('');
    const [qrDataUrl, setQrDataUrl] = useState('');
    const [verifyInput, setVerifyInput] = useState('');
    const [verifyMessage, setVerifyMessage] = useState('');
    const [verifyStatus, setVerifyStatus] = useState<'valid' | 'warning' | 'invalid' | null>(null);
    const [duplicateSeenAt, setDuplicateSeenAt] = useState<string | null>(null);
    const [stegoVisibleText, setStegoVisibleText] = useState('');
    const [stegoMessage, setStegoMessage] = useState('');
    const [contractText, setContractText] = useState('');
    const [contractFlags, setContractFlags] = useState<ContractFlag[]>([]);
    const [backupPassword, setBackupPassword] = useState('');
    const [backupMessage, setBackupMessage] = useState('');
    const [judgeResults, setJudgeResults] = useState<Array<{ label: string; result: 'PASS' | 'DETECTED' | 'FAIL'; detail: string }>>([]);
    const [cameraScanning, setCameraScanning] = useState(false);
    const [imageReview, setImageReview] = useState<ImageReview | null>(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const [isOnline, setIsOnline] = useState(typeof navigator === 'undefined' ? false : navigator.onLine);
    const [founderOpen, setFounderOpen] = useState(
        new URLSearchParams(window.location.search).get('mode') === 'haqproof' &&
        new URLSearchParams(window.location.search).get('founder') === 'true',
    );

    const refreshLocalData = async () => {
        const [savedContacts, savedRecords] = await Promise.all([listTrustedContacts(), listReplayRecords()]);
        setContacts(savedContacts);
        setReplayRecords(savedRecords);
    };

    const stopCameraScan = () => {
        if (scanFrameRef.current !== null) cancelAnimationFrame(scanFrameRef.current);
        scanFrameRef.current = null;
        cameraStreamRef.current?.getTracks().forEach((track) => track.stop());
        cameraStreamRef.current = null;
        if (videoRef.current) videoRef.current.srcObject = null;
        setCameraScanning(false);
    };

    useEffect(() => {
        let cancelled = false;
        const updateOnlineStatus = () => setIsOnline(navigator.onLine);
        window.addEventListener('online', updateOnlineStatus);
        window.addEventListener('offline', updateOnlineStatus);
        void navigator.storage?.persist?.().catch(() => false);
        void Promise.all([getOrCreateIdentity(), refreshLocalData()]).then(([pair]) => {
            if (cancelled) return;
            setKeyPair(pair);
            setKeyStatus('Persistent local key ready · private key is non-extractable.');
        }).catch((err: unknown) => {
            if (!cancelled) setKeyStatus(err instanceof Error ? err.message : 'Local key storage is unavailable.');
        });
        return () => {
            cancelled = true;
            window.removeEventListener('online', updateOnlineStatus);
            window.removeEventListener('offline', updateOnlineStatus);
            if (scanFrameRef.current !== null) cancelAnimationFrame(scanFrameRef.current);
            cameraStreamRef.current?.getTracks().forEach((track) => track.stop());
        };
    }, []);

    const jumpTo = (target: React.RefObject<HTMLElement | null>) => {
        target.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        target.current?.focus({ preventScroll: true });
    };

    useEffect(() => {
        let cancelled = false;
        if (!keyPair) return;
        void createIdentityEnvelope(keyPair.publicKey, identityLabel).then(async (identity) => {
            const text = JSON.stringify(identity);
            const qr = await QRCode.toDataURL(text, { errorCorrectionLevel: 'L', margin: 2, width: 280 });
            if (!cancelled) {
                setIdentityCode(text);
                setIdentityQr(qr);
                setIdentityFingerprint(identity.fingerprint);
            }
        }).catch((err: unknown) => {
            if (!cancelled) setError(err instanceof Error ? err.message : 'Could not create the identity QR.');
        });
        return () => { cancelled = true; };
    }, [keyPair, identityLabel]);

    const createProof = async (event: React.FormEvent) => {
        event.preventDefault();
        setError('');
        setVerifyMessage('');
        if (!keyPair) {
            setError('Wait for the persistent local signing key to finish loading before preparing a proof.');
            return;
        }
        if (!title.trim() || !details.trim() || details.length > 700) {
            setError('Enter a title and details (maximum 700 characters).');
            return;
        }
        const amountPaisa = kind === 'RECEIPT' ? parseRupeesToPaisa(amount) : null;
        if (kind === 'RECEIPT' && amountPaisa === null) {
            setError('Enter a valid positive PKR amount with up to two decimal places.');
            return;
        }
        setBusy(true);
        try {
            const payload: ProofPayload = {
                version: 1,
                kind,
                title: title.trim(),
                details: details.trim(),
                transactionId: kind === 'RECEIPT' && transactionId.trim() ? transactionId.trim().slice(0, 100) : null,
                amountPaisa,
                createdAt: new Date().toISOString(),
                nonce: crypto.randomUUID(),
            };
            const envelope = await signProof(payload, keyPair);
            const text = JSON.stringify(envelope);
            if (new TextEncoder().encode(text).length > 1800) {
                throw new Error('This proof is too large for a reliable QR. Shorten its title or details.');
            }
            const qr = await QRCode.toDataURL(text, { errorCorrectionLevel: 'L', margin: 2, width: 360, color: { dark: '#071417', light: '#FFFFFF' } });
            setProofText(text);
            setQrDataUrl(qr);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Could not create the proof.');
        } finally {
            setBusy(false);
        }
    };

    const verifyText = async (text: string) => {
        setError('');
        setVerifyMessage('');
        setVerifyStatus(null);
        setDuplicateSeenAt(null);
        try {
            if (new TextEncoder().encode(text).length > MAX_ENVELOPE_BYTES) throw new Error('Proof is too large to verify.');
            const parsed: unknown = JSON.parse(text);
            const verification = await verifyProof(parsed);
            if (!verification.valid) {
                const message = 'Signature invalid: payload altered, corrupted, or not signed by the embedded key.';
                setVerifyMessage(message);
                setVerifyStatus('invalid');
                void sensoryFeedback(false);
                return;
            }
            const envelopeHash = await sha256Hex(new TextEncoder().encode(JSON.stringify(verification.envelope)));
            const transactionReference = verification.envelope.payload.transactionId?.trim().toLowerCase() || verification.envelope.payload.nonce;
            const transactionHash = await sha256Hex(new TextEncoder().encode(transactionReference));
            const replay = await registerReplay(envelopeHash, transactionHash);
            if (replay.duplicate) {
                const message = `DUPLICATE / REPLAY DETECTED — first scanned ${new Date(replay.duplicate.firstSeenAt).toLocaleString()}. This local record is not a network-wide registry.`;
                setVerifyMessage(message);
                setVerifyStatus('warning');
                setDuplicateSeenAt(replay.duplicate.firstSeenAt);
                void sensoryFeedback(false);
                await refreshLocalData();
                return;
            }
            const trusted = contacts.some((contact) => contact.fingerprint === verification.fingerprint);
            const message = trusted
                ? `VERIFIED BY TRUSTED CONTACT — valid signature from ${contacts.find((contact) => contact.fingerprint === verification.fingerprint)?.label || 'pinned contact'}. This does not prove the underlying event occurred.`
                : 'VALID SELF-ASSERTED SIGNATURE — the embedded public key matches this payload, but the signer is not in this device’s trusted contacts.';
            setVerifyMessage(message);
            setVerifyStatus(trusted ? 'valid' : 'warning');
            void sensoryFeedback(true);
            await refreshLocalData();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Could not verify this proof.');
            setVerifyStatus('invalid');
            void sensoryFeedback(false);
        }
    };

    const sensoryFeedback = async (positive: boolean) => {
        if (typeof navigator !== 'undefined' && 'vibrate' in navigator) navigator.vibrate(positive ? [35] : [100, 60, 100]);
        try {
            const AudioContextConstructor = window.AudioContext || (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
            if (!AudioContextConstructor) return;
            const context = new AudioContextConstructor();
            const oscillator = context.createOscillator();
            const gain = context.createGain();
            oscillator.type = 'sine';
            oscillator.frequency.value = positive ? 880 : 220;
            gain.gain.setValueAtTime(0.0001, context.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.08, context.currentTime + 0.02);
            gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + (positive ? 0.18 : 0.35));
            oscillator.connect(gain);
            gain.connect(context.destination);
            oscillator.start();
            oscillator.stop(context.currentTime + (positive ? 0.2 : 0.38));
            oscillator.onended = () => void context.close();
        } catch {
            // Sensory feedback is optional; verification does not depend on audio.
        }
    };

    const pinIdentityText = async (text: string) => {
        setError('');
        try {
            if (new TextEncoder().encode(text).length > 20_000) throw new Error('Identity code is too large.');
            const parsed = JSON.parse(text) as Partial<IdentityEnvelope>;
            if (
                parsed.protocol !== 'HAQ_IDENTITY' || parsed.version !== 1 ||
                parsed.algorithm !== 'ECDSA-P256-SHA256' || typeof parsed.publicKey !== 'string' ||
                typeof parsed.fingerprint !== 'string' || typeof parsed.label !== 'string' || parsed.label.length > 60
            ) throw new Error('Unsupported identity QR/code.');
            if (Object.keys(parsed).sort().join(',') !== ['algorithm', 'fingerprint', 'label', 'protocol', 'publicKey', 'version'].join(',')) {
                throw new Error('Identity code contains unsupported fields.');
            }
            const publicKeyBytes = base64ToBytes(parsed.publicKey);
            if (await sha256Hex(publicKeyBytes) !== parsed.fingerprint) throw new Error('Identity fingerprint does not match the included public key.');
            await crypto.subtle.importKey('spki', publicKeyBytes, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
            const contact: TrustedContact = { ...parsed as IdentityEnvelope, pinnedAt: new Date().toISOString() };
            await pinTrustedContact(contact);
            setIdentityText('');
            setVerifyMessage(`Public key pinned for ${contact.label}. Confirm the fingerprint with that person through a separate trusted channel; this code cannot verify their real-world identity.`);
            setVerifyStatus('warning');
            await refreshLocalData();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Could not pin this identity.');
        }
    };

    const startCameraScan = async () => {
        setError('');
        const detectorConstructor = (window as Window & {
            BarcodeDetector?: new (options?: { formats: string[] }) => LocalBarcodeDetector;
        }).BarcodeDetector;
        if (!detectorConstructor) {
            setError('This browser does not support local QR camera scanning. Open the .haq file or paste decoded QR text instead.');
            return;
        }
        if (!navigator.mediaDevices?.getUserMedia) {
            setError('Camera access is unavailable. Use the .haq file or paste decoded QR text.');
            return;
        }
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
            cameraStreamRef.current = stream;
            if (!videoRef.current) throw new Error('Camera preview is unavailable.');
            videoRef.current.srcObject = stream;
            await videoRef.current.play();
            const detector = new detectorConstructor({ formats: ['qr_code'] });
            setCameraScanning(true);
            let lastScanAt = 0;
            const scan = async () => {
                const video = videoRef.current;
                if (!video || !cameraStreamRef.current) return;
                const now = performance.now();
                if (now - lastScanAt < 250) {
                    scanFrameRef.current = requestAnimationFrame(() => void scan());
                    return;
                }
                lastScanAt = now;
                try {
                    const codes = await detector.detect(video);
                    const rawValue = codes[0]?.rawValue;
                    if (rawValue) {
                        setVerifyInput(rawValue);
                        stopCameraScan();
                        try {
                            const decoded: unknown = JSON.parse(rawValue);
                            if (decoded && typeof decoded === 'object' && 'protocol' in decoded && decoded.protocol === 'HAQ_IDENTITY') {
                                setIdentityText(rawValue);
                                setVerifyMessage('Identity card scanned. Confirm the contact and fingerprint before pinning it below.');
                                setVerifyStatus('warning');
                            } else {
                                await verifyText(rawValue);
                            }
                        } catch {
                            await verifyText(rawValue);
                        }
                        return;
                    }
                } catch {
                    stopCameraScan();
                    setError('Could not read a QR code from the camera. You can still open the .haq file or paste decoded text.');
                    return;
                }
                scanFrameRef.current = requestAnimationFrame(() => void scan());
            };
            scanFrameRef.current = requestAnimationFrame(() => void scan());
        } catch (err) {
            stopCameraScan();
            setError(err instanceof Error ? err.message : 'Camera permission was denied or scanning could not start.');
        }
    };

    const readProofFile = async (file?: File) => {
        if (!file) return;
        if (file.size > 20_000) {
            setError('Proof file is larger than 20 KB.');
            return;
        }
        const text = await file.text();
        setVerifyInput(text);
        await verifyText(text);
    };

    const inspectImage = async (file?: File) => {
        setImageReview(null);
        setError('');
        if (!file) return;
        setBusy(true);
        try {
            setImageReview(await createElaPreview(file));
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Could not inspect this image locally.');
        } finally {
            setBusy(false);
        }
    };

    const downloadProof = () => {
        if (!proofText) return;
        const url = URL.createObjectURL(new Blob([proofText], { type: 'application/vnd.haqproof+json' }));
        const link = document.createElement('a');
        link.href = url;
        link.download = 'receipt.haq';
        link.click();
        URL.revokeObjectURL(url);
    };

    const exportBackup = async () => {
        setError('');
        setBackupMessage('');
        try {
            if (backupPassword.length < 10) throw new Error('Use a backup password with at least 10 characters.');
            const [savedContacts, savedRecords] = await Promise.all([listTrustedContacts(), listReplayRecords()]);
            const backup: HaqBackup = {
                protocol: 'HAQ_BACKUP',
                version: 1,
                exportedAt: new Date().toISOString(),
                contacts: savedContacts,
                replays: savedRecords,
            };
            const salt = crypto.getRandomValues(new Uint8Array(16));
            const iv = crypto.getRandomValues(new Uint8Array(12));
            const key = await deriveBackupKey(backupPassword, salt);
            const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(JSON.stringify(backup)));
            const encryptedBackup = {
                protocol: 'HAQ_BACKUP_ENCRYPTED',
                version: 1,
                kdf: 'PBKDF2-SHA256-310000',
                cipher: 'AES-256-GCM',
                salt: bytesToBase64(salt),
                iv: bytesToBase64(iv),
                ciphertext: bytesToBase64(new Uint8Array(ciphertext)),
            };
            const url = URL.createObjectURL(new Blob([JSON.stringify(encryptedBackup)], { type: 'application/vnd.haqproof.backup+json' }));
            const link = document.createElement('a');
            link.href = url;
            link.download = 'haqproof-backup.haq-backup';
            link.click();
            window.setTimeout(() => URL.revokeObjectURL(url), 1000);
            setBackupMessage('Encrypted backup downloaded. Keep the password separately; the non-extractable device key is not included.');
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Backup export failed.');
        }
    };

    const importBackup = async (file?: File) => {
        if (!file) return;
        setError('');
        setBackupMessage('');
        if (file.size > 2 * 1024 * 1024) {
            setError('Backup is too large (maximum 2 MB).');
            return;
        }
        try {
            const encrypted = JSON.parse(await file.text()) as Record<string, unknown>;
            if (
                encrypted.protocol !== 'HAQ_BACKUP_ENCRYPTED' || encrypted.version !== 1 ||
                encrypted.kdf !== 'PBKDF2-SHA256-310000' || encrypted.cipher !== 'AES-256-GCM' ||
                typeof encrypted.salt !== 'string' || typeof encrypted.iv !== 'string' || typeof encrypted.ciphertext !== 'string'
            ) throw new Error('Unsupported or invalid encrypted backup format.');
            const key = await deriveBackupKey(backupPassword, base64ToBytes(encrypted.salt));
            const plaintext = await crypto.subtle.decrypt(
                { name: 'AES-GCM', iv: base64ToBytes(encrypted.iv) },
                key,
                base64ToBytes(encrypted.ciphertext),
            );
            const backup = JSON.parse(new TextDecoder().decode(plaintext)) as Partial<HaqBackup>;
            if (!await validateBackup(backup)) throw new Error('Decrypted backup has invalid contents or an invalid replay hash chain.');
            if (!window.confirm('Restore this backup? It will replace trusted contacts and replay history currently stored in this browser.')) return;
            await replaceBackupData(backup.contacts ?? [], backup.replays ?? []);
            await refreshLocalData();
            setBackupMessage('Backup restored locally. Your signing key remains this device’s existing, non-exportable key.');
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Backup could not be decrypted or imported.');
        }
    };

    const shareSignedText = () => {
        if (!proofText) {
            setError('Create a signed proof before embedding it in a message.');
            return;
        }
        try {
            const wrapper = encodeHaqText(stegoVisibleText.trim() || 'HaqProof signed receipt', proofText);
            setStegoMessage(wrapper);
            void navigator.clipboard?.writeText(wrapper).catch(() => undefined);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Could not embed the signed proof in text.');
        }
    };

    const verifySignedText = async () => {
        setError('');
        try {
            const decoded = decodeHaqText(stegoMessage);
            setStegoVisibleText(decoded.visibleText);
            setVerifyInput(decoded.signedEnvelope);
            await verifyText(decoded.signedEnvelope);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Could not decode signed text.');
        }
    };

    const copyVerificationLink = async () => {
        if (!proofText) return;
        try {
            const base = `${window.location.origin}${window.location.pathname}?mode=haqproof`;
            await navigator.clipboard.writeText(createHaqDeepLink(base, proofText));
            setStegoMessage('Verification link copied. Anyone with it can inspect the signed envelope; verification still requires opening HaqProof.');
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Could not create or copy the verification link.');
        }
    };

    const runContractReview = (text = contractText) => {
        const flags = reviewContractText(text);
        setContractFlags(flags);
        void sensoryFeedback(flags.length === 0);
    };

    const runJudgeBattle = async () => {
        setError('');
        setJudgeResults([]);
        if (!keyPair) {
            setError('Persistent signing key is not ready yet.');
            return;
        }
        setBusy(true);
        try {
            const payload: ProofPayload = {
                version: 1,
                kind: 'RECEIPT',
                title: 'Judge demo receipt',
                details: 'Demo only · not a payment confirmation',
                transactionId: 'DEMO-TID-001',
                amountPaisa: 50_000,
                createdAt: new Date().toISOString(),
                nonce: crypto.randomUUID(),
            };
            const envelope = await signProof(payload, keyPair);
            const valid = await verifyProof(envelope);
            const envelopeHash = await sha256Hex(new TextEncoder().encode(JSON.stringify(envelope)));
            const transactionHash = await sha256Hex(new TextEncoder().encode((payload.transactionId || payload.nonce).toLowerCase()));
            const firstSeen = await registerReplay(envelopeHash, transactionHash);
            const tampered = { ...envelope, payload: { ...payload, amountPaisa: 500_000 } };
            const tamperResult = await verifyProof(tampered);
            const secondSeen = await registerReplay(envelopeHash, transactionHash);
            const demoContract = 'The customer agrees to 24% annual interest and monthly compounding. Late payment incurs a penalty.';
            const flags = reviewContractText(demoContract);
            setContractText(demoContract);
            setContractFlags(flags);
            setJudgeResults([
                { label: 'Valid envelope', result: valid.valid && !firstSeen.duplicate ? 'PASS' : 'FAIL', detail: 'Signature verified; local replay entry created.' },
                { label: 'Tampered amount', result: !tamperResult.valid ? 'DETECTED' : 'FAIL', detail: 'Amount changed after signing; signature verification rejected the payload.' },
                { label: 'Duplicate replay', result: secondSeen.duplicate ? 'DETECTED' : 'FAIL', detail: secondSeen.duplicate ? `Same envelope/TID seen at ${new Date(secondSeen.duplicate.firstSeenAt).toLocaleTimeString()}.` : 'Expected duplicate was not detected.' },
                { label: 'Contract keyword rules', result: flags.length > 0 ? 'DETECTED' : 'FAIL', detail: `${flags.length} possible clause(s) highlighted; not legal or religious advice.` },
            ]);
            await refreshLocalData();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Judge battle could not complete.');
        } finally {
            setBusy(false);
        }
    };

    const resetDemoHistory = async () => {
        if (!window.confirm('Clear this browser’s local replay/demo history? This cannot be undone. Your signing key and pinned contacts will remain.')) return;
        try {
            await resetReplayHistory();
            setJudgeResults([]);
            setDuplicateSeenAt(null);
            setVerifyMessage('Local replay/demo history cleared. Device key and pinned contacts were preserved.');
            setVerifyStatus('warning');
            await refreshLocalData();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Could not reset local demo history.');
        }
    };

    return (
        <div className="space-y-6">
            <header className="rounded-2xl border border-[#14B8A6]/30 bg-[#07191E]/90 p-5 sm:p-7">
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <p className="text-xs font-mono uppercase tracking-[0.2em] text-[#5EEAD4]">HAQPROOF · LOCAL PROTOTYPE</p>
                    <span className={`rounded-full border px-3 py-1 text-[11px] font-semibold ${isOnline ? 'border-sky-400/30 bg-sky-950/30 text-sky-200' : 'border-amber-400/40 bg-amber-950/30 text-amber-100'}`} role="status">{isOnline ? 'Browser online · core proof tools remain local' : 'Offline · local proof tools available'}</span>
                </div>
                <h1 className="mt-2 text-2xl font-bold text-white sm:text-3xl">Make or check a signed proof</h1>
                <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-300">Create a locally signed receipt/agreement envelope or examine a screenshot’s recompression differences. For offline use, open this page once while connected so the app shell and prototype code can be cached. Nothing here contacts a bank, proves payment, identifies a person, or determines whether an image is genuine.</p>
                <div className="mt-5 grid gap-3 sm:grid-cols-2">
                    <button type="button" onClick={() => jumpTo(createSectionRef)} className="min-h-14 rounded-xl bg-[#0F766E] px-4 py-3 text-left text-sm font-bold text-white shadow-lg shadow-black/20 hover:bg-[#12877e] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#99F6E4]">
                        Create a signed receipt <span className="block text-xs font-medium text-emerald-100">پکی پرچی بنائیں</span>
                    </button>
                    <button type="button" onClick={() => jumpTo(verifySectionRef)} className="min-h-14 rounded-xl border border-rose-400/40 bg-rose-950/40 px-4 py-3 text-left text-sm font-bold text-white hover:bg-rose-900/50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-300">
                        Verify a proof <span className="block text-xs font-medium text-rose-100">دستخط چیک کریں</span>
                    </button>
                </div>
            </header>

            <section className="grid gap-6 xl:grid-cols-2">
                <section ref={createSectionRef} tabIndex={-1} aria-labelledby="issue-proof-heading" className="scroll-mt-4 rounded-2xl border border-[#F59E0B]/25 bg-[#08171D]/90 p-5 sm:p-6">
                    <div className="flex items-center gap-2 text-[#FDE68A]"><KeyRound className="h-5 w-5" /><h2 id="issue-proof-heading" className="text-lg font-bold">Offline signed QR envelope</h2></div>
                    <p className="mt-2 text-xs leading-5 text-slate-300">ECDSA P-256 signs in this browser. The non-extractable private key is stored in this origin's IndexedDB; browser data eviction or profile loss can still remove it. The public key is self-asserted until independently pinned by a contact.</p>
                    <p role="status" className="mt-2 text-xs text-[#99F6E4]">{keyStatus}</p>
                    <label className="mt-3 block text-xs text-slate-300">Identity label
                        <input value={identityLabel} onChange={(event) => setIdentityLabel(event.target.value)} maxLength={60} className="mt-1 w-full rounded-lg border border-white/15 bg-[#061116] p-2.5 text-white" />
                    </label>
                    {identityQr && <div className="mt-3 flex flex-wrap items-center gap-3"><img src={identityQr} alt="Public identity key QR; verify fingerprint out of band" className="h-28 w-28 rounded bg-white p-1" /><div className="max-w-xs text-[11px] leading-5 text-slate-300"><p>Share this public identity QR. Compare this fingerprint with the person through a separate trusted channel before pinning:</p><p className="mt-1 break-all font-mono text-[10px] text-[#FDE68A]">{identityFingerprint}</p><button type="button" onClick={() => void navigator.clipboard?.writeText(identityCode)} className="mt-1 inline-flex items-center gap-1 text-[#99F6E4]"><Copy className="h-3 w-3" /> Copy identity code</button></div></div>}
                    <details className="mt-3">
                        <summary className="cursor-pointer text-xs font-semibold text-[#99F6E4]">Pin a contact identity</summary>
                        <textarea value={identityText} onChange={(event) => setIdentityText(event.target.value)} rows={3} placeholder="Paste scanned identity QR JSON" className="mt-2 w-full rounded-lg border border-white/15 bg-[#061116] p-2.5 font-mono text-[10px] text-white" />
                        <button type="button" onClick={() => void pinIdentityText(identityText)} disabled={!identityText.trim()} className="mt-2 inline-flex items-center gap-2 rounded-lg border border-[#14B8A6]/40 px-3 py-2 text-xs font-semibold text-[#99F6E4] disabled:opacity-50"><UserPlus className="h-4 w-4" />Verify fingerprint and pin</button>
                    </details>
                    {contacts.length > 0 && <div className="mt-3 space-y-2"><p className="text-xs font-semibold text-white">Pinned contacts ({contacts.length})</p>{contacts.map((contact) => <div key={contact.fingerprint} className="flex items-center justify-between gap-2 rounded-lg border border-white/10 p-2 text-[10px] text-slate-300"><span className="min-w-0"><b>{contact.label}</b><br /><span className="break-all">{contact.fingerprint.slice(0, 24)}…</span></span><button type="button" onClick={() => void removeTrustedContact(contact.fingerprint).then(refreshLocalData)} className="shrink-0 rounded border border-rose-500/30 px-2 py-1 text-rose-200">Remove</button></div>)}</div>}
                    <form onSubmit={(event) => void createProof(event)} className="mt-4 space-y-3">
                        <label className="block text-xs text-slate-300">Proof type
                            <select value={kind} onChange={(event) => setKind(event.target.value as ProofKind)} className="mt-1 w-full rounded-lg border border-white/15 bg-[#061116] p-2.5 text-white">
                                <option value="RECEIPT">Receipt record (not payment confirmation)</option><option value="AGREEMENT">Agreement / oral note</option>
                            </select>
                        </label>
                        <label className="block text-xs text-slate-300">Title
                            <input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={100} required className="mt-1 w-full rounded-lg border border-white/15 bg-[#061116] p-2.5 text-white" />
                        </label>
                        {kind === 'RECEIPT' && <label className="block text-xs text-slate-300">Amount (PKR)
                            <input inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="e.g. 125.50" required className="mt-1 w-full rounded-lg border border-white/15 bg-[#061116] p-2.5 text-white" />
                        </label>}
                        {kind === 'RECEIPT' && <label className="block text-xs text-slate-300">Transaction reference (optional; signed and checked for local duplicates)
                            <input value={transactionId} onChange={(event) => setTransactionId(event.target.value)} maxLength={100} className="mt-1 w-full rounded-lg border border-white/15 bg-[#061116] p-2.5 text-white" />
                        </label>}
                        <label className="block text-xs text-slate-300">Details / parties (avoid sensitive personal data)
                            <textarea value={details} onChange={(event) => setDetails(event.target.value)} maxLength={700} rows={3} required className="mt-1 w-full rounded-lg border border-white/15 bg-[#061116] p-2.5 text-white" />
                        </label>
                        <button disabled={!keyPair || busy} className="rounded-lg bg-[#0F766E] px-4 py-2.5 text-xs font-bold text-white disabled:opacity-50">{busy ? 'Preparing…' : 'Sign and create QR'}</button>
                    </form>
                    {qrDataUrl && <div className="mt-5 grid gap-4 sm:grid-cols-[180px_1fr] sm:items-center">
                        <img src={qrDataUrl} alt="HaqProof signed envelope QR code" className="h-44 w-44 rounded-lg bg-white p-2" />
                        <div className="space-y-2 text-xs text-slate-300"><p>Receiver: transfer the .haq file offline, or scan this QR with a compatible QR reader and paste its text in Verify below.</p><button type="button" onClick={downloadProof} className="inline-flex items-center gap-2 rounded-lg border border-white/20 px-3 py-2 font-semibold text-white"><Download className="h-4 w-4" />Save .haq envelope</button><details><summary className="cursor-pointer text-[#99F6E4]">Show signed envelope text</summary><textarea readOnly value={proofText} rows={5} className="mt-2 w-full rounded bg-black/30 p-2 font-mono text-[10px] text-slate-200" /></details></div>
                    </div>}
                    <div className="mt-5 border-t border-white/10 pt-4">
                        <h3 className="text-sm font-bold text-white">WhatsApp-friendly signed text</h3>
                        <p className="mt-1 text-[11px] leading-5 text-slate-400">Includes invisible signature data plus a visible [MZN:…] fallback tag. The tag carries the signed envelope; it is not itself a verification mark. Messaging apps may still truncate long messages.</p>
                        <input value={stegoVisibleText} onChange={(event) => setStegoVisibleText(event.target.value)} placeholder="Visible receipt text" className="mt-2 w-full rounded-lg border border-white/15 bg-[#061116] p-2.5 text-xs text-white" />
                        <button type="button" onClick={shareSignedText} disabled={!proofText} className="mt-2 inline-flex items-center gap-2 rounded-lg border border-white/20 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"><Copy className="h-4 w-4" />Create &amp; copy signed text</button>
                        <button type="button" onClick={() => void copyVerificationLink()} disabled={!proofText} className="ml-2 mt-2 inline-flex items-center gap-2 rounded-lg border border-white/20 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"><Copy className="h-4 w-4" />Copy verification link</button>
                        <textarea value={stegoMessage} onChange={(event) => setStegoMessage(event.target.value)} rows={3} placeholder="Paste a signed text message here to verify" className="mt-2 w-full rounded-lg border border-white/15 bg-[#061116] p-2.5 text-xs text-white" />
                        <button type="button" onClick={() => void verifySignedText()} disabled={!stegoMessage} className="mt-2 rounded-lg bg-[#0F766E] px-3 py-2 text-xs font-bold text-white disabled:opacity-50">Decode &amp; verify hidden signature</button>
                    </div>
                </section>

                <section ref={verifySectionRef} tabIndex={-1} aria-labelledby="verify-proof-heading" className="scroll-mt-4 rounded-2xl border border-[#9B1C2E]/40 bg-[#08171D]/90 p-5 sm:p-6">
                    <div className="flex items-center gap-2 text-rose-200"><ScanLine className="h-5 w-5" /><h2 id="verify-proof-heading" className="text-lg font-bold">Verify an offline envelope</h2></div>
                    <p className="mt-2 text-xs leading-5 text-slate-300">Checks only whether the payload matches the signature and public key included in the envelope. It cannot establish who signed it, when it was signed, or whether the underlying event happened.</p>
                    <label className="mt-4 block text-xs text-slate-300">Open a .haq / JSON file
                        <input type="file" accept=".haq,.json,application/json" onChange={(event) => void readProofFile(event.target.files?.[0])} className="mt-2 block w-full text-xs text-slate-300 file:mr-3 file:rounded-md file:border-0 file:bg-white/10 file:px-3 file:py-2 file:text-white" />
                    </label>
                    <div className="mt-4 flex flex-wrap items-center gap-3">
                        <button type="button" onClick={() => void startCameraScan()} disabled={cameraScanning} className="inline-flex items-center gap-2 rounded-lg border border-[#14B8A6]/40 px-3 py-2 text-xs font-semibold text-[#99F6E4] disabled:opacity-50">
                            <Camera className="h-4 w-4" /> Scan QR with camera
                        </button>
                        {cameraScanning && <button type="button" onClick={stopCameraScan} className="inline-flex items-center gap-2 rounded-lg border border-white/20 px-3 py-2 text-xs text-white"><X className="h-4 w-4" /> Stop camera</button>}
                    </div>
                    {cameraScanning && <video ref={videoRef} muted playsInline className="mt-3 max-h-64 w-full rounded-lg bg-black object-contain" aria-label="Local QR scanning camera preview" />}
                    <label className="mt-4 block text-xs text-slate-300">Or paste text decoded from the QR
                        <textarea value={verifyInput} onChange={(event) => setVerifyInput(event.target.value)} rows={5} className="mt-1 w-full rounded-lg border border-white/15 bg-[#061116] p-2.5 font-mono text-[11px] text-white" />
                    </label>
                    <button type="button" onClick={() => void verifyText(verifyInput)} disabled={!verifyInput.trim()} className="mt-3 rounded-lg bg-[#0F766E] px-4 py-2.5 text-xs font-bold text-white disabled:opacity-50"><FileCheck2 className="mr-2 inline h-4 w-4" />Verify signature offline</button>
                    {verifyMessage && <p role="status" className={`mt-4 rounded-lg border p-3 text-xs leading-5 ${verifyStatus === 'valid' ? 'border-emerald-500/40 bg-emerald-950/30 text-emerald-100' : verifyStatus === 'warning' ? 'border-amber-500/40 bg-amber-950/30 text-amber-100' : 'border-rose-500/40 bg-rose-950/30 text-rose-100'}`}>{verifyMessage}</p>}
                    {duplicateSeenAt && <p className="mt-2 flex items-center gap-2 rounded-lg border border-rose-500/50 bg-rose-950/60 p-3 text-sm font-black text-rose-100"><AlertTriangle className="h-5 w-5 shrink-0" />DUPLICATE / REPLAY DETECTED · first seen {new Date(duplicateSeenAt).toLocaleString()}</p>}
                    {replayRecords.length > 0 && <p className="mt-3 text-[11px] text-slate-400">This device has {replayRecords.length} locally recorded proof(s); this is not a shared or network-wide replay registry.</p>}
                </section>
            </section>

            <section className="grid gap-6 xl:grid-cols-2">
                <div className="rounded-2xl border border-[#F59E0B]/25 bg-[#08171D]/90 p-5 sm:p-6">
                    <div className="flex items-center gap-2 text-[#FDE68A]"><ShieldCheck className="h-5 w-5" /><h2 className="text-lg font-bold">Encrypted local backup</h2></div>
                    <p className="mt-2 text-xs leading-5 text-slate-300">Exports pinned contacts and the local replay ledger. AES-GCM encryption uses a password-derived key; signing key is non-extractable and not included. Store the password separately and test restore before relying on a backup.</p>
                    <label className="mt-3 block text-xs text-slate-300">Backup password (10+ characters)
                        <input type="password" autoComplete="new-password" value={backupPassword} onChange={(event) => setBackupPassword(event.target.value)} minLength={10} className="mt-1 w-full rounded-lg border border-white/15 bg-[#061116] p-2.5 text-white" />
                    </label>
                    <div className="mt-3 flex flex-wrap gap-2"><button type="button" onClick={() => void exportBackup()} className="inline-flex items-center gap-2 rounded-lg bg-[#0F766E] px-3 py-2 text-xs font-bold text-white"><Download className="h-4 w-4" />Export encrypted backup</button><label className="cursor-pointer rounded-lg border border-white/20 px-3 py-2 text-xs font-semibold text-white">Import backup<input type="file" accept=".haq-backup,application/json" className="sr-only" onChange={(event) => void importBackup(event.target.files?.[0])} /></label></div>
                    {backupMessage && <p role="status" className="mt-3 text-xs text-[#99F6E4]">{backupMessage}</p>}
                </div>

                <div className="rounded-2xl border border-rose-500/30 bg-[#08171D]/90 p-5 sm:p-6">
                    <div className="flex items-center gap-2 text-rose-200"><FileCheck2 className="h-5 w-5" /><h2 className="text-lg font-bold">Contract clause highlighter</h2></div>
                    <p className="mt-2 text-xs leading-5 text-slate-300">Local keyword rules quote matching text for human review. They do not determine legality, Sharia compliance, or the full meaning of a contract.</p>
                    <textarea value={contractText} onChange={(event) => setContractText(event.target.value)} rows={5} maxLength={20_000} placeholder="Paste selected agreement text. Avoid personal or confidential details." className="mt-3 w-full rounded-lg border border-white/15 bg-[#061116] p-2.5 text-xs text-white" />
                    <button type="button" onClick={() => runContractReview()} disabled={!contractText.trim()} className="mt-2 rounded-lg bg-rose-700 px-3 py-2 text-xs font-bold text-white disabled:opacity-50">Highlight possible clauses</button>
                    {contractFlags.length > 0 && <ul className="mt-3 space-y-2">{contractFlags.map((flag, index) => <li key={`${flag.category}-${index}`} className="rounded-lg border border-amber-500/30 bg-amber-950/20 p-3 text-[11px] text-amber-100"><b>{flag.category}</b>: “{flag.excerpt}”<br />{flag.message}</li>)}</ul>}
                    {contractText && contractFlags.length === 0 && <p className="mt-3 text-xs text-slate-300">No configured keyword matched. This is not a finding that the document is safe.</p>}
                </div>
            </section>

            <section className="rounded-2xl border border-[#14B8A6]/30 bg-[#07191E]/90 p-5 sm:p-6">
                <div className="flex flex-wrap items-center justify-between gap-3"><div><div className="flex items-center gap-2 text-[#99F6E4]"><Volume2 className="h-5 w-5" /><h2 className="text-lg font-bold">Judge &amp; field demo battle</h2></div><p className="mt-1 text-xs text-slate-300">Runs local crypto and replay checks on synthetic examples. Results are not a fraud-detection benchmark.</p></div><button type="button" onClick={() => void runJudgeBattle()} disabled={busy || !keyPair} className="rounded-lg bg-[#0F766E] px-4 py-2.5 text-xs font-bold text-white disabled:opacity-50">{busy ? 'Running…' : 'Run local demo scenarios'}</button></div>
                {judgeResults.length > 0 && <div className="mt-4 grid gap-3 sm:grid-cols-2">{judgeResults.map((item) => <div key={item.label} className={`rounded-xl border p-3 ${item.result === 'PASS' ? 'border-emerald-500/30 bg-emerald-950/20' : item.result === 'DETECTED' ? 'border-amber-500/30 bg-amber-950/20' : 'border-rose-500/30 bg-rose-950/20'}`}><p className="flex items-center gap-2 text-sm font-bold text-white">{item.result === 'FAIL' ? <AlertTriangle className="h-4 w-4 text-rose-300" /> : <Check className="h-4 w-4 text-[#99F6E4]" />}{item.label} · {item.result}</p><p className="mt-1 text-[11px] leading-5 text-slate-300">{item.detail}</p></div>)}</div>}
            </section>

            {founderOpen && <section aria-labelledby="founder-inspector-title" className="rounded-2xl border border-amber-400/40 bg-amber-950/20 p-5 sm:p-6">
                <div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-[10px] font-mono uppercase tracking-[0.18em] text-amber-200">LOCAL ONLY · DEVICE INSPECTOR</p><h2 id="founder-inspector-title" className="mt-1 text-lg font-bold text-white">Founder / Judge Inspector</h2></div><button type="button" onClick={() => setFounderOpen(false)} className="rounded-lg border border-white/20 px-3 py-2 text-xs text-white">Close</button></div>
                <p className="mt-2 text-xs leading-5 text-slate-300">These counts come only from this browser’s IndexedDB. They are not global analytics, user telemetry, business performance, or independently audited evidence.</p>
                <dl className="mt-4 grid gap-3 sm:grid-cols-3"><div className="rounded-xl bg-black/20 p-3"><dt className="text-[11px] text-slate-400">Locally recorded proofs</dt><dd className="mt-1 text-2xl font-black text-white">{replayRecords.length}</dd></div><div className="rounded-xl bg-black/20 p-3"><dt className="text-[11px] text-slate-400">Pinned public keys</dt><dd className="mt-1 text-2xl font-black text-white">{contacts.length}</dd></div><div className="rounded-xl bg-black/20 p-3"><dt className="text-[11px] text-slate-400">Device key</dt><dd className="mt-1 text-sm font-bold text-[#99F6E4]">{keyPair && !keyPair.privateKey.extractable ? 'Non-extractable' : 'Not ready'}</dd></div></dl>
                <button type="button" onClick={() => void resetDemoHistory()} className="mt-4 rounded-lg border border-rose-400/40 bg-rose-950/40 px-4 py-2.5 text-xs font-bold text-rose-100 hover:bg-rose-900/50">Reset local demo/replay history</button>
            </section>}

            <section className="rounded-2xl border border-white/15 bg-[#08171D]/90 p-5 sm:p-6">
                <div className="flex items-center gap-2 text-[#FDE68A]"><ImagePlus className="h-5 w-5" /><h2 className="text-lg font-bold">Local screenshot recompression preview</h2></div>
                <p className="mt-2 max-w-4xl text-xs leading-5 text-slate-300">The browser computes a SHA-256 file digest and an experimental ELA-style visualization locally. Recompression artifacts occur in ordinary images too; this is not a fake/real detector and must never be treated as payment evidence. Original image bytes are not uploaded by this component.</p>
                <label className="mt-4 block text-xs text-slate-300">Choose an image (maximum 10 MB)
                    <input type="file" accept="image/*" onChange={(event) => void inspectImage(event.target.files?.[0])} className="mt-2 block w-full text-xs text-slate-300 file:mr-3 file:rounded-md file:border-0 file:bg-white/10 file:px-3 file:py-2 file:text-white" />
                </label>
                {busy && <p role="status" className="mt-3 text-xs text-[#99F6E4]">Processing locally in this browser…</p>}
                {imageReview && <div className="mt-5 grid gap-5 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                    <div className="space-y-2 text-xs text-slate-300"><p className="font-semibold text-white">{imageReview.name} · {imageReview.width} × {imageReview.height}</p><p className="break-all font-mono text-[10px]">SHA-256: {imageReview.sha256}</p><p>Digest fingerprints these exact bytes only; it does not verify the source or contents.</p></div>
                    <div><p className="mb-2 text-xs font-semibold text-white">Amplified recompression difference (×8)</p><img src={imageReview.elaDataUrl} alt="Experimental recompression difference visualization" className="max-h-80 max-w-full rounded-lg border border-white/10" /></div>
                </div>}
            </section>

            {error && <p role="alert" className="flex items-start gap-2 rounded-xl border border-rose-500/40 bg-rose-950/40 p-4 text-xs leading-5 text-rose-100"><ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />{error}</p>}
            <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-4"><p className="max-w-4xl text-[11px] leading-5 text-slate-400">Prototype boundary: no wallet/bank integration, trusted identity, global anti-replay registry, OCR, liveness detection, acoustic/light sensor proof, legal advice, or religious ruling. Offline signature verification works only when the payload is available on the device and Web Crypto is supported.</p><button type="button" onClick={() => setFounderOpen((open) => !open)} className="rounded-md border border-white/15 px-2.5 py-1.5 text-[10px] text-slate-400 hover:border-white/30 hover:text-slate-200">Local inspector</button></footer>
        </div>
    );
};
