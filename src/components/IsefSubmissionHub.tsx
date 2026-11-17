// src/components/IsefSubmissionHub.tsx
import React, { useState } from 'react';

interface PilotRecord {
    shopName: string;
    shopType: string;
    uiRating: number;
    timestamp: string;
}

const VIVA_QA = [
    {
        q: 'Why does BolMizan not require a State Bank of Pakistan (SBP) EMI license?',
        a: 'BolMizan operates strictly as a non-custodial bookkeeping and cryptographic audit protocol. It never holds user funds or initiates live interbank transfers, operating under standard software-only regulatory exemptions.',
    },
    {
        q: 'How do you prevent retroactive tampering if a merchant edits the local SQLite database?',
        a: 'The current API recalculates the SHA-256 chain when summaries are requested and has SQLite triggers that reject ordinary row updates and deletes. This is tamper evidence, not protection against a database administrator who can replace the database or its triggers.',
    },
    {
        q: 'What happens if two offline devices edit records while disconnected for days?',
        a: 'Offline drafts should remain visibly pending until the server confirms the idempotent ledger write. Cross-device conflict resolution has not been verified and must not be described as lossless.',
    },
    {
        q: 'How is the Mukasa algorithm better than manual debt settlement?',
        a: 'It models obligations as a directed weighted graph. Any speed or debt-reduction claim requires a documented benchmark and real pilot evidence; no settlement or funds movement occurs in this software.',
    },
];

export const IsefSubmissionHub: React.FC = () => {
    const [records, setRecords] = useState<PilotRecord[]>(() => {
        try {
            return JSON.parse(localStorage.getItem('bolmizan_pilot_records') || '[]');
        } catch {
            return [];
        }
    });

    const [shopName, setShopName] = useState('');
    const [shopType, setShopType] = useState('Kiryana Store');
    const [uiRating, setUiRating] = useState(5);
    const [activeQaIndex, setActiveQaIndex] = useState(0);

    const addPilotRecord = (e: React.FormEvent) => {
        e.preventDefault();
        if (!shopName.trim()) return;
        const newRec: PilotRecord = {
            shopName: shopName.trim(),
            shopType,
            uiRating,
            timestamp: new Date().toISOString(),
        };
        const updated = [...records, newRec];
        setRecords(updated);
        localStorage.setItem('bolmizan_pilot_records', JSON.stringify(updated));
        setShopName('');
    };

    const exportPilotCsv = () => {
        const header = 'Shop_Name,Type,UI_Rating_Out_Of_5,Recorded_At\n';
        const rows = records
            .map((r) => `"${r.shopName.replace(/"/g, '""')}","${r.shopType.replace(/"/g, '""')}",${r.uiRating},"${r.timestamp}"`)
            .join('\n');
        const blob = new Blob([header + rows], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'Sakrand_Field_Pilot_Verified_Data.csv';
        a.click();
    };

    return (
        <div className="p-4 border border-slate-700 rounded-xl bg-slate-900 text-white space-y-6">
            <div className="flex justify-between items-center">
                <h3 className="font-bold text-lg text-emerald-400">ISEF Field Pilot & Judge Defense Hub</h3>
                <span className="text-xs px-2.5 py-1 rounded bg-slate-800 border border-slate-600">
                    Non-Custodial Pilot
                </span>
            </div>

            {/* 1. Digital Sakrand Field Pilot Collector */}
            <form onSubmit={addPilotRecord} className="p-3 rounded-lg bg-slate-800/80 border border-slate-700 space-y-3">
                <h4 className="text-sm font-semibold text-blue-300">
                    Sakrand Merchant Usability Logger ({records.length}/10 Shops Recorded)
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                    <input
                        type="text"
                        placeholder="Shop Name (e.g., Al-Madina Kiryana)"
                        value={shopName}
                        onChange={(e) => setShopName(e.target.value)}
                        className="p-2 rounded bg-slate-900 border border-slate-600 text-xs"
                    />
                    <select
                        value={shopType}
                        onChange={(e) => setShopType(e.target.value)}
                        className="p-2 rounded bg-slate-900 border border-slate-600 text-xs"
                    >
                        <option>Kiryana Store</option>
                        <option>Medical Store</option>
                        <option>Mobile & EasyLoad Shop</option>
                        <option>Wholesale Mandi Trader</option>
                    </select>
                    <select
                        value={uiRating}
                        onChange={(e) => setUiRating(Number(e.target.value))}
                        className="p-2 rounded bg-slate-900 border border-slate-600 text-xs"
                    >
                        <option value={5}>Rating: 5/5 (Very Easy)</option>
                        <option value={4}>Rating: 4/5 (Easy)</option>
                        <option value={3}>Rating: 3/5 (Average)</option>
                    </select>
                </div>

                <div className="flex flex-wrap items-center gap-4 text-xs">
                    <p className="text-slate-300">
                        This form records usability feedback only; it does not certify offline sync or scam-detection performance.
                    </p>
                    <button type="submit" className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 rounded font-medium">
                        Save Merchant Response
                    </button>
                    {records.length > 0 && (
                        <button type="button" onClick={exportPilotCsv} className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 rounded font-medium">
                            Export Pilot CSV
                        </button>
                    )}
                </div>
            </form>

            {/* 2. Interactive Judge Viva Defense Simulator */}
            <div className="p-3 rounded-lg bg-slate-800/80 border border-slate-700 space-y-2">
                <h4 className="text-sm font-semibold text-amber-300">Judge Viva Defense Simulator</h4>
                <div className="flex flex-wrap gap-1.5">
                    {VIVA_QA.map((_, idx) => (
                        <button
                            key={idx}
                            onClick={() => setActiveQaIndex(idx)}
                            className={`px-2.5 py-1 rounded text-xs ${activeQaIndex === idx ? 'bg-amber-600 text-white font-bold' : 'bg-slate-700 text-slate-300'
                                }`}
                        >
                            Question #{idx + 1}
                        </button>
                    ))}
                </div>
                <div className="p-3 rounded bg-slate-950 border border-slate-800 space-y-1.5">
                    <p className="text-xs font-bold text-amber-400">Judge: "{VIVA_QA[activeQaIndex].q}"</p>
                    <p className="text-xs text-slate-200 leading-relaxed">Defense: {VIVA_QA[activeQaIndex].a}</p>
                </div>
            </div>
        </div>
    );
};
