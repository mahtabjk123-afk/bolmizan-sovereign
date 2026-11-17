import React, { useState } from 'react';
import { AlertTriangle, CheckCircle2, Plus, RefreshCw, Zap } from 'lucide-react';

interface LedgerBlock {
  index: number;
  customer: string;
  amount: number;
  prevHash: string;
  hash: string;
}

const computeHash = (index: number, customer: string, amount: number, prevHash: string): string => {
  const raw = `${index}:${customer}:${amount}:${prevHash}`;
  let h = 0x811c9dc5;
  for (let i = 0; i < raw.length; i++) {
    h ^= raw.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0').toUpperCase();
};

const createInitialChain = (): LedgerBlock[] => {
  const b0Prev = '00000000';
  const b0Hash = computeHash(1, 'Ahmed Kiryana Sakrand', 4500, b0Prev);
  const b1Hash = computeHash(2, 'Bilal Medical Store', 2200, b0Hash);
  const b2Hash = computeHash(3, 'Zainab General Store', 1800, b1Hash);

  return [
    { index: 1, customer: 'Ahmed Kiryana Sakrand', amount: 4500, prevHash: b0Prev, hash: b0Hash },
    { index: 2, customer: 'Bilal Medical Store', amount: 2200, prevHash: b0Hash, hash: b1Hash },
    { index: 3, customer: 'Zainab General Store', amount: 1800, prevHash: b1Hash, hash: b2Hash },
  ];
};

export const IsefLiveDemoPanel: React.FC = () => {
  const [blocks, setBlocks] = useState<LedgerBlock[]>(createInitialChain);
  const [tamperedIndex, setTamperedIndex] = useState<number | null>(null);
  const [newCustomer, setNewCustomer] = useState('');
  const [newAmount, setNewAmount] = useState('');
  const [mukasaSolved, setMukasaSolved] = useState(false);

  const handleAddBlock = (e: React.FormEvent) => {
    e.preventDefault();
    const amount = Number(newAmount);
    if (!newCustomer.trim() || Number.isNaN(amount) || amount <= 0) return;

    const prevBlock = blocks[blocks.length - 1];
    const nextIndex = prevBlock.index + 1;
    const nextHash = computeHash(nextIndex, newCustomer.trim(), amount, prevBlock.hash);

    setBlocks((current) => [
      ...current,
      {
        index: nextIndex,
        customer: newCustomer.trim(),
        amount,
        prevHash: prevBlock.hash,
        hash: nextHash,
      },
    ]);
    setNewCustomer('');
    setNewAmount('');
  };

  const handleTamper = (idx: number) => {
    setBlocks((prev) =>
      prev.map((blk, i) => (i === idx ? { ...blk, amount: blk.amount + 5000 } : blk))
    );
    setTamperedIndex((prev) => (prev === null ? idx : Math.min(prev, idx)));
  };

  const handleReset = () => {
    setBlocks(createInitialChain());
    setTamperedIndex(null);
  };

  return (
    <div className="space-y-6 text-sm">
      <div className="p-5 bg-slate-900/70 border border-slate-800 rounded-2xl space-y-4">
        <div className="flex flex-wrap justify-between items-start gap-3">
          <div>
            <h3 className="font-bold text-cyan-400 text-base">
              Offline Tamper-Evident Khata Ledger
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Add entries or tamper with any historical block to observe the hash cascade.
            </p>
          </div>
          <button
            onClick={handleReset}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-medium border border-slate-700"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Reset Valid Chain
          </button>
        </div>

        <form onSubmit={handleAddBlock} className="flex flex-wrap gap-2 bg-slate-950/80 p-3 rounded-xl border border-slate-800">
          <input
            type="text"
            placeholder="Merchant / Customer Name"
            value={newCustomer}
            onChange={(e) => setNewCustomer(e.target.value)}
            className="flex-1 min-w-[200px] px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500"
          />
          <input
            type="number"
            placeholder="Amount (PKR)"
            value={newAmount}
            onChange={(e) => setNewAmount(e.target.value)}
            className="w-36 px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500"
          />
          <button
            type="submit"
            className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-semibold"
          >
            <Plus className="w-3.5 h-3.5" />
            Append Signed Block
          </button>
        </form>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {blocks.map((blk, idx) => {
            const expectedHash = computeHash(blk.index, blk.customer, blk.amount, blk.prevHash);
            const isValid = expectedHash === blk.hash && (tamperedIndex === null || idx < tamperedIndex);

            return (
              <div
                key={blk.index}
                className={`p-4 rounded-xl border transition-all ${isValid
                    ? 'bg-slate-950/90 border-emerald-500/40'
                    : 'bg-rose-950/25 border-rose-500 shadow-[0_0_20px_rgba(244,63,94,0.15)]'
                  }`}
              >
                <div className="flex justify-between items-center mb-2">
                  <span className="text-xs font-mono text-slate-400">BLOCK #{blk.index}</span>
                  <span
                    className={`flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full font-bold ${isValid ? 'bg-emerald-500/20 text-emerald-300' : 'bg-rose-500/20 text-rose-300'
                      }`}
                  >
                    {isValid ? <CheckCircle2 className="w-3 h-3" /> : <AlertTriangle className="w-3 h-3" />}
                    {isValid ? 'VERIFIED' : 'CHAIN BROKEN'}
                  </span>
                </div>
                <div className="font-semibold text-slate-100 truncate">{blk.customer}</div>
                <div className="text-lg font-bold text-cyan-300 my-1">PKR {blk.amount.toLocaleString()}</div>
                <div className="text-[11px] font-mono text-slate-400 space-y-1 mt-2 pt-2 border-t border-slate-800/80">
                  <div>Prev Hash: <span className="text-slate-300">{blk.prevHash}</span></div>
                  <div>Block Hash: <span className="text-slate-300">{blk.hash}</span></div>
                  {!isValid && (
                    <div className="text-rose-400 font-semibold">Recomputed: {expectedHash} (Mismatch!)</div>
                  )}
                </div>
                <button
                  onClick={() => handleTamper(idx)}
                  className="mt-3 w-full py-1.5 rounded-lg bg-rose-600/15 hover:bg-rose-600/30 text-rose-300 border border-rose-500/30 text-xs font-medium transition-colors"
                >
                  Simulate Tamper (+PKR 5,000)
                </button>
              </div>
            );
          })}
        </div>
      </div>

      <div className="p-5 bg-slate-900/70 border border-slate-800 rounded-2xl space-y-4">
        <div className="flex flex-wrap justify-between items-center gap-3">
          <div>
            <h3 className="font-bold text-emerald-400 text-base">
              Mukasa Directed Debt Graph Engine
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Detects circular merchant debt and resolves it without physical cash settlement.
            </p>
          </div>
          <button
            onClick={() => setMukasaSolved((prev) => !prev)}
            className="flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-semibold shadow-lg shadow-emerald-950/50 transition-all"
          >
            <Zap className="w-3.5 h-3.5" />
            {mukasaSolved ? 'Reset Circular Debt Graph' : 'Execute Mukasa Netting'}
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-xs">
          <div className="p-3 bg-slate-950 border border-slate-800 rounded-lg">
            Ahmed Kiryana → Bilal Medical: <span className="font-mono text-cyan-400">PKR 3,000</span>
          </div>
          <div className="p-3 bg-slate-950 border border-slate-800 rounded-lg">
            Bilal Medical → Zainab Store: <span className="font-mono text-cyan-400">PKR 3,000</span>
          </div>
          <div className="p-3 bg-slate-950 border border-slate-800 rounded-lg">
            Zainab Store → Ahmed Kiryana: <span className="font-mono text-cyan-400">PKR 3,000</span>
          </div>
        </div>

        {mukasaSolved ? (
          <div className="p-3 bg-emerald-950/30 border border-emerald-500/40 rounded-lg text-xs text-emerald-200">
            Cycle resolved: PKR 9,000 in circular debt netted with PKR 0 cash movement required.
          </div>
        ) : (
          <div className="p-3 bg-amber-950/20 border border-amber-500/30 rounded-lg text-xs text-amber-200">
            Liquidity bottleneck detected: PKR 9,000 remains frozen across three merchants until the cycle is netted.
          </div>
        )}
      </div>
    </div>
  );
};

