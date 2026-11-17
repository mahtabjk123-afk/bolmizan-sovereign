import React, { useCallback, useEffect, useState } from 'react';
import { Moon, Sun } from 'lucide-react';

type EntryType = 'CREDIT_GIVEN' | 'PAYMENT_RECEIVED';
type Lang = 'ur' | 'sd' | 'en';

interface LedgerEntry {
  id: string;
  customer_name: string;
  customer_phone: string | null;
  entry_type: EntryType | 'EXPENSE';
  amount_paisa: number;
  note: string | null;
  created_at: string;
}

interface LedgerSummary {
  terminalId: string;
  totalCreditPaisa: number;
  totalReceivedPaisa: number;
  netReceivablePaisa: number;
  entryCount: number;
  hashChainIntegrity: 'VERIFIED' | 'TAMPER_DETECTED';
  recentEntries: LedgerEntry[];
}

function parsePaisa(value: string): number | null {
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(value.trim());
  if (!match) return null;
  const rupees = Number(match[1]);
  const paisa = Number((match[2] || '').padEnd(2, '0'));
  const amountPaisa = rupees * 100 + paisa;
  return Number.isSafeInteger(amountPaisa) && amountPaisa > 0 ? amountPaisa : null;
}

function formatPaisa(amountPaisa: number): string {
  const rupees = Math.floor(amountPaisa / 100);
  const paisa = amountPaisa % 100;
  return `Rs. ${rupees.toLocaleString('en-PK')}${paisa ? `.${String(paisa).padStart(2, '0')}` : ''}`;
}

