import { SovereignAuthGate } from './components/SovereignAuthGate';
import { IsefMasterDashboard } from './components/IsefMasterDashboard';
import React, { lazy, Suspense, useCallback, useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { ArrowLeft, Award, RefreshCw } from 'lucide-react';
import { AjrakCursorTrail } from './components/AjrakCursorTrail';
import { AjrakLivingStage } from './components/AjrakLivingStage';
import { AmbientAjrakCanvas } from './components/AmbientAjrakCanvas';
import { CinematicDirectorStage } from './components/CinematicDirectorStage';
import { DignityImpactRibbon } from './components/DignityImpactRibbon';
import { GoldDustOverlay } from './components/GoldDustOverlay';
import { IndusCulturalWave } from './components/IndusCulturalWave';
import { JudgePassportModal } from './components/JudgePassportModal';
import { SindhCultureGallery } from './components/SindhCultureGallery';
import {
  AjrakBlockBorder,
  AjrakClothPattern,
  AjrakLoomDivider,
  HalaKashiCornerOrnament,
} from './components/SovereignArt';
const SovereignShields = lazy(() => import('./components/SovereignShields').then((module) => ({ default: module.SovereignShields })));
const TreasuryOperations = lazy(() => import('./components/TreasuryOperations').then((module) => ({ default: module.TreasuryOperations })));
const VeritasLedger = lazy(() => import('./components/VeritasLedger').then((module) => ({ default: module.VeritasLedger })));
const VoiceMizanWorkspace = lazy(() => import('./components/VoiceMizanWorkspace').then((module) => ({ default: module.VoiceMizanWorkspace })));
const HaqProofWorkbench = lazy(() => import('./components/HaqProofWorkbench').then((module) => ({ default: module.HaqProofWorkbench })));
import type {
  AjrakDyeTheme,
  AudienceMode,
  FXUnit,
  LocaleScript,
  QuickCommandDraft,
  SovereignSystemState,
} from './types/sovereign';
import { triggerApexHaptic } from './utils/haptics';
import { parseExplicitPkrAmount } from './utils/receiptIntegrity';

type OsTab = 'treasury' | 'shields' | 'voice' | 'ledger' | 'haqproof';

const TAB_CONTEXT: Record<Exclude<OsTab, 'treasury'>, { title: string; subtitle: string }> = {
  shields: {
    title: 'Scam-Text Pattern Review',
    subtitle: 'Review text for configured scam patterns. This heuristic cannot authenticate callers, verify documents, determine religious compliance, or freeze bank/payment accounts.',
  },
  voice: {
    title: 'Voice Notes & Drafting Tools',
    subtitle: 'Speech or AI extraction may help prepare a draft. A shopkeeper must check every field; this is not biometric identity verification and does not save ledger entries by itself.',
  },
  ledger: {
    title: 'Ledger Integrity Checks',
    subtitle: 'Inspect the pilot ledger hash chain. A valid hash chain is tamper-evident, not an independent audit, legal witness, or proof of payment.',
  },
  haqproof: {
    title: 'HaqProof Local Prototype',
    subtitle: 'Create and verify self-signed offline proof envelopes and inspect image recompression differences locally. These tools do not prove identity, payment, or image authenticity.',
  },
};

function App() {
  const localHaqProofMode = new URLSearchParams(window.location.search).get('mode') === 'haqproof';
  const [state, setState] = useState<SovereignSystemState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<OsTab>('shields');
  const [audienceMode, setAudienceMode] = useState<AudienceMode>('enterprise');
  const [script, setScript] = useState<LocaleScript>('en');
  const [dyeTheme, setDyeTheme] = useState<AjrakDyeTheme>('indigo');
  const [fxUnit, setFxUnit] = useState<FXUnit>('PKR');
  const [commandDraft, setCommandDraft] = useState<QuickCommandDraft | null>(null);
  const [commandFeedback, setCommandFeedback] = useState<string | null>(null);

  const [directorOpen, setDirectorOpen] = useState(false);
  const [passportOpen, setPassportOpen] = useState(false);

  const refreshState = useCallback(async () => {
    try {
      const res = await fetch('/api/ledger/summary', { credentials: 'same-origin' });
      if (!res.ok) throw new Error(`Server returned HTTP ${res.status}`);
      const summary = await res.json() as { terminalId: string; totalCreditPaisa: number; totalReceivedPaisa: number; netReceivablePaisa: number; entryCount: number; hashChainIntegrity: string; recentEntries?: unknown[] };
      const data: SovereignSystemState = {
        version: 'live-ledger-1',
        headquarters: 'Sakrand, Sindh',
        killSwitch: {
          active: false,
          agentTokensRevoked: false,
          activeAgentTokenCount: 0,
          failedAttempts: 0,
          maxAttempts: 10,
          lockoutUntil: null,
          lastToggledAt: null,
          rails: [],
        },
        deals: [],
        mukasaEdges: [],
        lastMukasaReport: null,
        maalGuard: [],
        wages: [],
        recentIntentSeals: [],
        totals: {
          activeDealsPkr: summary.totalCreditPaisa,
          sadaqahReservePkr: 0,
          wagesPaidPkr: summary.totalReceivedPaisa,
          mukasaClearedTotalPkr: summary.netReceivablePaisa,
          goldEquivalentGrams: 0,
        },
      };
      setState(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to connect to BolMizan backend');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!localHaqProofMode) void refreshState();
  }, [localHaqProofMode, refreshState]);

  const handleModeChange = (nextMode: AudienceMode) => {
    setAudienceMode(nextMode);
    triggerApexHaptic('tap', `Switched to ${nextMode}`);
  };

  const handleScriptChange = (nextScript: LocaleScript) => {
    setScript(nextScript);
    triggerApexHaptic('tap', `Language switched to ${nextScript}`);
  };

  const handleDyeThemeChange = (nextDye: AjrakDyeTheme) => {
    setDyeTheme(nextDye);
    triggerApexHaptic('seal_minted', `Ajrak weave switched to ${nextDye}`);
  };

  const handleFxUnitChange = (nextFx: FXUnit) => {
    setFxUnit(nextFx);
    triggerApexHaptic('tap', `Currency switched to ${nextFx}`);
  };

  const handleSendToParchi = (draft: Omit<QuickCommandDraft, 'id'>) => {
    if (!Number.isSafeInteger(draft.amountPkr) || draft.amountPkr < 50) {
      setActiveTab('treasury');
      setCommandFeedback('Enter a valid PKR amount of at least 50 before preparing a parchi draft.');
      return;
    }
    setCommandDraft({ ...draft, id: Date.now() });
    setActiveTab('treasury');
    setCommandFeedback('Parchi draft prepared for review. It has not been saved to the SQLite ledger.');
    triggerApexHaptic('tap', 'Parchi draft prepared');
    setTimeout(() => {
      document.getElementById('treasury-studio')?.scrollIntoView({ behavior: 'smooth' });
    }, 80);
  };

  const handleUniversalCommand = async (raw: string) => {
    const lower = raw.toLowerCase();
    setCommandFeedback(null);

    if (lower.includes('8171') || lower.includes('otp') || lower.includes('scam') || lower.includes('pin')) {
      setActiveTab('shields');
      triggerApexHaptic('security_violation', 'Routed to Cognitive Firewall');
      return;
    }

    try {
      const res = await fetch('/api/ai/unified-process', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ text: raw }),
      });
      if (res.ok) {
        const parsed = await res.json() as { ledgerDraft?: { urduConfirmation?: string; customerName?: string; amountPaisa?: number; entryType?: string }; scamAnalysis?: { urduWarning?: string; verdict?: string } };
        if (parsed.ledgerDraft?.amountPaisa && parsed.ledgerDraft.customerName) {
          const amountPkr = Math.round(parsed.ledgerDraft.amountPaisa / 100);
          handleSendToParchi({
            customer: parsed.ledgerDraft.customerName,
            item: parsed.ledgerDraft.entryType || 'Ledger draft',
            amountPkr,
            entryType: parsed.ledgerDraft.entryType === 'PAYMENT_RECEIVED' ? 'Wasooli (Paid)' : 'Udhaar (Credit)',
          });
          return;
        }
        if (parsed.scamAnalysis?.urduWarning) {
          setCommandFeedback(parsed.scamAnalysis.urduWarning);
          triggerApexHaptic('security_violation', parsed.scamAnalysis.verdict || 'Risk flagged');
          return;
        }
      }
    } catch {
      // Fallback local parse
    }
    const amt = parseExplicitPkrAmount(raw);
    if (amt === null || amt < 50) {
      setActiveTab('treasury');
      setCommandFeedback('No explicit valid PKR amount was found. Enter one manually; no draft was created.');
      return;
    }
    handleSendToParchi({
      customer: raw.split(/\s+/).slice(0, 2).join(' ') || 'Walk-in Buyer',
      item: raw,
      amountPkr: amt,
      entryType: 'Udhaar (Credit)',
    });
  };

  const handleTabChange = (tab: OsTab) => {
    setActiveTab(tab);
    triggerApexHaptic('tap', `Navigated to ${tab}`);
  };

  const mizanTilt = state
    ? state.killSwitch.active
      ? -12
      : Math.min(8, Math.max(-8, state.deals.length - 3))
    : 0;

  if (localHaqProofMode) {
    return (
      <main className="min-h-screen bg-[#041016] px-4 py-6 text-white sm:px-6">
        <div className="mx-auto max-w-6xl space-y-5">
          <a href="/" className="inline-flex rounded-lg border border-white/20 px-3 py-2 text-xs font-semibold text-slate-200 hover:bg-white/10">
            Back to BolMizan sign-in
          </a>
          <Suspense fallback={<p role="status" className="p-8 text-center text-sm text-slate-200">Loading local prototype…</p>}>
            <HaqProofWorkbench />
          </Suspense>
        </div>
      </main>
    );
  }

  return (
    <SovereignAuthGate>
      <div
        className={`min-h-screen relative flex flex-col ajrak-canvas-bg ajrak-dye-${dyeTheme} text-[#F8F7F3] ${audienceMode === 'sabzi-wala' ? 'ajrak-crimson-mode' : ''
          }`}
      >
        {/* Living Atmospheric Layers */}
        <AmbientAjrakCanvas crimson={audienceMode === 'sabzi-wala'} dyeTheme={dyeTheme} />
        <GoldDustOverlay />
        <AjrakCursorTrail />

        {/* Clean Single-Row 3-Zone Editorial Header */}
        <header className="sticky top-0 z-40 border-b border-[#F59E0B]/20 bg-[#041016]/95">
          <div className="ajrak-mosaic-band" />
          <div className="max-w-7xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between gap-8">
            {/* Zone 1: Single Brand Wordmark */}
            <button
              type="button"
              onClick={() => handleTabChange('treasury')}
              className="font-display text-lg sm:text-xl font-bold tracking-tight text-white whitespace-nowrap shrink-0 hover:text-[#FDE68A] transition-colors"
            >
              BolMizan
            </button>

            {/* Zone 2: Clean Single-Line Nav Links */}
            <nav
              aria-label="Primary Workspace Navigation"
              className="flex items-center gap-5 sm:gap-7 overflow-x-auto text-xs sm:text-sm font-medium"
            >
              <button
                type="button"
                onClick={() => handleTabChange('treasury')}
                className={`whitespace-nowrap shrink-0 py-1 border-b-2 transition-colors ${activeTab === 'treasury'
                  ? 'border-[#F59E0B] text-white font-semibold'
                  : 'border-transparent text-slate-300 hover:text-white'
                  }`}
              >
                Khata &amp; Treasury
              </button>
              <button
                type="button"
                onClick={() => handleTabChange('shields')}
                className={`whitespace-nowrap shrink-0 py-1 border-b-2 transition-colors ${activeTab === 'shields'
                  ? 'border-[#9B1C2E] text-white font-semibold'
                  : 'border-transparent text-slate-300 hover:text-white'
                  }`}
              >
                Shields &amp; Switchboard
              </button>
              <button
                type="button"
                onClick={() => handleTabChange('voice')}
                className={`whitespace-nowrap shrink-0 py-1 border-b-2 transition-colors ${activeTab === 'voice'
                  ? 'border-[#14B8A6] text-white font-semibold'
                  : 'border-transparent text-slate-300 hover:text-white'
                  }`}
              >
                Voice Notes
              </button>
              <button
                type="button"
                onClick={() => handleTabChange('ledger')}
                className={`whitespace-nowrap shrink-0 py-1 border-b-2 transition-colors ${activeTab === 'ledger'
                  ? 'border-[#F59E0B] text-white font-semibold'
                  : 'border-transparent text-slate-300 hover:text-white'
                  }`}
              >
                Audit Ledger
              </button>
              <button
                type="button"
                onClick={() => handleTabChange('haqproof')}
                className={`whitespace-nowrap shrink-0 py-1 border-b-2 transition-colors ${activeTab === 'haqproof'
                  ? 'border-[#14B8A6] text-white font-semibold'
                  : 'border-transparent text-slate-300 hover:text-white'
                  }`}
              >
                HaqProof Lab
              </button>
            </nav>

            {/* Zone 3: Single Primary Action */}
            <div className="no-print shrink-0">
              <button
                type="button"
                onClick={() => setPassportOpen(true)}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-[#0F766E] hover:bg-[#14B8A6] text-xs font-semibold text-white whitespace-nowrap shrink-0 transition-colors"
              >
                <Award className="w-3.5 h-3.5" />
                <span>Judge Passport</span>
              </button>
            </div>
          </div>
        </header>

        {/* Main Content */}
        <main className="relative z-20 flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 py-8 space-y-8">
          <aside role="note" className="rounded-xl border border-amber-400/30 bg-amber-950/25 px-4 py-3 text-xs leading-5 text-amber-100/90">
            Pilot software, not a licensed financial service. No bank or wallet is connected; no payment is initiated, confirmed, or settled. Illustrative screens are not real merchant activity.
          </aside>
          {loading && !state ? (
            <div className="rounded-2xl border border-[#F59E0B]/25 ajrak-moving-glass p-10 text-center">
              <div className="inline-flex items-center gap-2 text-sm font-semibold text-[#FDE68A]">
                <RefreshCw className="w-4 h-4 animate-spin" />
                <span>Loading BolMizan Sovereign Workspace...</span>
              </div>
            </div>
          ) : !state ? (
            <div className="rounded-2xl border border-rose-500/40 bg-rose-950/30 p-8 text-center space-y-3">
              <p className="text-sm font-semibold text-rose-200">
                {error || 'Unable to load workspace state.'}
              </p>
              <button
                type="button"
                onClick={() => void refreshState()}
                className="inline-flex items-center gap-1.5 rounded-lg bg-[#0F766E] px-4 py-2 text-xs font-bold text-white"
              >
                <RefreshCw className="w-3.5 h-3.5" /> Retry Connection
              </button>
            </div>
          ) : (
            <>
              {activeTab === 'treasury' ? (
                <>
                  {/* Living Cultural Hero Command Stage with Universal Prompt & Multi-Currency */}
                  <AjrakLivingStage
                    state={state}
                    mode={audienceMode}
                    onModeChange={handleModeChange}
                    script={script}
                    onScriptChange={handleScriptChange}
                    dyeTheme={dyeTheme}
                    onDyeThemeChange={handleDyeThemeChange}
                    fxUnit={fxUnit}
                    onFxUnitChange={handleFxUnitChange}
                    onUniversalCommand={handleUniversalCommand}
                    mizanTilt={mizanTilt}
                    onReplayWelcome={() => triggerApexHaptic('authenticate', 'Ajrak Welcome Replayed')}
                    onOpenDirector={() => setDirectorOpen(true)}
                  />

                  {commandFeedback && (
                    <div className="rounded-xl border border-[#14B8A6]/45 bg-[#04151B] px-5 py-3.5 text-xs sm:text-sm text-[#FDE68A] flex items-center justify-between gap-3">
                      <span>{commandFeedback}</span>
                      <button
                        type="button"
                        onClick={() => setCommandFeedback(null)}
                        className="text-xs font-semibold text-[#5EEAD4] hover:underline shrink-0"
                      >
                        Dismiss
                      </button>
                    </div>
                  )}

                  <section className="rounded-2xl border border-amber-400/25 bg-[#091A20] p-4 sm:p-5" aria-label="Pilot product boundaries">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h2 className="font-semibold text-white">BolMizan merchant-ledger pilot</h2>
                      <span className="rounded-full border border-amber-300/30 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-amber-200">No money movement</span>
                    </div>
                    <div className="mt-3 grid gap-3 text-xs leading-5 text-[#F8F7F3]/70 sm:grid-cols-3">
                      <p>Records shop entries after server confirmation; hash checks do not replace independent audit.</p>
                      <p>Payment QR, bank settlement, wallet balances, and account freezing are not provided here.</p>
                      <p>Scam text checks are heuristic prompts only; verify with your bank or provider through official channels.</p>
                    </div>
                  </section>

                  {/* Sindhi cultural interface and illustrative market stories */}
                  <IndusCulturalWave
                    onJumpToTab={handleTabChange}
                    totalSadaqahPkr={state.totals.sadaqahReservePkr}
                    activeDealsCount={state.deals.length}
                    script={script}
                  />

                  {/* Living Sindhi Heritage & Color Pigment Photographic Gallery */}
                  <SindhCultureGallery script={script} />

                  {/* Human Meaning & Empathy Impact Translation */}
                  <DignityImpactRibbon state={state} mode={audienceMode} script={script} />
                </>
              ) : (
                /* Focused Ajrak-Woven Workspace Banner on Specialized Tabs */
                <section className="relative rounded-2xl overflow-hidden border border-[#F59E0B]/30 ajrak-moving-glass shadow-lg">
                  <AjrakBlockBorder />
                  <AjrakClothPattern
                    accentHex={activeTab === 'shields' ? '#9B1C2E' : activeTab === 'voice' ? '#14B8A6' : '#F59E0B'}
                    opacityClass="opacity-[0.1]"
                  />
                  <HalaKashiCornerOrnament className="absolute top-3 left-2 opacity-65" />
                  <div className="relative z-10 px-6 py-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="space-y-1 pl-3">
                      <div className="text-[11px] font-mono-tabular uppercase tracking-wider text-[#5EEAD4]">
                        Ajrak Sovereign Module · Sakrand 0% Riba Standard
                      </div>
                      <h1 className="font-display text-xl sm:text-2xl font-bold text-white">
                        {TAB_CONTEXT[activeTab].title}
                      </h1>
                      <p className="text-xs text-[#F8F7F3]/80 max-w-2xl">
                        {TAB_CONTEXT[activeTab].subtitle}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleTabChange('treasury')}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-[#F59E0B]/35 bg-[#041219]/80 text-xs font-semibold text-[#FDE68A] hover:bg-[#F59E0B]/15 whitespace-nowrap shrink-0"
                    >
                      <ArrowLeft className="w-3.5 h-3.5" />
                      <span>Command Home</span>
                    </button>
                  </div>
                </section>
              )}

              {/* Active Workspace Tab */}
              <Suspense fallback={<div role="status" className="rounded-2xl border border-[#F59E0B]/25 bg-[#041016]/80 p-8 text-center text-sm text-[#FDE68A]">Loading selected workspace…</div>}>
                <motion.div
                  key={activeTab}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.2 }}
                >
                  {activeTab === 'treasury' && (
                    <TreasuryOperations
                      state={state}
                      mode={audienceMode}
                      script={script}
                      fxUnit={fxUnit}
                      externalDraft={commandDraft}
                      onStateRefresh={refreshState}
                    />
                  )}
                  {activeTab === 'shields' && (
                    <SovereignShields />
                  )}
                  {activeTab === 'voice' && (
                    <VoiceMizanWorkspace onSendToParchi={handleSendToParchi} />
                  )}
                  {activeTab === 'ledger' && (
                    <VeritasLedger state={state} onStateRefresh={refreshState} />
                  )}
                  {activeTab === 'haqproof' && <HaqProofWorkbench />}
                </motion.div>
              </Suspense>
            </>
          )}
        </main>

        <footer className="relative z-20 border-t border-[#F59E0B]/20 bg-[#030B10]/95">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 pt-4 pb-5 space-y-2 text-center">
            <AjrakLoomDivider label="Ajrak Craft · Zero-Riba Sovereign Standard" />
            <div dir="rtl" className="text-sm font-semibold text-[#FDE68A]/90">
              سائينم سدائين ڪرين مٿي سنڌ سڪار — شاهه عبداللطيف ڀٽائي
            </div>
            <p className="text-xs text-[#F8F7F3]/70">
              BolMizan · Sakrand, Shaheed Benazirabad, Sindh · Honest Weight, Otaq Witness &amp; 0% Fee Raast Trade
            </p>
          </div>
          <AjrakBlockBorder />
        </footer>

        {/* Overlays */}
        <CinematicDirectorStage open={directorOpen} onClose={() => setDirectorOpen(false)} />
        {state && (
          <JudgePassportModal
            open={passportOpen}
            onClose={() => setPassportOpen(false)}
            state={state}
          />
        )}
        <IsefMasterDashboard />
      </div>
    </SovereignAuthGate>
  );
}

export default App;
