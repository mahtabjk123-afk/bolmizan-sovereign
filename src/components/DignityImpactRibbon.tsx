import React from 'react';
import { AlertTriangle, BookOpenCheck, Database, WalletCards } from 'lucide-react';
import type { AudienceMode, LocaleScript, SovereignSystemState } from '../types/sovereign';
import { AjrakClothPattern, ChromaticKashiRule } from './SovereignArt';

interface DignityImpactRibbonProps {
  state: SovereignSystemState;
  mode: AudienceMode;
  script: LocaleScript;
}

export const DignityImpactRibbon: React.FC<DignityImpactRibbonProps> = ({
  script,
}) => {
  const title =
    script === 'ur'
      ? 'اس پائلٹ میں کیا واقعی موجود ہے؟'
      : script === 'sd'
        ? 'هن پائلٽ ۾ حقيقت ۾ ڇا موجود آهي؟'
        : 'What this pilot actually does';

  return (
    <section className="relative overflow-hidden rounded-2xl border border-[#F59E0B]/25 ajrak-moving-glass">
      <ChromaticKashiRule />
      <AjrakClothPattern accentHex="#14B8A6" opacityClass="opacity-[0.07]" />
      <div className="relative z-10 p-5 sm:p-6 space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#F59E0B]/15 pb-3">
          <div
            dir={script === 'en' ? 'ltr' : 'rtl'}
            className="font-display text-lg sm:text-xl font-bold text-white"
          >
            {title}
          </div>
          <span className="text-xs text-[#5EEAD4]">
            Plain status · no invented impact metrics
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
          <div className="rounded-xl border border-[#14B8A6]/25 bg-[#030D12] p-4 space-y-1.5">
            <div className="inline-flex items-center gap-1.5 font-semibold text-[#5EEAD4]">
              <Database className="w-4 h-4" />
              <span>Merchant ledger</span>
            </div>
            <p className="text-[#F8F7F3]/75 leading-relaxed">
              Shop entries can be appended to the server ledger. A valid hash chain is not proof that the underlying transaction is true.
            </p>
          </div>

          <div className="rounded-xl border border-[#F59E0B]/25 bg-[#030D12] p-4 space-y-1.5">
            <div className="inline-flex items-center gap-1.5 font-semibold text-[#FDE68A]">
              <AlertTriangle className="w-4 h-4 text-[#F59E0B]" />
              <span>Scam-text review</span>
            </div>
            <p className="text-[#F8F7F3]/75 leading-relaxed">
              Known text patterns can be highlighted. The tool does not verify identities, determine truth, or block an external payment.
            </p>
          </div>

          <div className="rounded-xl border border-emerald-500/25 bg-[#030D12] p-4 space-y-1.5">
            <div className="inline-flex items-center gap-1.5 font-semibold text-emerald-300">
              <BookOpenCheck className="w-4 h-4" />
              <span>Payments and advice</span>
            </div>
            <p className="text-[#F8F7F3]/75 leading-relaxed">
              No funds are moved. Zakat, Shariah, legal, tax, and investment decisions require qualified human advice.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
};