export const MerchantSuperDashboard: React.FC = () => {
  const [summary, setSummary] = useState<LedgerSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [sunlight, setSunlight] = useState(true);
  const [lang, setLang] = useState<Lang>('ur');
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [entryType, setEntryType] = useState<EntryType>('CREDIT_GIVEN');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);

  const isRtl = lang === 'ur' || lang === 'sd';
  const loadSummary = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/ledger/summary', { credentials: 'same-origin' });
      if (!response.ok) throw new Error(response.status === 401 ? 'Please sign in to load this ledger.' : `Ledger API returned ${response.status}.`);
      setSummary(await response.json() as LedgerSummary);
      setMessage('');
    } catch (error) {
      setSummary(null);
      setMessage(error instanceof Error ? error.message : 'Unable to load ledger from the server.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadSummary();
  }, [loadSummary]);

  const saveEntry = async (event: React.FormEvent) => {
    event.preventDefault();
    const amountPaisa = parsePaisa(amount);
    if (!customerName.trim() || amountPaisa === null) {
      setMessage('Enter a positive amount with no more than two decimal places.');
      return;
    }

    setSaving(true);
    setMessage('');
    try {
      const response = await fetch('/api/ledger/entry', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerName: customerName.trim(),
          customerPhone: customerPhone.trim() || undefined,
          entryType,
          amountPaisa,
          note: note.trim() || undefined,
          idempotencyKey: crypto.randomUUID(),
        }),
      });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || `Ledger API returned ${response.status}.`);
      setCustomerName('');
      setCustomerPhone('');
      setAmount('');
      setNote('');
      await loadSummary();
      setMessage('Entry saved to the server ledger. This is bookkeeping only; no payment was initiated or settled.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to save ledger entry.');
    } finally {
      setSaving(false);
    }
  };

  const containerClass = sunlight ? 'bg-slate-100 text-slate-900' : 'bg-[#040711] text-slate-100';
  const cardClass = sunlight ? 'border-slate-200 bg-white' : 'border-white/10 bg-[#091022]';

  return (
    <div dir={isRtl ? 'rtl' : 'ltr'} className={`min-h-screen p-4 transition-colors ${containerClass}`}>
      <main className="mx-auto max-w-5xl space-y-5">
        <header className={`flex flex-wrap items-center justify-between gap-3 rounded-2xl border p-4 ${cardClass}`}>
          <div>
            <h1 className="text-xl font-extrabold">{lang === 'ur' ? 'بول میزان کھاتہ' : lang === 'sd' ? 'ٻول ميزان کاتو' : 'BolMizan Merchant Ledger'}</h1>
            <p className="text-xs opacity-70">Non-custodial bookkeeping pilot. No funds are held, transferred, or settled.</p>
            <p className="mt-1 text-xs opacity-70">{summary ? `Terminal ${summary.terminalId} · ${summary.entryCount} server records` : loading ? 'Loading live SQLite ledger…' : 'Live ledger unavailable'}</p>
          </div>
          <div className="flex items-center gap-2">
            {(['ur', 'sd', 'en'] as const).map((code) => (
              <button key={code} type="button" onClick={() => setLang(code)} className={`min-h-10 rounded-lg px-3 text-sm font-bold ${lang === code ? 'bg-emerald-600 text-white' : 'border border-slate-400/30'}`}>
                {code === 'ur' ? 'اردو' : code === 'sd' ? 'سنڌي' : 'EN'}
              </button>
            ))}
            <button type="button" onClick={() => setSunlight((value) => !value)} className="min-h-10 rounded-lg border border-slate-400/30 p-2" aria-label="Toggle sunlight mode">
              {sunlight ? <Moon className="h-5 w-5" /> : <Sun className="h-5 w-5" />}
            </button>
            <button type="button" onClick={() => void loadSummary()} className="min-h-10 rounded-lg bg-emerald-600 px-3 text-sm font-bold text-white">Refresh</button>
          </div>
        </header>

        {message && <p role="status" className={`rounded-xl border p-3 text-sm ${cardClass}`}>{message}</p>}

        <section className="grid gap-3 sm:grid-cols-3" aria-label="Live ledger balances">
          {[
            ['Receivables', summary?.totalCreditPaisa],
            ['Payments recorded', summary?.totalReceivedPaisa],
            ['Net receivable', summary?.netReceivablePaisa],
          ].map(([label, amountPaisa]) => (
            <article key={String(label)} className={`rounded-2xl border p-4 ${cardClass}`}>
              <h2 className="text-xs font-semibold uppercase tracking-wide opacity-70">{label}</h2>
              <p className="mt-2 text-2xl font-black">{typeof amountPaisa === 'number' ? formatPaisa(amountPaisa) : '—'}</p>
            </article>
          ))}
        </section>

        <section className="grid gap-5 lg:grid-cols-2">
          <form onSubmit={saveEntry} className={`space-y-3 rounded-2xl border p-5 ${cardClass}`}>
            <h2 className="text-lg font-bold">New bookkeeping entry</h2>
            <div className="grid grid-cols-2 gap-2">
              <button type="button" onClick={() => setEntryType('CREDIT_GIVEN')} className={`min-h-11 rounded-xl border px-3 text-sm font-bold ${entryType === 'CREDIT_GIVEN' ? 'bg-rose-600 text-white' : ''}`}>Credit given</button>
              <button type="button" onClick={() => setEntryType('PAYMENT_RECEIVED')} className={`min-h-11 rounded-xl border px-3 text-sm font-bold ${entryType === 'PAYMENT_RECEIVED' ? 'bg-emerald-600 text-white' : ''}`}>Payment recorded</button>
            </div>
            <input required maxLength={80} value={customerName} onChange={(event) => setCustomerName(event.target.value)} placeholder="Customer name" className="min-h-11 w-full rounded-lg border border-slate-400/40 bg-transparent px-3" />
            <input maxLength={20} value={customerPhone} onChange={(event) => setCustomerPhone(event.target.value)} placeholder="Phone (optional)" className="min-h-11 w-full rounded-lg border border-slate-400/40 bg-transparent px-3" />
            <input required inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="Amount in PKR (e.g. 1250.50)" className="min-h-11 w-full rounded-lg border border-slate-400/40 bg-transparent px-3" />
            <input maxLength={200} value={note} onChange={(event) => setNote(event.target.value)} placeholder="Note (optional)" className="min-h-11 w-full rounded-lg border border-slate-400/40 bg-transparent px-3" />
            <button disabled={saving} className="min-h-12 w-full rounded-xl bg-emerald-600 px-4 font-bold text-white disabled:opacity-50">{saving ? 'Saving…' : 'Save to server ledger'}</button>
          </form>

          <section className={`rounded-2xl border p-5 ${cardClass}`}>
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-lg font-bold">Recent server entries</h2>
              {summary && <span className="text-xs font-mono">Hash chain: {summary.hashChainIntegrity}</span>}
            </div>
            {!summary?.recentEntries.length && <p className="mt-4 text-sm opacity-70">{loading ? 'Loading…' : 'No entries returned by the authenticated ledger API.'}</p>}
            <ul className="mt-3 space-y-2">
              {summary?.recentEntries.map((entry) => (
                <li key={entry.id} className="rounded-xl border border-slate-400/20 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-bold">{entry.customer_name}</span>
                    <span className="text-sm font-bold">{formatPaisa(entry.amount_paisa)}</span>
                  </div>
                  <p className="mt-1 text-xs opacity-70">{entry.entry_type} · {entry.note || 'No note'} · {new Date(entry.created_at).toLocaleDateString('en-PK')}</p>
                </li>
              ))}
            </ul>
          </section>
        </section>
      </main>
    </div>
  );
};
