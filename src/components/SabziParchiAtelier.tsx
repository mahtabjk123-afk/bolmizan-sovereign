import React, { useEffect, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { Check, MessageCircle, Printer, ShieldCheck, Stamp } from 'lucide-react';
import type { LocaleScript, QuickCommandDraft } from '../types/sovereign';
import { triggerApexHaptic } from '../utils/haptics';
import { sha256Hex } from '../utils/receiptIntegrity';
import { CustomerSignaturePad } from './CustomerSignaturePad';
import { AjrakClothPattern, HalaKashiCornerOrnament } from './SovereignArt';

interface SabziParchiAtelierProps {
  script: LocaleScript;
  shopName?: string;
  externalDraft?: QuickCommandDraft | null;
}

const PRESET_BASKETS = [
  { label: '2 Mann Basmati Rice', item: 'Sakrand Super Basmati (80 kg)', amount: 24500 },
  { label: 'Khairpur Dates Crate', item: 'Aseel Khairpur Dates (40 kg)', amount: 14800 },
  { label: 'Daily Fresh Sabzi', item: 'Tomato, Onion & Green Chili Lot', amount: 6200 },
  { label: 'Solar Drip Deposit', item: 'Solar Water Pump Downpayment', amount: 45000 },
];

export const SabziParchiAtelier: React.FC<SabziParchiAtelierProps> = ({
  script,
  shopName = 'Al-Mizan Sabzi & Anaj Store · Sakrand',
  externalDraft,
}) => {
  const [customer, setCustomer] = useState('Haji Tariq Mehmood');
  const [customerPhone, setCustomerPhone] = useState('03001234567');
  const [itemText, setItemText] = useState('Sakrand Super Basmati (80 kg)');
  const [amountPkr, setAmountPkr] = useState(24500);
  const [modeType, setModeType] = useState<'Udhaar (Credit)' | 'Wasooli (Paid)'>('Udhaar (Credit)');
  const [witness, setWitness] = useState('Master Rasheed Ahmed (Otaq)');
  const [customerSignature, setCustomerSignature] = useState<string | null>(null);
  const [stamped, setStamped] = useState(false);
  const [receiptHash, setReceiptHash] = useState('');
  const [hashError, setHashError] = useState<string | null>(null);
  const [hashBusy, setHashBusy] = useState(false);
  const [sealedAt, setSealedAt] = useState<string | null>(null);
  const [quickLine, setQuickLine] = useState('Chacha Ghulam ko 2 Mann Chawal PKR 18500');
  const receiptRevision = useRef(0);

  const invalidateReceiptSeal = () => {
    receiptRevision.current += 1;
    setStamped(false);
    setHashBusy(false);
    setReceiptHash('');
    setHashError(null);
    setSealedAt(null);
    setCustomerSignature(null);
  };

  useEffect(() => {
    if (!externalDraft) return;
    setCustomer(externalDraft.customer);
    setItemText(externalDraft.item);
    setAmountPkr(externalDraft.amountPkr);
    setModeType(externalDraft.entryType);
    receiptRevision.current += 1;
    setCustomerSignature(null);
    setHashBusy(false);
    setHashError(null);
    setReceiptHash('');
    setQuickLine(`${externalDraft.customer} · ${externalDraft.item} · PKR ${externalDraft.amountPkr}`);
    setStamped(false);
    setReceiptHash('');
    setSealedAt(null);
  }, [externalDraft]);

  const applyQuickLine = (raw: string) => {
    const numMatch = raw.match(/\d[\d,]*/g);
    if (numMatch && numMatch.length > 0) {
      const largest = Math.max(...numMatch.map((n) => Number(n.replace(/,/g, ''))));
      if (largest >= 50) setAmountPkr(largest);
    }
    const cleanWords = raw.replace(/\d[\d,]*/g, '').trim();
    if (cleanWords.length > 3) {
      const firstTwo = cleanWords.split(/\s+/).slice(0, 2).join(' ');
      setCustomer(firstTwo);
      setItemText(cleanWords);
    }
    invalidateReceiptSeal();
  };

  const parchiNo = `PR-${String((amountPkr % 899) + 101)}`;

  const handleStampSeal = async () => {
    if (!Number.isSafeInteger(amountPkr) || amountPkr < 50) {
      setHashError('Enter a whole PKR amount of at least 50 before fingerprinting this receipt.');
      return;
    }

    const revision = ++receiptRevision.current;
    const createdAt = new Date().toISOString();
    const receiptContent = JSON.stringify({
      version: 1,
      parchiNo,
      shopName,
      customer: customer.trim(),
      customerPhone: customerPhone.replace(/\D/g, ''),
      itemText: itemText.trim(),
      amountPkr,
      entryType: modeType,
      witness: witness.trim(),
      customerSignature,
      createdAt,
    });

    setHashBusy(true);
    setHashError(null);
    setStamped(false);
    setReceiptHash('');
    try {
      const fingerprint = await sha256Hex(receiptContent);
      if (receiptRevision.current !== revision) return;
      setReceiptHash(fingerprint);
      setSealedAt(new Date(createdAt).toLocaleTimeString('en-PK'));
      setStamped(true);
      triggerApexHaptic('tap', 'Local SHA-256 receipt fingerprint created');
    } catch (error) {
      if (receiptRevision.current === revision) {
        setHashError(error instanceof Error ? error.message : 'Could not create receipt fingerprint.');
      }
    } finally {
      if (receiptRevision.current === revision) setHashBusy(false);
    }
  };

  const cleanWaDigits = customerPhone.replace(/\D/g, '');
  const intlWa = cleanWaDigits.startsWith('0') ? `92${cleanWaDigits.slice(1)}` : cleanWaDigits;
  const waText = encodeURIComponent(
    `Assalam-o-Alaikum, BolMizan Parchi #${parchiNo}\nShop: ${shopName}\nCustomer: ${customer}\nType: ${modeType}\nGoods: ${itemText}\nAmount: PKR ${amountPkr.toLocaleString('en-US')}\nWitness: ${witness}\nLocal SHA-256 fingerprint: ${receiptHash || 'not generated'}`,
  );
  const waHref = `https://wa.me/${intlWa || '923007860786'}?text=${waText}`;

  const heading =
    script === 'ur'
      ? 'فوری منڈی پرچی کا مسودہ'
      : script === 'sd'
        ? 'فوري منڊي پرچي جو مسودو'
        : 'Local Parchi Draft Preview';

  const kicker =
    script === 'ur'
      ? 'مقامی پرچی کا مسودہ · ادائیگی کی تصدیق نہیں'
      : script === 'sd'
        ? 'مقامي پرچي جو مسودو · ادائيگي جي تصديق ناهي'
        : 'Local draft only · no payment QR or ledger save';

  return (
    <section className="relative rounded-2xl overflow-hidden border border-[#F59E0B]/35 bg-[#06151B] shadow-2xl">
      <div className="ajrak-mosaic-band" />
      <AjrakClothPattern accentHex="#F59E0B" opacityClass="opacity-[0.07]" />
      <HalaKashiCornerOrnament className="absolute top-3 right-3 rotate-90 opacity-55" />

      <div className="relative z-10 p-6 sm:p-8 grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
        {/* Left: Rapid Shopkeeper Composer */}
        <div className="lg:col-span-6 space-y-5">
          <div className="space-y-1.5">
            <p
              dir={script === 'en' ? 'ltr' : 'rtl'}
              className="text-xs font-medium text-[#5EEAD4]"
            >
              {kicker}
            </p>
            <h2
              dir={script === 'en' ? 'ltr' : 'rtl'}
              className="font-display text-2xl sm:text-3xl font-bold text-white"
            >
              {heading}
            </h2>
          </div>

          <div className="flex gap-2">
            <input
              type="text"
              value={quickLine}
              onChange={(e) => setQuickLine(e.target.value)}
              placeholder="Write naturally: Name, Item, PKR..."
              className="flex-1 rounded-lg border border-[#14B8A6]/35 ajrak-well px-3 py-2 text-xs text-white"
            />
            <button
              type="button"
              onClick={() => applyQuickLine(quickLine)}
              className="px-3 py-2 rounded-lg bg-[#0F766E] text-xs font-bold text-white whitespace-nowrap shrink-0"
            >
              Auto-Fill Parchi
            </button>
          </div>

          <div className="flex flex-wrap gap-2">
            {PRESET_BASKETS.map((preset) => (
              <button
                key={preset.label}
                type="button"
                onClick={() => {
                  setItemText(preset.item);
                  setAmountPkr(preset.amount);
                  invalidateReceiptSeal();
                }}
                className="px-2.5 py-1.5 rounded-lg border border-[#F59E0B]/25 bg-[#030D12] text-xs font-medium text-[#FDE68A] hover:border-[#F59E0B]/60 transition-colors"
              >
                {preset.label}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            <label className="space-y-1">
              <span className="text-[#F8F7F3]/70">Customer / Farmer Name</span>
              <input
                type="text"
                value={customer}
                onChange={(e) => {
                  setCustomer(e.target.value);
                  invalidateReceiptSeal();
                }}
                className="w-full rounded-lg border border-[#F59E0B]/25 ajrak-well px-3 py-2 text-white"
              />
            </label>
            <label className="space-y-1">
              <span className="text-[#F8F7F3]/70">WhatsApp Mobile</span>
              <input
                type="tel"
                value={customerPhone}
                onChange={(e) => {
                  setCustomerPhone(e.target.value);
                  invalidateReceiptSeal();
                }}
                className="w-full rounded-lg border border-[#F59E0B]/25 ajrak-well px-3 py-2 font-mono-tabular text-white"
              />
            </label>
            <label className="space-y-1 sm:col-span-2">
              <span className="text-[#F8F7F3]/70">Goods &amp; Weight</span>
              <input
                type="text"
                value={itemText}
                onChange={(e) => {
                  setItemText(e.target.value);
                  invalidateReceiptSeal();
                }}
                className="w-full rounded-lg border border-[#F59E0B]/25 ajrak-well px-3 py-2 text-white"
              />
            </label>
            <label className="space-y-1">
              <span className="text-[#F8F7F3]/70">Amount (PKR)</span>
              <input
                type="number"
                min={50}
                value={amountPkr}
                onChange={(e) => {
                  setAmountPkr(Number(e.target.value) || 0);
                  invalidateReceiptSeal();
                }}
                className="w-full rounded-lg border border-[#F59E0B]/25 ajrak-well px-3 py-2 font-mono-tabular text-[#FDE68A] font-bold"
              />
            </label>
            <label className="space-y-1">
              <span className="text-[#F8F7F3]/70">Entry Type</span>
              <select
                value={modeType}
                onChange={(e) => {
                  setModeType(e.target.value as typeof modeType);
                  invalidateReceiptSeal();
                }}
                className="w-full rounded-lg border border-[#F59E0B]/25 ajrak-well px-3 py-2 text-white"
              >
                <option value="Udhaar (Credit)">Udhaar (Receivable)</option>
                <option value="Wasooli (Paid)">Wasooli (Paid Cash)</option>
              </select>
            </label>
            <label className="space-y-1 sm:col-span-2">
              <span className="text-[#F8F7F3]/70">Optional witness name (not verified)</span>
              <input
                type="text"
                value={witness}
                onChange={(e) => {
                  setWitness(e.target.value);
                  invalidateReceiptSeal();
                }}
                className="w-full rounded-lg border border-[#F59E0B]/25 ajrak-well px-3 py-2 text-white"
              />
            </label>
            <CustomerSignaturePad
              value={customerSignature}
              onChange={(signature) => {
                invalidateReceiptSeal();
                setCustomerSignature(signature);
              }}
            />
          </div>

          <div className="flex flex-wrap items-center gap-3 pt-1">
            <button
              type="button"
              onClick={() => void handleStampSeal()}
              disabled={hashBusy || amountPkr < 50}
              className="kashi-btn inline-flex items-center gap-2 rounded-lg bg-[#9B1C2E] hover:bg-[#B91C1C] disabled:cursor-not-allowed disabled:opacity-45 px-4 py-2.5 text-xs font-bold text-white"
            >
              <Stamp className="w-4 h-4" />
              <span>{hashBusy ? 'Fingerprinting…' : stamped ? 'Recompute SHA-256 Fingerprint' : 'Create Local SHA-256 Fingerprint'}</span>
            </button>

            <a
              href={waHref}
              target="_blank"
              rel="noopener noreferrer"
              className="kashi-btn inline-flex items-center gap-2 rounded-lg bg-[#0F766E] hover:bg-[#14B8A6] px-4 py-2.5 text-xs font-bold text-white"
            >
              <MessageCircle className="w-4 h-4" />
              <span>Open WhatsApp Draft</span>
            </a>

            <button
              type="button"
              onClick={() => window.print()}
              className="inline-flex items-center gap-1.5 rounded-lg border border-[#F59E0B]/35 px-3.5 py-2.5 text-xs font-semibold text-[#FDE68A] hover:bg-[#F59E0B]/10"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Print</span>
            </button>
          </div>
          {hashError && <p role="alert" className="text-xs text-rose-300">{hashError}</p>}
        </div>

        {/* Right: Authentic Warm-Ivory Cotton Paper Sindhi Mandi Parchi */}
        <div className="lg:col-span-6">
          <motion.div
            animate={stamped ? { y: [-2, 0] } : undefined}
            transition={{ duration: 0.25 }}
            className="relative rounded-xl overflow-hidden bg-[#FAF5E8] text-[#0D2327] shadow-[0_28px_56px_-14px_rgba(0,0,0,0.85)] border-2 border-[#C89D54]"
          >
            <div className="ajrak-mosaic-band" />
            <AjrakClothPattern
              accentHex="#9B1C2E"
              secondaryHex="#0F766E"
              opacityClass="opacity-[0.065]"
              blendClass="mix-blend-multiply"
            />
            {stamped && (
              <div
                aria-hidden="true"
                className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_80%_80%,rgba(245,158,11,0.16),transparent_60%)]"
              />
            )}

            <div className="relative z-10 p-5 sm:p-6 space-y-4">
              <div className="flex items-start justify-between gap-3 border-b border-dashed border-[#0D2327]/25 pb-3.5">
                <div>
                  <div className="text-[11px] font-mono-tabular uppercase tracking-wider text-[#9B1C2E] font-bold">
                    BolMizan · Local Parchi Draft
                  </div>
                  <h3 className="font-display text-lg font-bold text-[#0D2327] mt-0.5">
                    {shopName}
                  </h3>
                  <div className="text-xs text-[#0D2327]/70">
                    Sakrand, Shaheed Benazirabad · Parchi #{parchiNo}
                  </div>
                </div>
                <div className="text-right font-mono-tabular text-xs">
                  <div className="font-bold text-[#0F766E]">{modeType}</div>
                  <div className="text-[11px] text-[#0D2327]/60">
                    {new Date().toLocaleDateString('en-PK')}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-12 gap-4 items-center">
                <div className="sm:col-span-8 space-y-2 text-xs">
                  <div className="flex justify-between gap-2 border-b border-[#0D2327]/10 pb-1.5">
                    <span className="text-[#0D2327]/65">Party / گاہڪ:</span>
                    <span className="font-bold text-[#0D2327]">{customer || 'Walk-in Buyer'}</span>
                  </div>
                  <div className="flex justify-between gap-2 border-b border-[#0D2327]/10 pb-1.5">
                    <span className="text-[#0D2327]/65">Goods / مال:</span>
                    <span className="font-semibold text-[#0D2327] text-right">{itemText}</span>
                  </div>
                  <div className="flex justify-between gap-2 border-b border-[#0D2327]/10 pb-1.5">
                    <span className="text-[#0D2327]/65">Witness name (unverified):</span>
                    <span className="font-medium text-[#0D2327] text-right">{witness}</span>
                  </div>
                  <div className="flex items-center justify-between gap-2 border-b border-[#0D2327]/10 pb-1.5">
                    <span className="text-[#0D2327]/65">Customer mark:</span>
                    {customerSignature ? (
                      <img src={customerSignature} alt="Customer-drawn acknowledgement" className="h-12 max-w-32 object-contain" />
                    ) : (
                      <span className="text-xs italic text-[#0D2327]/45">Not provided</span>
                    )}
                  </div>
                  <div className="flex justify-between items-baseline gap-2 pt-1">
                    <span className="font-semibold text-[#0D2327]">Net Mizan Payable:</span>
                    <span className="font-mono-tabular text-2xl font-extrabold text-[#9B1C2E]">
                      PKR {amountPkr.toLocaleString('en-US')}
                    </span>
                  </div>
                </div>

                <div className="sm:col-span-4 flex flex-col items-center justify-center rounded-lg border border-amber-700/25 bg-amber-50/80 p-3 text-center">
                  <ShieldCheck className="h-9 w-9 text-amber-800" />
                  <span className="mt-2 text-[10px] font-bold uppercase text-amber-900">Draft only</span>
                  <span className="mt-1 text-[10px] leading-4 text-amber-900/80">
                    Not saved to the shop ledger. No payment QR or settlement is generated.
                  </span>
                </div>
              </div>

              {/* Ink Stamp & Verification Footer */}
              <div className="space-y-2 border-t border-dashed border-[#0D2327]/25 pt-3 text-[11px]">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="font-mono-tabular text-[#0D2327]/75 flex items-center gap-1.5">
                    <ShieldCheck className="w-3.5 h-3.5 text-[#0F766E]" />
                    <span className="break-all">
                      {receiptHash ? `Local SHA-256 fingerprint: ${receiptHash}` : 'Local SHA-256 fingerprint not generated'}
                      {sealedAt ? ` · ${sealedAt}` : ''}
                    </span>
                  </div>

                  <motion.div
                    initial={false}
                    animate={stamped ? { scale: [1.35, 0.96, 1], rotate: [-12, -5], opacity: 1 } : { opacity: 0.72, rotate: -4 }}
                    transition={{ duration: 0.25 }}
                    className={`inline-flex items-center gap-1.5 rounded border-2 px-2.5 py-1 font-bold tracking-wide uppercase ${stamped
                      ? 'border-[#9B1C2E] text-[#9B1C2E] bg-[#9B1C2E]/5'
                      : 'border-[#0D2327]/30 text-[#0D2327]/60'
                      }`}
                  >
                    {stamped && <Check className="w-3.5 h-3.5" />}
                    <span>{stamped ? 'LOCAL RECEIPT HASHED' : 'UNSTAMPED DRAFT'}</span>
                  </motion.div>
                </div>

                <div className="flex items-center justify-between text-[11px] text-[#0D2327]/70 font-medium">
                  <span>Honest Measure, Zero Interest</span>
                  <span dir="rtl">اوطاق ۽ بازار جو ايماندار عهد — نه وياج، نه دوکو</span>
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
};
