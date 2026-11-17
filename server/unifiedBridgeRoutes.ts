import { registerMerchantAccount, authenticateMerchantAccount } from './merchantAccounts';
import { Router, type Request, type Response } from 'express';
import crypto from 'node:crypto';
import { z } from 'zod';
import { solveMukasaCircularDebt, type DebtEdge } from './bolmizanFinalCore';
import { analyzeMessageForScam } from './scamClassifier';

export const unifiedBridgeRouter = Router();

const isProd = () => process.env.NODE_ENV === 'production';

function verifyControlPin(providedPin: unknown): boolean {
  const expected = process.env.SOVEREIGN_CONTROL_PIN || '';
  if (!expected || typeof providedPin !== 'string') return false;
  const a = Buffer.from(providedPin);
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

let pilotDeals: Array<{ id: string; title: string; amountPkr: number; status: string; createdAt: string }> = [];
let pilotMukasaEdges: DebtEdge[] = [];
let pilotWages: Array<{ id: string; worker: string; amountPkr: number; paidAt: string }> = [];

unifiedBridgeRouter.get('/api/tenant/session', (_req: Request, res: Response) => {
  res.json({
    authenticated: false,
    mode: isProd() ? 'PRODUCTION_PIN_GATED' : 'PILOT_WORKSPACE',
    enrollmentEnabled: !isProd(),
  });
});

unifiedBridgeRouter.post('/api/tenant/auth', (req: Request, res: Response) => {
  if (isProd()) return res.status(403).json({ error: 'Tenant self-enrollment disabled in production.' });
  const parsed = z.object({
    tenantId: z.string().min(2).max(64).regex(/^[a-zA-Z0-9_-]+$/),
    pin: z.string().min(4).max(32),
  }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid tenant credentials.' });
  if (!verifyControlPin(parsed.data.pin)) return res.status(401).json({ error: 'Invalid PIN.' });
  return res.json({ ok: true, tenantId: parsed.data.tenantId, role: 'merchant_pilot' });
});

unifiedBridgeRouter.get('/api/sovereign/deals', (_req: Request, res: Response) => {
  return res.json({ deals: isProd() ? [] : pilotDeals });
});

unifiedBridgeRouter.post('/api/sovereign/deals', (req: Request, res: Response) => {
  if (isProd()) return res.status(403).json({ error: 'Shared sovereign writes disabled in production.' });
  const parsed = z.object({ title: z.string().min(1).max(120), amountPkr: z.number().int().positive() }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid deal payload.' });
  const deal = { id: crypto.randomUUID(), ...parsed.data, status: 'OPEN_ZERO_RIBA', createdAt: new Date().toISOString() };
  pilotDeals.unshift(deal);
  return res.status(201).json({ ok: true, deal });
});

unifiedBridgeRouter.post('/api/sovereign/mukasa/add', (req: Request, res: Response) => {
  if (isProd()) return res.status(403).json({ error: 'Shared sovereign writes disabled in production.' });
  const parsed = z.object({ from: z.string().min(1), to: z.string().min(1), amountPkr: z.number().positive() }).safeParse(req.body);
  if (!parsed.success || parsed.data.from.trim() === parsed.data.to.trim()) return res.status(400).json({ error: 'Invalid Mukasa edge.' });
  const edge: DebtEdge = { from: parsed.data.from.trim(), to: parsed.data.to.trim(), amount: Math.round(parsed.data.amountPkr * 100) };
  pilotMukasaEdges.push(edge);
  return res.status(201).json({ ok: true, edgeCount: pilotMukasaEdges.length, edge });
});

unifiedBridgeRouter.post('/api/sovereign/mukasa/clear', (req: Request, res: Response) => {
  if (isProd()) return res.status(403).json({ error: 'Shared sovereign writes disabled in production.' });
  const edges = Array.isArray(req.body?.edges) ? (req.body.edges as DebtEdge[]) : pilotMukasaEdges;
  return res.json({ ok: true, report: solveMukasaCircularDebt(edges) });
});

unifiedBridgeRouter.post('/api/sovereign/wages/add', (req: Request, res: Response) => {
  if (isProd()) return res.status(403).json({ error: 'Shared sovereign writes disabled in production.' });
  const parsed = z.object({ worker: z.string().min(1), amountPkr: z.number().int().positive() }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid wage entry.' });
  const wage = { id: crypto.randomUUID(), worker: parsed.data.worker.trim(), amountPkr: parsed.data.amountPkr, paidAt: new Date().toISOString() };
  pilotWages.unshift(wage);
  return res.status(201).json({ ok: true, wage });
});

unifiedBridgeRouter.post('/api/sovereign/reset', (req: Request, res: Response) => {
  if (!verifyControlPin(req.body?.pin)) return res.status(403).json({ error: 'Valid SOVEREIGN_CONTROL_PIN required.' });
  pilotDeals = []; pilotMukasaEdges = []; pilotWages = [];
  return res.json({ ok: true, resetAt: new Date().toISOString() });
});

unifiedBridgeRouter.post('/api/ai/extract-voice', (req: Request, res: Response) => {
  const transcript = typeof req.body?.transcript === 'string' ? req.body.transcript.trim() : '';
  if (!transcript) return res.status(400).json({ error: 'Transcript required.' });
  const amountMatch = transcript.match(/(?:rs\.?|pkr|روپے|روپيا)?\s*(\d{2,7})/i);
  return res.json({
    ok: true,
    draft: {
      customerName: transcript.split(/\s+/).slice(0, 2).join(' ') || 'Walk-in Customer',
      amountPkr: amountMatch ? Number(amountMatch[1]) : null,
      entryType: /(wasooli|paid|jama|وصول|ادا)/i.test(transcript) ? 'PAYMENT_RECEIVED' : 'CREDIT_GIVEN',
      notes: transcript.slice(0, 200),
    },
    scamAlert: analyzeMessageForScam(transcript),
  });
});

unifiedBridgeRouter.post('/api/ai/mizan-advisor', (req: Request, res: Response) => {
  const query = typeof req.body?.query === 'string' ? req.body.query.trim() : '';
  if (!query) return res.status(400).json({ error: 'Query required.' });
  const hasRiba = /(sood|riba|interest|late fee|penalty|سود|جرمانہ)/i.test(query);
  return res.json({
    ok: true,
    advisory: hasRiba
      ? 'BolMizan Policy: Interest (Riba) and late penalties are blocked. Use fixed-price trade or Mukasa circular debt netting.'
      : 'Keep daily udhaar entries hash-chained and send WhatsApp receipts for every transaction.',
  });
});

// Individual Merchant Self-Registration & Login (SaaS Multi-Merchant)
unifiedBridgeRouter.post('/api/merchants/register', (req: Request, res: Response) => {
  const parsed = z.object({
    shopName: z.string().min(2).max(80),
    phoneNumber: z.string().min(10).max(16),
    pin: z.string().min(4).max(12).regex(/^[0-9]+$/),
  }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Enter valid Shop Name, Phone Number, and 4-12 digit numeric PIN.' });
  try {
    const account = registerMerchantAccount(parsed.data.shopName, parsed.data.phoneNumber, parsed.data.pin);
    return res.status(201).json({ ok: true, account });
  } catch (err) {
    const msg = (err as Error).message || '';
    if (msg.includes('UNIQUE')) return res.status(409).json({ error: 'This phone number is already registered.' });
    return res.status(500).json({ error: 'Registration failed.' });
  }
});

unifiedBridgeRouter.post('/api/merchants/login', (req: Request, res: Response) => {
  const parsed = z.object({
    phoneNumber: z.string().min(10).max(16),
    pin: z.string().min(4).max(12),
  }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid phone number or PIN.' });
  const account = authenticateMerchantAccount(parsed.data.phoneNumber, parsed.data.pin);
  if (!account) return res.status(401).json({ error: 'Incorrect phone number or PIN.' });
  return res.json({ ok: true, account });
});
