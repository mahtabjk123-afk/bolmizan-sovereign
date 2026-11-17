import React, { useState, useEffect } from 'react';
import { syncPendingEntries } from '../utils/offlineSyncEngine';

export const IsefShieldPanel: React.FC = () => {
    const [isOnline, setIsOnline] = useState<boolean>(navigator.onLine);
    const [smsText, setSmsText] = useState<string>('');
    const [scamResult, setScamResult] = useState<any>(null);
    const [syncMessage, setSyncMessage] = useState<string>('');

    useEffect(() => {
        const handleOnline = async () => {
            setIsOnline(true);
            const res = await syncPendingEntries('/api/ledger/sync');
            if (res.syncedCount > 0) {
                setSyncMessage(`${res.syncedCount} offline entries synced automatically!`);
            }
        };
        const handleOffline = () => setIsOnline(false);

        window.addEventListener('online', handleOnline);
        window.addEventListener('offline', handleOffline);
        return () => {
            window.removeEventListener('online', handleOnline);
            window.removeEventListener('offline', handleOffline);
        };
    }, []);

    const checkScam = async () => {
        if (!smsText.trim()) return;
        const res = await fetch('/api/scam/analyze', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'same-origin',
            body: JSON.stringify({ message: smsText }),
        });
        const data = await res.json();
        setScamResult(data);
    };

    return (
        <div className="p-4 border rounded-xl bg-slate-900 text-white space-y-4">
            <div className="flex justify-between items-center">
                <h3 className="font-bold text-lg">BolMizan Security & Offline Engine</h3>
                <span className={`px-3 py-1 rounded-full text-xs font-semibold ${isOnline ? 'bg-emerald-600' : 'bg-amber-600'}`}>
                    {isOnline ? 'Online & Synced' : 'Offline Vault Active'}
                </span>
            </div>

            {syncMessage && <p className="text-sm text-emerald-400">{syncMessage}</p>}

            <div className="space-y-2">
                <label className="text-sm text-slate-300">Paste Payment SMS / Message (Urdu, Sindhi, English):</label>
                <textarea
                    className="w-full p-2 rounded bg-slate-800 border border-slate-700 text-sm"
                    rows={3}
                    value={smsText}
                    onChange={(e) => setSmsText(e.target.value)}
                    placeholder="Example: 8558: Apko Rs 25,000 BISP imdad mili hai..."
                />
                <button
                    onClick={checkScam}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-500 rounded-lg text-sm font-medium"
                >
                    Analyze Message Integrity
                </button>
            </div>

            {scamResult && (
                <div className={`p-3 rounded-lg border ${scamResult.isScam ? 'bg-red-950/60 border-red-500' : 'bg-emerald-950/60 border-emerald-500'}`}>
                    <p className="font-bold">
                        {scamResult.isScam ? `HIGH RISK SCAM (${scamResult.riskScore}/100)` : `SAFE / NORMAL TEXT (${scamResult.riskScore}/100)`}
                    </p>
                    <p className="text-xs text-slate-400">Analysis Speed: {scamResult.latencyMs} ms</p>
                    {scamResult.detectedSignals?.length > 0 && (
                        <ul className="mt-2 text-xs list-disc list-inside text-red-300">
                            {scamResult.detectedSignals.map((sig: string, idx: number) => (
                                <li key={idx}>{sig}</li>
                            ))}
                        </ul>
                    )}
                </div>
            )}
        </div>
    );
};
