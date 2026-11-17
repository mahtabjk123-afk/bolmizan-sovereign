import React, { useState } from 'react';
import {
  AlertTriangle,
  Bot,
  FileSearch,
  Power,
  ShieldAlert,
  ShieldCheck,
} from 'lucide-react';
import { triggerApexHaptic } from '../utils/haptics';
import { getSovereignCopy, type SupportedSovereignLanguage } from '../utils/i18nSovereign';
import {
  AjrakClothPattern,
  AjrakLoomDivider,
  ChromaticKashiRule,
  HalaKashiCornerOrnament,
} from './SovereignArt';

interface ScamReviewResult {
  isScam: boolean;
  riskScore: number;
  detectedSignals: string[];
  latencyMs: number;
  warning: string;
}

function speakAlert(text: string, language: string) {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
  window.speechSynthesis.cancel();
  const utter = new SpeechSynthesisUtterance(text);
  utter.lang = language;
  window.speechSynthesis.speak(utter);
}

export const SovereignShields: React.FC = () => {
  const [language, setLanguage] = useState<SupportedSovereignLanguage>('en');
  const copy = getSovereignCopy(language);

  const [transcript, setTranscript] = useState('');
  const [firewallBusy, setFirewallBusy] = useState(false);
  const [firewallResult, setFirewallResult] = useState<ScamReviewResult | null>(null);
  const [firewallError, setFirewallError] = useState<string | null>(null);

  const submitFirewallScan = async (textToScan: string) => {
    if (!textToScan.trim()) return;
    setFirewallBusy(true);
    setFirewallError(null);

    try {
      const res = await fetch('/api/scam/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ message: textToScan }),
      });
      if (!res.ok) {
        throw new Error(res.status === 401 ? 'Please sign in again to scan this message.' : `Scanner request failed (HTTP ${res.status}).`);
      }
      const analysis = await res.json() as {
        isScam: boolean;
        riskScore: number;
        detectedSignals: string[];
        latencyMs: number;
        urduWarning: string;
      };
      const flagged = analysis.isScam;
      const warning = flagged
        ? 'Warning: possible scam patterns detected. Verify through the institution’s official channel; this heuristic cannot confirm fraud.'
        : 'No configured text pattern matched. This does not verify the message or sender as safe.';
      const data: ScamReviewResult = {
        isScam: flagged,
        riskScore: analysis.riskScore,
        detectedSignals: analysis.detectedSignals,
        latencyMs: analysis.latencyMs,
        warning,
      };
      setFirewallResult(data);
      if (flagged) {
        triggerApexHaptic('security_violation', 'Possible scam text patterns found');
        speakAlert(language === 'ur' ? analysis.urduWarning : copy.scamBlockedAlert, copy.speechLanguage);
      } else {
        triggerApexHaptic('tap', 'No configured text rule matched');
      }
    } catch (err) {
      setFirewallError(err instanceof Error ? err.message : 'Could not scan this message. Try again.');
    } finally {
      setFirewallBusy(false);
    }
  };

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

      {/* Unavailable control panel; no provider integration is connected. */}
      <section className="relative kashi-card rounded-xl overflow-hidden border border-[#F59E0B]/30 ajrak-moving-glass">
        <ChromaticKashiRule />
        <AjrakClothPattern accentHex="#9B1C2E" opacityClass="opacity-[0.09]" />
        <HalaKashiCornerOrnament className="absolute top-3 right-3 rotate-90 opacity-50" />
        <div className="relative z-10 p-6 space-y-5">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            <div className="space-y-1">
              <p className="text-xs font-medium text-[#5EEAD4]">
                Internal control only; no external provider integration is connected.
              </p>
              <h2 className="font-display text-2xl font-bold text-white flex items-center gap-2">
                <Power className="w-5 h-5 text-[#F59E0B]" />
                <span>Payment-rail controls</span>
              </h2>
            </div>

            <p className="rounded-lg border border-amber-500/30 bg-amber-950/30 px-3 py-2 text-xs text-amber-100">
              Kill-switch controls unavailable — this server cannot freeze accounts, payment rails, or agent credentials.
            </p>
          </div>

        </div>
      </section>

      <AjrakLoomDivider label="Text Scam Signals & Document Review" />

      {/* Heuristic text review and unavailable document analysis. */}
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
                  setTranscript(sample);
                  void submitFirewallScan(sample);
                }}
                className="px-3 py-1.5 rounded-lg border border-rose-500/40 bg-rose-950/40 text-xs text-rose-200"
              >
                Test Fake 8171 Bait
              </button>
              <button
                type="button"
                onClick={() => {
                  const sample = 'BISP payment pending. Reply with your OTP to release PKR 25000.';
                  setTranscript(sample);
                  void submitFirewallScan(sample);
                }}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-amber-500/40 bg-amber-950/40 text-xs text-amber-200"
              >
                <Bot className="w-3.5 h-3.5" /> Test Credential-Harvesting Pattern
              </button>
              <button
                type="button"
                onClick={() => {
                  const sample =
                    'Sakrand Mandi Deal: 25 Tons Super Kernel Basmati Rice, 0% Riba Murabaha confirmed.';
                  setTranscript(sample);
                  void submitFirewallScan(sample);
                }}
                className="px-3 py-1.5 rounded-lg border border-emerald-500/40 bg-emerald-950/40 text-xs text-emerald-200"
              >
                Test Low-Signal Message
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
                onChange={(e) => setTranscript(e.target.value)}
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

            {firewallError && (
              <p role="alert" className="rounded-lg border border-rose-500/40 bg-rose-950/40 p-3 text-xs text-rose-100">
                {firewallError}
              </p>
            )}

            {firewallResult && (
              <div
                className={`rounded-xl border p-4 space-y-3 text-xs ${firewallResult.isScam
                  ? 'border-rose-500/50 bg-rose-950/50 text-rose-100'
                  : 'border-amber-500/40 bg-amber-950/40 text-amber-100'
                  }`}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="inline-flex items-center gap-2 font-display text-sm font-bold">
                    {firewallResult.isScam ? (
                      <AlertTriangle className="w-4 h-4 text-rose-400" />
                    ) : (
                      <ShieldCheck className="w-4 h-4 text-amber-300" />
                    )}
                    <span>{firewallResult.isScam ? copy.scamBlockedAlert : copy.scanCompleted}</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => speakAlert(firewallResult.warning, copy.speechLanguage)}
                    className="px-2.5 py-1 rounded border border-white/25 bg-black/25 text-[11px] font-semibold hover:bg-black/40"
                  >
                    Listen ({copy.languageName})
                  </button>
                </div>

                {firewallResult.isScam && (
                  <div className="rounded-lg bg-black/30 p-3 space-y-1 text-[11px] text-rose-100/95">
                    <div className="font-bold text-[#FDE68A]">What to do right now:</div>
                    <div>1. Never read back any 4 or 6-digit OTP or PIN to a caller.</div>
                    <div>2. Verify requests through the institution’s official website or published phone number.</div>
                    <div>3. If you shared account credentials, contact your bank or wallet provider directly; this app cannot freeze accounts or transfers.</div>
                  </div>
                )}

                <p>{firewallResult.warning}</p>

                <div className="pt-2 border-t border-white/15 flex flex-wrap items-center justify-between gap-2 font-mono-tabular text-[11px] opacity-80">
                  <span>
                    {firewallResult.detectedSignals.length > 0
                      ? `Possible text signals: ${firewallResult.detectedSignals.join(' · ')}`
                      : 'No configured text pattern matched; not verified safe'}
                  </span>
                  <span>
                    Heuristic risk score {firewallResult.riskScore} / 100 (not a calibrated probability) · {firewallResult.latencyMs} ms
                  </span>
                </div>
              </div>
            )}
          </div>
        </section>

        {/* Document verification is not implemented by the active server. */}
        <section className="relative kashi-card rounded-xl overflow-hidden border border-[#F59E0B]/30 ajrak-moving-glass">
          <ChromaticKashiRule />
          <AjrakClothPattern accentHex="#F59E0B" opacityClass="opacity-[0.08]" />
          <div className="relative z-10 p-6 space-y-4">
            <div>
              <p className="text-xs font-medium text-[#5EEAD4]">
                {copy.truthFilterTitle} · unavailable in this server build
              </p>
              <h3 className="font-display text-xl font-bold text-white flex items-center gap-2">
                <FileSearch className="w-5 h-5 text-[#F59E0B]" />
                <span>{copy.truthFilterTitle}</span>
              </h3>
            </div>

            <p className="rounded-lg border border-amber-500/30 bg-amber-950/30 px-3 py-3 text-xs leading-relaxed text-amber-100">
              Document and invoice analysis unavailable — this server build has no truth-filter API. Verify documents and calculations independently; this application cannot authenticate a document or establish religious, legal, or financial compliance.
            </p>

          </div>
        </section>
      </div>
    </div>
  );
};
