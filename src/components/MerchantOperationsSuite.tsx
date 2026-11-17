import React from 'react';
import { FileSpreadsheet } from 'lucide-react';

export const MerchantOperationsSuite: React.FC<{ darkMode?: boolean }> = () => {
  return (
    <div className="p-5 rounded-2xl border border-amber-400/25 bg-[#071820]/95 text-slate-100 space-y-3">
      <h3 className="text-sm font-bold">Merchant Operations (0% Riba Qist, Staff, Stock, FBR CSV)</h3>
      <p className="text-xs opacity-80">Connected to /api/ops/installments, /api/ops/staff, /api/ops/inventory, and /api/ops/tax-summary.csv.</p>
      <a href="/api/ops/tax-summary.csv" className="inline-flex items-center gap-2 rounded-xl bg-[#F59E0B] text-slate-950 font-bold text-xs px-4 py-2">
        <FileSpreadsheet className="w-4 h-4" />
        <span>Download Tax Summary CSV</span>
      </a>
    </div>
  );
};
