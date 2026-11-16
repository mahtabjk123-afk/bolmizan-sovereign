import React, { useRef, useState } from 'react';
import {
  AlertTriangle,
  Bot,
  FileSearch,
  Lock,
  Power,
  ShieldAlert,
  ShieldCheck,
  Unlock,
} from 'lucide-react';
import type {
  IntentVerificationResult,
  SovereignSystemState,
  TruthFilterResult,
} from '../types/sovereign';
import { triggerApexHaptic } from '../utils/haptics';
import { getSovereignCopy, type SupportedSovereignLanguage } from '../utils/i18nSovereign';
import {
  AjrakClothPattern,
  AjrakLoomDivider,
  ChromaticKashiRule,
  HalaKashiCornerOrnament,
} from './SovereignArt';

interface SovereignShieldsProps {
  state: SovereignSystemState;
  onStateRefresh: () => Promise<void>;
}

function speakAlert(text: string, language: string) {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
  window.speechSynthesis.cancel();
  const utter = new SpeechSynthesisUtterance(text);
  utter.lang = language;
  window.speechSynthesis.speak(utter);
}

export const SovereignShields: React.FC<SovereignShieldsProps> = ({
  state,
  onStateRefresh,
}) => {
  const [language, setLanguage] = useState<SupportedSovereignLanguage>('en');
  const copy = getSovereignCopy(language);
  const [pin, setPin] = useState('');
  const [ksError, setKsError] = useState<string | null>(null);
  const [ksBusy, setKsBusy] = useState(false);

  const [transcript, setTranscript] = useState('');
  const [firewallBusy, setFirewallBusy] = useState(false);
  const [firewallResult, setFirewallResult] = useState<IntentVerificationResult | null>(null);
  const keystrokeTimesRef = useRef<number[]>([]);

  const [truthDocType, setTruthDocType] = useState<'whatsapp-forward' | 'media-claim' | 'digital-invoice'>('whatsapp-forward');
  const [truthText, setTruthText] = useState('');
  const [claimedTotal, setClaimedTotal] = useState('50000');
  const [qty, setQty] = useState('10');
  const [unitPrice, setUnitPrice] = useState('4200');
  const [truthBusy, setTruthBusy] = useState(false);
  const [truthResult, setTruthResult] = useState<TruthFilterResult | null>(null);

  const handleToggleKillSwitch = async (action: 'freeze' | 'restore') => {
    setKsBusy(true);
    setKsError(null);
    try {
      const res = await fetch('/api/sovereign/kill-switch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin, action }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setKsError(data.error || 'Invalid Sovereign PIN.');
        triggerApexHaptic('error', 'Kill-Switch PIN Rejected');
        return;
      }
      triggerApexHaptic(
        action === 'freeze' ? 'agi_agent_lockdown' : 'sync_steady',
        action === 'freeze' ? 'Local demo state frozen' : 'Local demo state restored',
      );
      await onStateRefresh();
    } finally {
      setKsBusy(false);
    }
  };

  const submitFirewallScan = async (textToScan: string, customIntervals?: number[]) => {
    if (!textToScan.trim()) return;
    setFirewallBusy(true);
    let intervals = customIntervals ?? [];
    if (!customIntervals) {
      const times = keystrokeTimesRef.current;
      for (let i = 1; i < times.length; i++) intervals.push(times[i] - times[i - 1]);
    }

    try {
      const res = await fetch('/api/scam-shield/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transcript: textToScan, keystrokeIntervalsMs: intervals }),
      });
      if (res.ok) {
        const data = (await res.json()) as IntentVerificationResult;
        setFirewallResult(data);
        if (data.decision === 'SEALED') {
          triggerApexHaptic('tap', 'No configured text rule matched');
        } else {
          triggerApexHaptic('security_violation', 'Potential scam text signals found');
          const alertText = language === 'ur'
            ? data.alertUrdu
            : language === 'sd'
              ? data.alertSindhi
              : language === 'en'
                ? data.alertEnglish
                : copy.scamBlockedAlert;
          speakAlert(alertText, copy.speechLanguage);
        }
        await onStateRefresh();
      }
    } finally {
      setFirewallBusy(false);
    }
  };

  const handleRunTruthFilter = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!truthText.trim()) return;
    setTruthBusy(true);
    try {
      const payload =
        truthDocType === 'digital-invoice'
          ? {
            content: truthText,
            documentType: truthDocType,
            claimedTotal: Number(claimedTotal),
            lineItems: [{ label: 'Sakrand Trade Lot', qty: Number(qty), unitPrice: Number(unitPrice) }],
          }
          : { content: truthText, documentType: truthDocType };

      const res = await fetch('/api/sovereign/truth-filter', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        const data = (await res.json()) as TruthFilterResult;
        setTruthResult(data);
        if (data.verdict === 'VERIFIED') {
          triggerApexHaptic('tap', 'Text and arithmetic checks completed');
        } else {
          triggerApexHaptic('truth_tamper', 'Riba / Tamper Alert');
        }
      }
    } finally {
      setTruthBusy(false);
    }
  };

  const categories = Array.from(new Set(state.killSwitch.rails.map((r) => r.category)));

  return (
    <div dir={copy.direction} lang={language} className="space-y-8">
      <header className="flex flex-col gap-3 rounded-xl border border-[#14B8A6]/25 ajrak-well p-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-display text-xl font-bold text-white">{copy.shieldTitle}</h1>
          <p className="mt-1 max-w-3xl text-xs text-[#F8F7F3]/70">{copy.shieldDescription}</p>
          <p className="mt-1 max-w-3xl text-[11px] text-amber-200/75">{copy.offlineAppShellNote}</p>
        </div>
        <label className="flex shrink-0 items-center gap-2 text-xs text-[#F8F7F3]/75">
          <span>Language</span>
          <select
            aria-label="Display language"
            value={language}
            onChange={(event) => setLanguage(event.target.value as SupportedSovereignLanguage)}
            className="rounded-lg border border-[#14B8A6]/30 ajrak-well px-3 py-2 text-white"
          >
            <option value="en">English</option>
            <option value="ur">اردو</option>
            <option value="sd">سنڌي</option>
            <option value="ar">العربية</option>
          </select>
        </label>
      </header>

      {/* Local-only demo controls; no external payment provider is connected. */}
      <section className="relative kashi-card rounded-xl overflow-hidden border border-[#F59E0B]/30 ajrak-moving-glass">
        <ChromaticKashiRule />
        <AjrakClothPattern accentHex="#9B1C2E" opacityClass="opacity-[0.09]" />
        <HalaKashiCornerOrnament className="absolute top-3 right-3 rotate-90 opacity-50" />
        <div className="relative z-10 p-6 space-y-5">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            <div className="space-y-1">
              <p className="text-xs font-medium text-[#5EEAD4]">
                {copy.localControlNote}
              </p>
              <h2 className="font-display text-2xl font-bold text-white flex items-center gap-2">
                <Power className="w-5 h-5 text-[#F59E0B]" />
                <span>Local Demo Controls</span>
              </h2>
              <p className="text-xs text-[#F8F7F3]/75">
                Local demo state only · Status:{' '}
                <strong className={state.killSwitch.active ? 'text-rose-400' : 'text-emerald-400'}>
                  {state.killSwitch.active ? copy.frozenStatus : copy.activeStatus}
                </strong>
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <input
                type="password"
                maxLength={12}
                value={pin}
                onChange={(e) => setPin(e.target.value)}
                aria-label={copy.controlPinLabel}
                placeholder={copy.controlPinLabel}
                className="w-28 rounded-lg border border-[#F59E0B]/35 ajrak-well px-3 py-2 text-xs font-mono-tabular text-white"
              />
              <button
                type="button"
                disabled={ksBusy || state.killSwitch.active}
                onClick={() => void handleToggleKillSwitch('freeze')}
                className="kashi-btn inline-flex items-center gap-1.5 rounded-lg bg-rose-700 hover:bg-rose-600 disabled:opacity-45 px-4 py-2 text-xs font-bold text-white"
              >
                <Lock className="w-3.5 h-3.5" /> {copy.freezeControls}
              </button>
              <button
                type="button"
                disabled={ksBusy || !state.killSwitch.active}
                onClick={() => void handleToggleKillSwitch('restore')}
                className="kashi-btn inline-flex items-center gap-1.5 rounded-lg bg-emerald-700 hover:bg-emerald-600 disabled:opacity-45 px-4 py-2 text-xs font-bold text-white"
              >
                <Unlock className="w-3.5 h-3.5" /> {copy.restoreControls}
              </button>
            </div>
          </div>

          {ksError && <p className="text-xs font-semibold text-rose-400">{ksError}</p>}

          <p className="text-[11px] leading-5 text-amber-100/75">
            The following provider names are illustrative interface data only. No listed bank, wallet, payment rail, or agent credential is connected to this control.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
            {categories.map((cat) => (
              <div
                key={cat}
                className="rounded-xl border border-[#F59E0B]/20 ajrak-well p-3.5 space-y-2"
              >
                <div className="text-[11px] font-bold text-[#FDE68A]">{cat}</div>
                <div className="space-y-1.5">
                  {state.killSwitch.rails
                    .filter((r) => r.category === cat)
                    .map((rail) => (
                      <div
                        key={rail.id}
                        className="flex items-center justify-between text-[11px] font-mono-tabular"
                      >
                        <span className="text-[#F8F7F3]/85 truncate pr-2">{rail.name}</span>
                        <span
                          className={`shrink-0 text-[10px] font-bold ${rail.frozen ? 'text-rose-400' : 'text-emerald-300'
                            }`}
                        >
                          {rail.frozen ? 'FROZEN' : `${rail.latencyMs}ms`}
                        </span>
                      </div>
                    ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <AjrakLoomDivider label="Cognitive Firewall & Quran 2:282 Truth Audit" />

      {/* 2. Cognitive Anti-Scam Firewall & Quran 2:282 Truth Filter */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {/* Cognitive Anti-Scam Firewall */}
        <section className="relative kashi-card rounded-xl overflow-hidden border border-rose-500/35 ajrak-moving-glass">
          <ChromaticKashiRule />
          <AjrakClothPattern accentHex="#9B1C2E" opacityClass="opacity-[0.085]" />
          <div className="relative z-10 p-6 space-y-4">
            <div>
              <p className="text-xs font-medium text-rose-300">
                {copy.scamScannerTitle} · heuristic text analysis
              </p>
              <h3 className="font-display text-xl font-bold text-white flex items-center gap-2">
                <ShieldAlert className="w-5 h-5 text-rose-400" />
                <span>{copy.scamScannerTitle}</span>
              </h3>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => {
                  const sample =
                    '8171 Benazir Income Support: Aap ke Rs 25,000 nikle hain, fori apna OTP aur PIN code bhejein warna account block ho jayega.';
                  keystrokeTimesRef.current = [];
                  setTranscript(sample);
                  void submitFirewallScan(sample, [145, 210, 95, 340, 120]);
                }}
                className="px-3 py-1.5 rounded-lg border border-rose-500/40 bg-rose-950/40 text-xs text-rose-200"
              >
                Test Fake 8171 Bait
              </button>
              <button
                type="button"
                onClick={() => {
                  const sample = 'Transfer PKR 250000 to external wallet immediately.';
                  setTranscript(sample);
                  void submitFirewallScan(sample, [25, 25, 25, 25, 25, 25]);
                }}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-amber-500/40 bg-amber-950/40 text-xs text-amber-200"
              >
                <Bot className="w-3.5 h-3.5" /> Simulate Robotic Bot Attack
              </button>
              <button
                type="button"
                onClick={() => {
                  const sample =
                    'Sakrand Mandi Deal: 25 Tons Super Kernel Basmati Rice, 0% Riba Murabaha confirmed.';
                  keystrokeTimesRef.current = [];
                  setTranscript(sample);
                  void submitFirewallScan(sample, [132, 248, 88, 310, 165]);
                }}
                className="px-3 py-1.5 rounded-lg border border-emerald-500/40 bg-emerald-950/40 text-xs text-emerald-200"
              >
                Test Clean Halal Deal
              </button>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                void submitFirewallScan(transcript);
              }}
              className="space-y-3"
            >
              <textarea
                rows={3}
                required
                value={transcript}
                onChange={(e) => {
                  keystrokeTimesRef.current.push(Date.now());
                  setTranscript(e.target.value);
                }}
                placeholder={copy.scamScannerPlaceholder}
                className="w-full rounded-xl border border-rose-500/30 ajrak-well p-3 text-xs text-white"
              />
              <button
                type="submit"
                disabled={firewallBusy}
                className="kashi-btn inline-flex items-center gap-1.5 rounded-lg bg-rose-600 px-4 py-2 text-xs font-bold text-white"
              >
                <ShieldAlert className="w-3.5 h-3.5" />
                <span>{firewallBusy ? 'Analyzing...' : copy.runScamScanner}</span>
              </button>
            </form>

            {firewallResult && (
              <div
                className={`rounded-xl border p-4 space-y-3 text-xs ${firewallResult.decision === 'SEALED'
                  ? 'border-emerald-500/40 bg-emerald-950/40 text-emerald-100'
                  : 'border-rose-500/50 bg-rose-950/50 text-rose-100'
                  }`}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="inline-flex items-center gap-2 font-display text-sm font-bold">
                    {firewallResult.decision === 'SEALED' ? (
                      <ShieldCheck className="w-4 h-4 text-emerald-400" />
                    ) : (
                      <AlertTriangle className="w-4 h-4 text-rose-400" />
                    )}
                    <span>
                      {firewallResult.decision === 'SEALED'
                        ? copy.scanCompleted
                        : copy.scamBlockedAlert}
                    </span>
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      const alertText = language === 'ur'
                        ? firewallResult.alertUrdu
                        : language === 'sd'
                          ? firewallResult.alertSindhi
                          : language === 'en'
                            ? firewallResult.alertEnglish
                            : copy.scamBlockedAlert;
                      speakAlert(alertText, copy.speechLanguage);
                    }}
                    className="px-2.5 py-1 rounded border border-white/25 bg-black/25 text-[11px] font-semibold hover:bg-black/40"
                  >
                    Listen ({copy.languageName})
                  </button>
                </div>

                {firewallResult.decision !== 'SEALED' && (
                  <div className="rounded-lg bg-black/30 p-3 space-y-1 text-[11px] text-rose-100/95">
                    <div className="font-bold text-[#FDE68A]">What to do right now:</div>
                    <div>1. Never read back any 4 or 6-digit OTP or PIN to a caller.</div>
                    <div>2. Verify requests through the institution’s official website or published phone number.</div>
                    <div>3. If you shared account credentials, contact your bank or wallet provider directly; this app cannot freeze accounts or transfers.</div>
                  </div>
                )}

                <p dir="rtl" className="font-semibold text-sm">
                  {firewallResult.alertUrdu}
                </p>
                <p dir="rtl" className="text-xs opacity-90">
                  {firewallResult.alertSindhi}
                </p>
                <p>{firewallResult.alertEnglish}</p>

                <div className="pt-2 border-t border-white/15 flex flex-wrap items-center justify-between gap-2 font-mono-tabular text-[11px] opacity-80">
                  <span>
                    {firewallResult.triggers.length > 0
                      ? `Possible text signals: ${firewallResult.triggers.join(' · ')}`
                      : 'No configured text pattern matched; not verified safe'}
                  </span>
                  <span>
                    Heuristic score {Math.round(firewallResult.bayesianPosterior * 100)} / 100 (not calibrated probability)
                  </span>
                </div>
              </div>
            )}
          </div>
        </section>

        {/* Heuristic text review and arithmetic checks; neither establishes truth or religious compliance. */}
        <section className="relative kashi-card rounded-xl overflow-hidden border border-[#F59E0B]/30 ajrak-moving-glass">
          <ChromaticKashiRule />
          <AjrakClothPattern accentHex="#F59E0B" opacityClass="opacity-[0.08]" />
          <div className="relative z-10 p-6 space-y-4">
            <div>
              <p className="text-xs font-medium text-[#5EEAD4]">
                {copy.truthFilterTitle} · deterministic text and math checks
              </p>
              <h3 className="font-display text-xl font-bold text-white flex items-center gap-2">
                <FileSearch className="w-5 h-5 text-[#F59E0B]" />
                <span>{copy.truthFilterTitle}</span>
              </h3>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => {
                  setTruthDocType('whatsapp-forward');
                  setTruthText(
                    'Guaranteed 500% profit! Forward to 10 groups before deleted. 2% daily compounding late fee applies.',
                  );
                }}
                className="px-3 py-1.5 rounded-lg border border-amber-500/40 bg-amber-950/40 text-xs text-amber-200"
              >
                Test Riba Forward
              </button>
              <button
                type="button"
                onClick={() => {
                  setTruthDocType('digital-invoice');
                  setQty('10');
                  setUnitPrice('4200');
                  setClaimedTotal('50000');
                  setTruthText('Sakrand Rice Mill Invoice #408: 10 Bags Basmati @ PKR 4,200.');
                }}
                className="px-3 py-1.5 rounded-lg border border-rose-500/40 bg-rose-950/40 text-xs text-rose-200"
              >
                Test Tampered Invoice Math
              </button>
            </div>

            <form onSubmit={(e) => void handleRunTruthFilter(e)} className="space-y-3">
              <select
                value={truthDocType}
                onChange={(e) => setTruthDocType(e.target.value as typeof truthDocType)}
                className="w-full rounded-lg border border-[#F59E0B]/25 ajrak-well px-3 py-2 text-xs text-white"
              >
                <option value="whatsapp-forward">WhatsApp Forward</option>
                <option value="media-claim">Media / Contract Claim</option>
                <option value="digital-invoice">Digital Invoice (Line-Item Math Audit)</option>
              </select>

              {truthDocType === 'digital-invoice' && (
                <div className="grid grid-cols-3 gap-2 text-xs font-mono-tabular">
                  <input
                    type="number"
                    value={qty}
                    onChange={(e) => setQty(e.target.value)}
                    placeholder="Qty"
                    className="rounded-lg border border-[#F59E0B]/25 ajrak-well px-3 py-2 text-white"
                  />
                  <input
                    type="number"
                    value={unitPrice}
                    onChange={(e) => setUnitPrice(e.target.value)}
                    placeholder="Unit PKR"
                    className="rounded-lg border border-[#F59E0B]/25 ajrak-well px-3 py-2 text-white"
                  />
                  <input
                    type="number"
                    value={claimedTotal}
                    onChange={(e) => setClaimedTotal(e.target.value)}
                    placeholder="Claimed Total"
                    className="rounded-lg border border-[#F59E0B]/25 ajrak-well px-3 py-2 text-white"
                  />
                </div>
              )}

              <textarea
                rows={3}
                required
                value={truthText}
                onChange={(e) => setTruthText(e.target.value)}
                placeholder={copy.truthFilterPlaceholder}
                className="w-full rounded-xl border border-[#F59E0B]/25 ajrak-well p-3 text-xs text-white"
              />
              <button
                type="submit"
                disabled={truthBusy}
                className="kashi-btn inline-flex items-center gap-1.5 rounded-lg bg-[#0F766E] px-4 py-2 text-xs font-bold text-white"
              >
                <FileSearch className="w-3.5 h-3.5" />
                <span>{truthBusy ? 'Inspecting...' : copy.runTruthFilter}</span>
              </button>
            </form>

            {truthResult && (
              <div
                className={`rounded-xl border p-4 space-y-2 text-xs ${truthResult.verdict === 'VERIFIED'
                  ? 'border-emerald-500/40 bg-emerald-950/40 text-emerald-100'
                  : 'border-amber-500/50 bg-amber-950/40 text-amber-100'
                  }`}
              >
                <div className="flex items-center justify-between font-bold">
                  <span>{truthResult.verdict}</span>
                  <span className="font-mono-tabular">
                    Manipulation Risk: {Math.round(truthResult.manipulationScore * 100)}%
                  </span>
                </div>
                <p>{truthResult.summary}</p>
                {truthResult.mathCheck.discrepancy > 0 && (
                  <p className="font-mono-tabular text-rose-300">
                    Math Audit: Computed PKR {truthResult.mathCheck.computedTotal.toLocaleString('en-US')} vs Claimed PKR {truthResult.mathCheck.claimedTotal.toLocaleString('en-US')}
                  </p>
                )}
                {truthResult.ribaClauses.length > 0 && (
                  <p className="text-rose-300">Riba Flags: {truthResult.ribaClauses.join(' · ')}</p>
                )}
                <p className="font-mono-tabular text-[10px] opacity-80">
                  SHA-256: {truthResult.hashCheck.computedSha256.slice(0, 28)}...
                </p>
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
};
