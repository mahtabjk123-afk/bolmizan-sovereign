import { useEffect, useMemo, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import { ArrowUpRight, BadgeCheck, MessageCircle, ReceiptText, Wallet } from 'lucide-react';

interface LedgerRow {
    block_index: number;
    party_name: string;
    entry_type: 'udhaar_given' | 'payment_received' | 'cash_sale';
    amount_pkr: number;
    items_summary: string;
    timestamp: string;
    party_phone: string;
    block_hash: string;
}

interface TenantSessionResponse {
    tenant: { id: string; businessName: string; city: string };
    ledger: LedgerRow[];
    chain: { valid: boolean };
}

interface ReconciliationPreview {
    statementAuthenticated: false;
    settlementConfirmed: false;
    importedRows: number;
    matchedRows: number;
    exceptionRows: number;
    unmatchedLocalBlocks: number;
    exceptions: Array<{ row: number; reference: string; reason: string }>;
}

function parseStatementCsv(source: string): Array<{ reference: string; amountPkr: number; currency: string }> {
    const lines = source.replace(/^\uFEFF/, '').split(/\r?\n/).filter((line) => line.trim());
    if (lines.length < 2 || lines.length > 2001) throw new Error('CSV must contain a header and 1–2,000 rows.');
    const parseLine = (line: string) => {
        const cells: string[] = [];
        let value = '';
        let quoted = false;
        for (let index = 0; index < line.length; index += 1) {
            const char = line[index];
            if (char === '"' && quoted && line[index + 1] === '"') { value += '"'; index += 1; }
            else if (char === '"') quoted = !quoted;
            else if (char === ',' && !quoted) { cells.push(value.trim()); value = ''; }
            else value += char;
        }
        if (quoted) throw new Error('CSV contains an unclosed quoted field.');
        cells.push(value.trim());
        return cells;
    };
    const header = parseLine(lines[0]).map((cell) => cell.toLowerCase());
    const referenceIndex = header.indexOf('reference');
    const amountIndex = header.indexOf('amountpkr');
    const currencyIndex = header.indexOf('currency');
    if (referenceIndex < 0 || amountIndex < 0 || currencyIndex < 0) {
        throw new Error('CSV headers must include reference, amountPkr, currency.');
    }
    return lines.slice(1).map((line) => {
        const cells = parseLine(line);
        const amountPkr = Number(cells[amountIndex]);
        if (!Number.isSafeInteger(amountPkr) || amountPkr <= 0) throw new Error('Every amountPkr must be a positive whole PKR amount.');
        return {
            reference: cells[referenceIndex] ?? '',
            amountPkr,
            currency: (cells[currencyIndex] ?? '').toUpperCase(),
        };
    });
}

const formatPkr = (amount: number) => new Intl.NumberFormat('en-PK', {
    style: 'currency',
    currency: 'PKR',
    maximumFractionDigits: 0,
}).format(amount);

const entryLabel: Record<LedgerRow['entry_type'], string> = {
    udhaar_given: 'Udhaar (Credit)',
    payment_received: 'Wasooli (Paid)',
    cash_sale: 'Nagad Sale',
};

function buildWhatsAppReceiptHref(session: TenantSessionResponse, row: LedgerRow): string | null {
    const phone = row.party_phone.replace(/\D/g, '');
    if (!/^92\d{10}$/.test(phone)) return null;
    const date = new Intl.DateTimeFormat('ur-PK', { dateStyle: 'medium' }).format(new Date(row.timestamp));
    const message = [
        'السلام علیکم',
        `${session.tenant.businessName} کے کھاتے کا ریکارڈ:`,
        `پَرچی نمبر: ${row.block_index}`,
        `قسم: ${entryLabel[row.entry_type]}`,
        `رقم: ${formatPkr(row.amount_pkr)}`,
        `اشیاء: ${row.items_summary}`,
        `تاریخ: ${date}`,
        `ریکارڈ شناخت: ${row.block_hash.slice(0, 16)}`,
        'براہِ کرم اپنا حساب دیکھیں؛ کوئی فرق ہو تو دکاندار سے رابطہ کریں۔ یہ پیغام خود ادائیگی یا آپ کی تصدیق ثابت نہیں کرتا۔',
    ].join('\n');
    return `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
}

export const MultiTenantKhataDesk = () => {
    const [session, setSession] = useState<TenantSessionResponse | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [authBusy, setAuthBusy] = useState(false);
    const [phone, setPhone] = useState('');
    const [pin, setPin] = useState('');
    const [businessName, setBusinessName] = useState('');
    const [city, setCity] = useState('Sakrand');
    const [entryBusy, setEntryBusy] = useState(false);
    const [entryError, setEntryError] = useState('');
    const [entryNotice, setEntryNotice] = useState('');
    const [speakAmountAfterSave, setSpeakAmountAfterSave] = useState(false);
    const [partyName, setPartyName] = useState('');
    const [partyPhone, setPartyPhone] = useState('');
    const [entryType, setEntryType] = useState<LedgerRow['entry_type']>('udhaar_given');
    const [amountPkr, setAmountPkr] = useState('');
    const [itemsSummary, setItemsSummary] = useState('');
    const [statementFile, setStatementFile] = useState<File | null>(null);
    const [reconciliation, setReconciliation] = useState<ReconciliationPreview | null>(null);
    const [reconciling, setReconciling] = useState(false);
    const [reconciliationError, setReconciliationError] = useState('');

    useEffect(() => {
        const controller = new AbortController();
        fetch('/api/tenant/session', { credentials: 'same-origin', signal: controller.signal })
            .then(async (response) => {
                if (!response.ok) throw new Error(response.status === 401 ? 'Sign in to view your shop ledger.' : 'Ledger could not be loaded.');
                return await response.json() as TenantSessionResponse;
            })
            .then(setSession)
            .catch((cause: unknown) => {
                if (cause instanceof DOMException && cause.name === 'AbortError') return;
                setError(cause instanceof Error ? cause.message : 'Ledger could not be loaded.');
            })
            .finally(() => setLoading(false));
        return () => controller.abort();
    }, []);

    const handleLogin = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        setAuthBusy(true);
        setError('');
        try {
            const response = await fetch('/api/tenant/auth', {
                method: 'POST',
                credentials: 'same-origin',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ phone, pin, businessName, city }),
            });
            const result = await response.json() as TenantSessionResponse & { error?: string; ok?: boolean };
            if (!response.ok) throw new Error(result.error || 'Shop sign-in failed.');
            setSession({ tenant: result.tenant, ledger: result.ledger, chain: result.chain });
            setPin('');
            setError('');
        } catch (cause) {
            setError(cause instanceof Error ? cause.message : 'Shop sign-in failed.');
        } finally {
            setAuthBusy(false);
        }
    };

    const handleAppendEntry = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        if (!session) return;
        const parsedAmount = Number(amountPkr);
        if (!Number.isSafeInteger(parsedAmount) || parsedAmount <= 0) {
            setEntryError('Enter a positive whole PKR amount.');
            return;
        }
        setEntryBusy(true);
        setEntryError('');
        setEntryNotice('');
        try {
            const idempotencyKey = `khata-${crypto.randomUUID()}`;
            const response = await fetch(`/api/tenant/${encodeURIComponent(session.tenant.id)}/ledger`, {
                method: 'POST',
                credentials: 'same-origin',
                headers: {
                    'Content-Type': 'application/json',
                    'Idempotency-Key': idempotencyKey,
                },
                body: JSON.stringify({
                    partyName,
                    partyPhone,
                    entryType,
                    amountPkr: parsedAmount,
                    itemsSummary,
                    autoWhatsapp: false,
                }),
            });
            const result = await response.json() as { block?: LedgerRow; replayed?: boolean; chain?: { valid: boolean }; error?: string };
            if (!response.ok || !result.block || !result.chain) throw new Error(result.error || 'Ledger entry was not saved.');
            setSession((current) => current ? {
                ...current,
                ledger: result.replayed ? current.ledger : [...current.ledger, result.block!],
                chain: result.chain!,
            } : current);
            setEntryNotice(result.replayed ? 'This entry was already saved; it was not duplicated.' : 'Entry saved to the shop ledger.');
            setPartyName('');
            setPartyPhone('');
            setAmountPkr('');
            setItemsSummary('');
            if (!result.replayed && speakAmountAfterSave && 'speechSynthesis' in window) {
                const utterance = new SpeechSynthesisUtterance(`روپے ${parsedAmount.toLocaleString('ur-PK')} کا حساب محفوظ ہوگیا`);
                utterance.lang = 'ur-PK';
                window.speechSynthesis.cancel();
                window.speechSynthesis.speak(utterance);
            }
        } catch (cause) {
            setEntryError(cause instanceof Error ? cause.message : 'Ledger entry could not be saved.');
        } finally {
            setEntryBusy(false);
        }
    };

    const totals = useMemo(() => {
        const rows = session?.ledger ?? [];
        const thisMonth = new Date();
        const monthRows = rows.filter((row) => {
            const date = new Date(row.timestamp);
            return date.getMonth() === thisMonth.getMonth() && date.getFullYear() === thisMonth.getFullYear();
        });
        const credits = rows.filter((row) => row.entry_type === 'udhaar_given').reduce((sum, row) => sum + row.amount_pkr, 0);
        const received = rows.filter((row) => row.entry_type === 'payment_received').reduce((sum, row) => sum + row.amount_pkr, 0);
        const cashSales = rows.filter((row) => row.entry_type === 'cash_sale').reduce((sum, row) => sum + row.amount_pkr, 0);
        const monthlyTotal = monthRows.reduce((sum, row) => sum + row.amount_pkr, 0);
        return { receivables: Math.max(0, credits - received), cashSales, monthlyTotal };
    }, [session]);

    const previewReconciliation = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        if (!session || !statementFile) return;
        setReconciling(true);
        setReconciliation(null);
        setReconciliationError('');
        try {
            if (statementFile.size > 1_000_000) throw new Error('Statement CSV must be 1 MB or smaller.');
            const entries = parseStatementCsv(await statementFile.text());
            const response = await fetch(`/api/tenant/${encodeURIComponent(session.tenant.id)}/reconciliation/preview`, {
                method: 'POST',
                credentials: 'same-origin',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ entries }),
            });
            const result = await response.json() as ReconciliationPreview & { error?: string };
            if (!response.ok) throw new Error(result.error || 'Reconciliation preview failed.');
            setReconciliation(result);
        } catch (cause) {
            setReconciliationError(cause instanceof Error ? cause.message : 'Reconciliation preview failed.');
        } finally {
            setReconciling(false);
        }
    };

    return (
        <div className="rounded-3xl border border-[#F59E0B]/20 bg-[#06151D]/90 p-5 shadow-[0_0_30px_rgba(245,158,11,0.12)]">
            <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                    <p className="text-[10px] uppercase tracking-[0.28em] text-[#F8F7F3]/55">Multi-Tenant Khata Desk</p>
                    <h3 className="mt-1 font-display text-xl font-bold text-white">Shop Ledger &amp; Receipt Sharing</h3>
                    {session && <p className="mt-1 text-xs text-[#F8F7F3]/55">{session.tenant.businessName} · {session.tenant.city}</p>}
                </div>
                <div className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs ${session?.chain.valid ? 'border-[#34D399]/25 bg-[#0B1E22] text-[#A7F3D0]' : 'border-white/10 bg-[#0B1D24] text-[#F8F7F3]/65'}`}>
                    <BadgeCheck className="h-3.5 w-3.5" />
                    {session ? session.chain.valid ? 'Ledger hash chain valid' : 'Ledger integrity warning' : 'Shop ledger'}
                </div>
            </div>

            {loading ? <p className="py-8 text-center text-sm text-[#F8F7F3]/60">Loading persisted ledger…</p> : !session ? (
                <form className="mx-auto max-w-xl space-y-4 rounded-2xl border border-white/10 bg-[#091A20] p-5" onSubmit={handleLogin}>
                    <div>
                        <h4 className="font-semibold text-white">Shopkeeper sign-in</h4>
                        <p className="mt-1 text-xs leading-5 text-[#F8F7F3]/60">Use an existing shop account. Public production enrollment remains disabled until phone verification is deployed.</p>
                    </div>
                    {error && <p role="alert" className="text-sm text-rose-300">{error}</p>}
                    <label className="block text-xs text-[#F8F7F3]/70">Mobile number
                        <input required autoComplete="tel" inputMode="tel" value={phone} onChange={(event) => setPhone(event.target.value)} className="mt-1 w-full rounded-lg border border-white/10 bg-[#06151D] px-3 py-2 text-sm text-white" />
                    </label>
                    <label className="block text-xs text-[#F8F7F3]/70">Shop PIN
                        <input required type="password" inputMode="numeric" autoComplete="current-password" minLength={4} maxLength={6} value={pin} onChange={(event) => setPin(event.target.value)} className="mt-1 w-full rounded-lg border border-white/10 bg-[#06151D] px-3 py-2 text-sm text-white" />
                    </label>
                    <details className="text-xs text-[#F8F7F3]/60">
                        <summary className="cursor-pointer">New local demo shop only</summary>
                        <div className="mt-3 grid gap-3 sm:grid-cols-2">
                            <label>Business name<input value={businessName} onChange={(event) => setBusinessName(event.target.value)} className="mt-1 w-full rounded-lg border border-white/10 bg-[#06151D] px-3 py-2 text-white" /></label>
                            <label>City<input value={city} onChange={(event) => setCity(event.target.value)} className="mt-1 w-full rounded-lg border border-white/10 bg-[#06151D] px-3 py-2 text-white" /></label>
                        </div>
                    </details>
                    <button disabled={authBusy} className="w-full rounded-xl bg-[#F59E0B] px-4 py-2.5 text-sm font-bold text-[#06151D] disabled:opacity-50" type="submit">{authBusy ? 'Signing in…' : 'Sign in'}</button>
                </form>
            ) : (
                <>
                    <form className="mt-5 space-y-3 rounded-2xl border border-white/10 bg-[#091A20] p-4" onSubmit={handleAppendEntry}>
                        <div>
                            <h4 className="font-semibold text-white">Record a shop entry</h4>
                            <p className="mt-1 text-xs text-[#F8F7F3]/60">Saved only after the server confirms the SQLite ledger write. Do not use this form to record a payment that has not actually been received.</p>
                        </div>
                        <div className="grid gap-3 sm:grid-cols-2">
                            <label className="text-xs text-[#F8F7F3]/70">Customer name
                                <input required maxLength={120} value={partyName} onChange={(event) => setPartyName(event.target.value)} className="mt-1 w-full rounded-lg border border-white/10 bg-[#06151D] px-3 py-2 text-sm text-white" />
                            </label>
                            <label className="text-xs text-[#F8F7F3]/70">Customer phone (optional)
                                <input type="tel" maxLength={32} inputMode="tel" value={partyPhone} onChange={(event) => setPartyPhone(event.target.value)} className="mt-1 w-full rounded-lg border border-white/10 bg-[#06151D] px-3 py-2 text-sm text-white" />
                            </label>
                            <label className="text-xs text-[#F8F7F3]/70">Entry type
                                <select value={entryType} onChange={(event) => setEntryType(event.target.value as LedgerRow['entry_type'])} className="mt-1 w-full rounded-lg border border-white/10 bg-[#06151D] px-3 py-2 text-sm text-white">
                                    <option value="udhaar_given">Credit / Udhaar given</option>
                                    <option value="payment_received">Payment received</option>
                                    <option value="cash_sale">Cash sale</option>
                                </select>
                            </label>
                            <label className="text-xs text-[#F8F7F3]/70">Amount (PKR)
                                <input required type="number" min={1} step={1} inputMode="numeric" value={amountPkr} onChange={(event) => setAmountPkr(event.target.value)} className="mt-1 w-full rounded-lg border border-white/10 bg-[#06151D] px-3 py-2 text-sm text-white" />
                            </label>
                            <label className="text-xs text-[#F8F7F3]/70 sm:col-span-2">Goods / note
                                <input maxLength={500} value={itemsSummary} onChange={(event) => setItemsSummary(event.target.value)} className="mt-1 w-full rounded-lg border border-white/10 bg-[#06151D] px-3 py-2 text-sm text-white" />
                            </label>
                        </div>
                        <label className="flex items-start gap-2 text-xs text-[#F8F7F3]/65">
                            <input type="checkbox" checked={speakAmountAfterSave} onChange={(event) => setSpeakAmountAfterSave(event.target.checked)} className="mt-0.5 accent-amber-500" />
                            <span>Speak the amount after confirmed save. Nearby people may hear the amount; speech support depends on this device.</span>
                        </label>
                        {entryError && <p role="alert" className="text-sm text-rose-300">{entryError}</p>}
                        {entryNotice && <p role="status" className="text-sm text-emerald-200">{entryNotice}</p>}
                        <button disabled={entryBusy} className="rounded-xl bg-[#F59E0B] px-4 py-2.5 text-sm font-bold text-[#06151D] disabled:opacity-50" type="submit">{entryBusy ? 'Saving…' : 'Save shop entry'}</button>
                    </form>
                    <div className="grid gap-4 md:grid-cols-3">
                        <SummaryCard label="Open Receivables" value={totals.receivables} icon={<Wallet className="h-4 w-4 text-[#F59E0B]" />} />
                        <SummaryCard label="Cash Sales" value={totals.cashSales} icon={<ReceiptText className="h-4 w-4 text-[#34D399]" />} />
                        <SummaryCard label="This Month" value={totals.monthlyTotal} icon={<ArrowUpRight className="h-4 w-4 text-[#A78BFA]" />} />
                    </div>

                    <div className="mt-6 overflow-hidden rounded-2xl border border-white/10">
                        <div className="grid grid-cols-[1.3fr_1fr_0.8fr] border-b border-white/10 bg-[#0B1D24] px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-[#F8F7F3]/60">
                            <span>Customer</span><span>Item</span><span className="text-right">Amount / Receipt</span>
                        </div>
                        {session?.ledger.length ? session.ledger.map((row) => (
                            <div key={row.block_index} className="grid grid-cols-[1.3fr_1fr_0.8fr] items-center border-b border-white/10 px-4 py-3 text-sm text-[#F8F7F3]/85 last:border-b-0">
                                <div><div className="font-medium text-white">{row.party_name}</div><div className="text-[11px] text-[#F8F7F3]/55">{entryLabel[row.entry_type]}</div></div>
                                <span className="truncate pr-2">{row.items_summary}</span>
                                <span className="flex flex-col items-end gap-1 text-right">
                                    <span className="font-semibold text-[#F9D899]">{formatPkr(row.amount_pkr)}</span>
                                    {(() => {
                                        const href = session ? buildWhatsAppReceiptHref(session, row) : null;
                                        return href ? (
                                            <a className="inline-flex items-center gap-1 rounded-md border border-emerald-400/25 px-2 py-1 text-[10px] font-medium text-emerald-200 hover:bg-emerald-400/10" href={href} target="_blank" rel="noopener noreferrer">
                                                <MessageCircle className="h-3 w-3" /> Share receipt
                                            </a>
                                        ) : <span className="text-[10px] text-[#F8F7F3]/40">No valid customer WhatsApp number</span>;
                                    })()}
                                </span>
                            </div>
                        )) : <p className="px-4 py-8 text-center text-sm text-[#F8F7F3]/55">No saved entries yet. New entries will appear here after you add them.</p>}
                    </div>

                    <section className="mt-6 rounded-2xl border border-white/10 bg-[#091A20] p-4" aria-labelledby="reconciliation-heading">
                        <h4 id="reconciliation-heading" className="font-semibold text-white">Statement reconciliation preview</h4>
                        <p className="mt-1 text-xs leading-5 text-[#F8F7F3]/60">Compare a partner-exported CSV against local receipt references. This preview does not authenticate a bank statement or confirm payment settlement.</p>
                        <form className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center" onSubmit={previewReconciliation}>
                            <label className="flex-1 text-xs text-[#F8F7F3]/70">CSV columns: reference, amountPkr, currency
                                <input className="mt-2 block w-full text-sm text-[#F8F7F3] file:mr-3 file:rounded-lg file:border-0 file:bg-[#F59E0B] file:px-3 file:py-2 file:font-semibold file:text-[#06151D]" type="file" accept=".csv,text/csv" onChange={(event) => setStatementFile(event.target.files?.[0] ?? null)} />
                            </label>
                            <button className="rounded-xl bg-[#F59E0B] px-4 py-2.5 text-sm font-bold text-[#06151D] disabled:cursor-not-allowed disabled:opacity-50" type="submit" disabled={!statementFile || reconciling}>
                                {reconciling ? 'Checking…' : 'Preview matches'}
                            </button>
                        </form>
                        {reconciliationError && <p role="alert" className="mt-3 text-sm text-rose-300">{reconciliationError}</p>}
                        {reconciliation && <div className="mt-4 space-y-3" role="status">
                            <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
                                <span className="rounded-lg bg-black/20 p-2 text-[#F8F7F3]/75">Rows: {reconciliation.importedRows}</span>
                                <span className="rounded-lg bg-black/20 p-2 text-emerald-200">Matched: {reconciliation.matchedRows}</span>
                                <span className="rounded-lg bg-black/20 p-2 text-amber-200">Exceptions: {reconciliation.exceptionRows}</span>
                                <span className="rounded-lg bg-black/20 p-2 text-[#F8F7F3]/75">Local unmatched: {reconciliation.unmatchedLocalBlocks}</span>
                            </div>
                            {reconciliation.exceptions.length > 0 && <ul className="space-y-1 text-xs text-amber-100">{reconciliation.exceptions.map((item, index) => <li key={`${item.row}-${index}`}>Row {item.row} · {item.reference || '(blank)'} · {item.reason}</li>)}</ul>}
                            <p className="text-[11px] font-medium text-amber-200">Preview only — no bank confirmation, settlement, or funds movement.</p>
                        </div>}
                    </section>
                </>
            )}
        </div>
    );
};

function SummaryCard({ label, value, icon }: { label: string; value: number; icon: ReactNode }) {
    return (
        <div className="rounded-2xl border border-white/10 bg-[#091A20] p-4">
            <div className="flex items-center justify-between text-[#F8F7F3]/65"><span>{label}</span>{icon}</div>
            <div className="mt-3 text-2xl font-bold text-white">{formatPkr(value)}</div>
        </div>
    );
}

export default MultiTenantKhataDesk;
