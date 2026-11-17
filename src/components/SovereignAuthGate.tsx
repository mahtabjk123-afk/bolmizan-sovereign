import React, { useEffect, useState } from 'react';
import {
  Eye,
  EyeOff,
  Fingerprint,
  Globe,
  KeyRound,
  Lock,
  Moon,
  ShieldAlert,
  ShieldCheck,
  Sun,
  UserCheck,
} from 'lucide-react';

interface SovereignAuthGateProps {
  children: React.ReactNode;
}

type Lang = 'en' | 'ur' | 'sd';

const TRANSLATIONS: Record<
  Lang,
  {
    dir: 'ltr' | 'rtl';
    badge: string;
    title: string;
    subtitle: string;
    merchantRole: string;
    judgeRole: string;
    terminalLabel: string;
    pinLabel: string;
    pinPlaceholder: string;
    submitBtn: string;
    verifying: string;
    lockedMsg: (sec: number) => string;
    privacyFooter: string;
    offlineBadge: string;
  }
> = {
  en: {
    dir: 'ltr',
    badge: 'Merchant Ledger Pilot',
    title: 'BolMizan Sovereign OS',
    subtitle: 'Unlock your private Khata ledger & Anti-Scam shield',
    merchantRole: 'Merchant Khata',
    judgeRole: 'ISEF Judge Audit',
    terminalLabel: 'Shop / Terminal ID',
    pinLabel: 'Security PIN',
    pinPlaceholder: 'Enter your secret PIN',
    submitBtn: 'Unlock Khata Vault',
    verifying: 'Verifying...',
    lockedMsg: (sec) => `Too many attempts. Vault locked for ${sec}s.`,
    privacyFooter: 'Server-backed data; protect your credentials',
    offlineBadge: 'NO BANK / WALLET CUSTODY',
  },
  ur: {
    dir: 'rtl',
    badge: 'دکاندار کھاتہ پائلٹ',
    title: 'بول میزان ساورن او ایس',
    subtitle: 'اپنا ذاتی کھاتہ اور فراڈ سے بچاؤ سسٹم کھولیں',
    merchantRole: 'دکاندار کھاتہ',
    judgeRole: 'جج آڈٹ موڈ',
    terminalLabel: 'دکان / ٹرمینل آئی ڈی',
    pinLabel: 'خفیہ پن کوڈ (PIN)',
    pinPlaceholder: 'اپنا خفیہ پن درج کریں',
    submitBtn: 'کھاتہ کھولیں',
    verifying: 'تصدیق ہو رہی ہے...',
    lockedMsg: (sec) => 'Too many attempts. Locked for ' + sec + 's.',
    privacyFooter: 'سرور پر محفوظ ڈیٹا؛ اپنا پن خفیہ رکھیں',
    offlineBadge: 'آف لائن حق پروف لیب',
  },
  sd: {
    dir: 'rtl',
    badge: 'دڪاندار کاتو پائلٽ',
    title: 'بول ميزان ساورن او ايس',
    subtitle: 'پنهنجو ذاتي کاتو ۽ فراڊ کان بچاءُ سسٽم کوليو',
    merchantRole: 'دڪاندار کاتو',
    judgeRole: 'جج آڊٽ موڊ',
    terminalLabel: 'دڪان / ٽرمينل آءِ ڊي',
    pinLabel: 'ڳجهو پن ڪوڊ (PIN)',
    pinPlaceholder: 'پنهنجو پن ڪوڊ لکو',
    submitBtn: 'کاتو کوليو',
    verifying: 'تصديق ٿي رهي آهي...',
    lockedMsg: (sec) => 'Too many attempts. Locked for ' + sec + 's.',
    privacyFooter: 'سرور تي محفوظ ڊيٽا؛ پنهنجو پن محفوظ رکو',
    offlineBadge: 'آف لائن حق پروف ليب',
  },
};

export const SovereignAuthGate: React.FC<SovereignAuthGateProps> = ({ children }) => {
  const [authenticated, setAuthenticated] = useState<boolean>(false);
  const [checkingSession, setCheckingSession] = useState<boolean>(true);
  const [lang, setLang] = useState<Lang>('ur');
  const [sunlightMode, setSunlightMode] = useState<boolean>(false);
  const [role, setRole] = useState<'MERCHANT' | 'ISEF_JUDGE'>('MERCHANT');
  const [merchantId, setMerchantId] = useState('BMZ-NAZIMABAD-01');
  const [pin, setPin] = useState('');
  const [showPin, setShowPin] = useState(false);
  const [loading, setLoading] = useState(false);
  const [attempts, setAttempts] = useState(0);
  const [lockUntil, setLockUntil] = useState<number | null>(null);
  const [error, setError] = useState('');
  const [now, setNow] = useState(Date.now());

  const t = TRANSLATIONS[lang];

  // Verify real HttpOnly cookie session on initial load / refresh
  useEffect(() => {
    fetch('/api/auth/me')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.authenticated) {
          sessionStorage.setItem('bolmizan_sovereign_auth', 'verified');
          sessionStorage.setItem('bolmizan_role', data.role);
          sessionStorage.setItem('bolmizan_merchant_id', data.terminalId);
          setAuthenticated(true);
        } else {
          sessionStorage.removeItem('bolmizan_sovereign_auth');
        }
      })
      .catch(() => {
        // Offline fallback: allow previously verified session on same device
        if (sessionStorage.getItem('bolmizan_sovereign_auth') === 'verified') {
          setAuthenticated(true);
        }
      })
      .finally(() => setCheckingSession(false));
  }, []);

  useEffect(() => {
    if (!lockUntil) return;
    const timer = setInterval(() => {
      const current = Date.now();
      setNow(current);
      if (current >= lockUntil) {
        setLockUntil(null);
        setAttempts(0);
        setError('');
      }
    }, 500);
    return () => clearInterval(timer);
  }, [lockUntil]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if ((lockUntil && Date.now() < lockUntil) || loading) return;

    setLoading(true);
    setError('');

    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          terminalId: merchantId.trim().toUpperCase(),
          pin: pin.trim(),
          role,
        }),
      });

      const data = await response.json().catch(() => ({}));

      if (response.ok && data.authenticated) {
        sessionStorage.setItem('bolmizan_sovereign_auth', 'verified');
        sessionStorage.setItem('bolmizan_role', role);
        sessionStorage.setItem('bolmizan_merchant_id', merchantId.trim().toUpperCase());
        sessionStorage.setItem('bolmizan_lang', lang);
        setAuthenticated(true);
      } else {
        const nextAttempts = attempts + 1;
        setAttempts(nextAttempts);
        if (nextAttempts >= 3 || response.status === 429) {
          setLockUntil(Date.now() + 30_000);
        }
        setError(
          data.message ||
          (lang === 'ur'
            ? 'غلط پن کوڈ یا ٹرمینل آئی ڈی'
            : lang === 'sd'
              ? 'غلط پن ڪوڊ يا ٽرمينل آءِ ڊي'
              : 'Invalid PIN or Terminal ID')
        );
      }
    } catch {
      setError(
        lang === 'ur'
          ? 'سرور سے رابطہ نہیں ہو سکا۔ براہ کرم بیک اینڈ چیک کریں۔'
          : 'Unable to reach BolMizan local server.'
      );
    } finally {
      setLoading(false);
    }
  };

  if (checkingSession) {
    return (
      <div className="min-h-screen bg-[#040711] text-amber-300 flex items-center justify-center font-mono text-xs">
        Verifying Sovereign Vault Session...
      </div>
    );
  }

  if (authenticated) {
    return <>{children}</>;
  }

  const remainingSec = lockUntil ? Math.max(0, Math.ceil((lockUntil - now) / 1000)) : 0;

  return (
    <div
      dir={t.dir}
      className={`min-h-screen flex items-center justify-center p-4 transition-colors duration-300 relative overflow-hidden ${sunlightMode
          ? 'bg-slate-100 text-slate-900'
          : 'bg-[#040711] text-slate-100'
        }`}
    >
      {!sunlightMode && (
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(212,175,55,0.14),transparent_45%),radial-gradient(circle_at_bottom_left,rgba(16,185,129,0.12),transparent_45%)]" />
      )}

      <div
        className={`relative z-10 w-full max-w-md rounded-3xl p-6 md:p-8 border transition-all space-y-5 ${sunlightMode
            ? 'bg-white border-slate-300 shadow-xl'
            : 'bg-[#091022]/95 border-[#D4AF37]/40 shadow-[0_20px_70px_rgba(0,0,0,0.85)] backdrop-blur-2xl'
          }`}
      >
        {/* Top Controls: Language Switcher & Sunlight Mode */}
        <div className="flex items-center justify-between gap-2">
          <div className="inline-flex items-center gap-1 p-1 rounded-xl border border-slate-500/20 bg-slate-500/10">
            <Globe className="w-3.5 h-3.5 mx-1.5 text-emerald-500" />
            {(['ur', 'sd', 'en'] as Lang[]).map((code) => (
              <button
                key={code}
                type="button"
                onClick={() => setLang(code)}
                className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all ${lang === code
                    ? 'bg-emerald-600 text-white shadow-sm'
                    : sunlightMode
                      ? 'text-slate-600 hover:text-slate-900'
                      : 'text-slate-400 hover:text-white'
                  }`}
              >
                {code === 'ur' ? 'اردو' : code === 'sd' ? 'سنڌي' : 'EN'}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={() => setSunlightMode(!sunlightMode)}
            title="Toggle Sunlight / Dark Mode"
            className={`p-2 rounded-xl border transition-all flex items-center gap-1.5 text-xs font-semibold ${sunlightMode
                ? 'bg-amber-100 border-amber-300 text-amber-900'
                : 'bg-white/5 border-white/15 text-amber-300 hover:bg-white/10'
              }`}
          >
            {sunlightMode ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" />}
            <span>{sunlightMode ? 'Night' : 'Sunlight'}</span>
          </button>
        </div>

        {/* Brand Header */}
        <div className="text-center space-y-2 pt-1">
          <div
            className={`inline-flex items-center justify-center w-14 h-14 rounded-2xl mx-auto border ${sunlightMode
                ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                : 'bg-[#D4AF37]/15 border-[#D4AF37]/40 text-[#F3D06B]'
              }`}
          >
            <ShieldCheck className="w-8 h-8" />
          </div>
          <div
            className={`text-xs font-semibold tracking-wide ${sunlightMode ? 'text-emerald-700' : 'text-[#D4AF37]'
              }`}
          >
            {t.badge}
          </div>
          <h1 className="text-2xl font-extrabold tracking-tight">{t.title}</h1>
          <p className={`text-sm ${sunlightMode ? 'text-slate-600' : 'text-slate-400'}`}>
            {t.subtitle}
          </p>
        </div>

        {/* Role Selector */}
        <div className={`grid grid-cols-2 gap-2 p-1.5 rounded-2xl border ${sunlightMode ? 'bg-slate-100 border-slate-200' : 'bg-black/50 border-white/10'}`}>
          <button
            type="button"
            onClick={() => setRole('MERCHANT')}
            className={`flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-bold transition-all ${role === 'MERCHANT' ? sunlightMode ? 'bg-emerald-600 text-white shadow' : 'bg-[#D4AF37] text-slate-950 shadow' : sunlightMode ? 'text-slate-600 hover:text-slate-900' : 'text-slate-400 hover:text-white'}`}
          >
            <UserCheck className="w-4 h-4" /> {t.merchantRole}
          </button>
          <button
            type="button"
            onClick={() => setRole('ISEF_JUDGE')}
            className={`flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-bold transition-all ${role === 'ISEF_JUDGE' ? 'bg-emerald-500 text-slate-950 shadow' : sunlightMode ? 'text-slate-600 hover:text-slate-900' : 'text-slate-400 hover:text-white'}`}
          >
            <Fingerprint className="w-4 h-4" /> {t.judgeRole}
          </button>
        </div>

        <form onSubmit={handleLogin} className="space-y-4">
          <label className="block space-y-1.5 text-xs font-semibold">
            <span>{t.terminalLabel}</span>
            <input
              type="text"
              dir="ltr"
              value={merchantId}
              onChange={(event) => setMerchantId(event.target.value)}
              className={`w-full px-4 py-3 rounded-xl border text-base font-mono focus:outline-none ${sunlightMode ? 'bg-slate-50 border-slate-300 text-slate-900 focus:border-emerald-600' : 'bg-slate-950 border-white/15 text-white focus:border-[#D4AF37]'}`}
              placeholder="BMZ-NAZIMABAD-01"
              required
            />
          </label>

          <label className="block space-y-1.5 text-xs font-semibold">
            <span>{t.pinLabel}</span>
            <span className="relative block">
              <KeyRound className="absolute left-3.5 top-3.5 h-4 w-4 text-slate-500" />
              <input
                type={showPin ? 'text' : 'password'}
                inputMode="numeric"
                maxLength={16}
                value={pin}
                onChange={(event) => setPin(event.target.value)}
                disabled={Boolean(lockUntil)}
                placeholder={t.pinPlaceholder}
                className={`w-full pl-10 pr-11 py-3 rounded-xl border text-base font-mono tracking-widest focus:outline-none disabled:opacity-50 ${sunlightMode ? 'bg-slate-50 border-slate-300 text-slate-900 focus:border-emerald-600' : 'bg-slate-950 border-white/15 text-white focus:border-[#D4AF37]'}`}
                required
              />
              <button
                type="button"
                onClick={() => setShowPin(!showPin)}
                className="absolute right-3.5 top-3 text-slate-400 hover:text-emerald-500"
                aria-label="Toggle PIN visibility"
              >
                {showPin ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </span>
          </label>

          {(error || lockUntil) && <p role="alert" className="rounded-lg border border-rose-500/30 bg-rose-950/25 p-3 text-xs text-rose-200">{lockUntil ? t.lockedMsg(remainingSec) : error}</p>}

          <button
            type="submit"
            disabled={Boolean(lockUntil) || loading}
            className={`w-full py-3.5 rounded-xl font-extrabold text-base shadow-lg flex items-center justify-center gap-2 transition-all disabled:opacity-40 ${sunlightMode ? 'bg-emerald-600 hover:bg-emerald-700 text-white' : 'bg-gradient-to-r from-[#D4AF37] to-[#F3D06B] hover:opacity-95 text-slate-950'}`}
          >
            {loading ? <Lock className="h-4 w-4" /> : <UserCheck className="h-4 w-4" />}
            {lockUntil ? `${remainingSec}s` : loading ? t.verifying : t.submitBtn}
          </button>
        </form>

        <a
          href="/?mode=haqproof"
          className={`block rounded-lg border px-3 py-2.5 text-center text-xs font-semibold transition-colors ${sunlightMode ? 'border-slate-300 text-slate-700 hover:bg-slate-100' : 'border-[#14B8A6]/35 text-[#99F6E4] hover:bg-[#14B8A6]/10'}`}
        >
          Open local HaqProof tools (no sign-in)
        </a>

        {/* Compliance & Privacy Footer */}
        <div className={`pt-3 border-t flex justify-between items-center text-[10px] font-mono ${sunlightMode ? 'border-slate-200 text-slate-500' : 'border-white/10 text-slate-400'}`}>
          <span>{t.privacyFooter}</span>
          <span>{t.offlineBadge}</span>
        </div>
      </div>
    </div>
  );
};

