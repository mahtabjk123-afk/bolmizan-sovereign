import 'dotenv/config';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express, { type Request, type Response } from 'express';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import { productionDb } from './server/realDatabase.ts';
import {
  buildRealSbpRaastQr,
  sendRealWhatsappMessage,
  verifyJazzCashReturnHash,
} from './server/realGateways.ts';
import {
  runTruthFilter,
  sovereignStore,
  verifyIntentCognitiveFirewall,
} from './server/sovereignEngine.ts';
import { askMizanAdvisor, extractMultilingualVoiceOrText } from './server/voiceAndAi.ts';
import {
  createTenantSessionToken,
  isSameOriginRequest,
  readTenantSessionCookie,
  serializeClearedTenantSessionCookie,
  serializeTenantSessionCookie,
  isSovereignMutationDisabledInProduction,
  parseTrustedProxyHops,
  sanitizeSovereignStateForProduction,
  validateSessionSecret,
  verifyTenantSessionToken,
} from './server/tenantSession.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function validateProductionRuntime(): void {
  if (process.env.NODE_ENV !== 'production') return;

  const appUrl = String(process.env.APP_URL || '').trim();
  const sessionSecret = String(process.env.AUTH_SESSION_SECRET || '').trim();
  const sovereignPin = String(process.env.SOVEREIGN_CONTROL_PIN || '').trim();

  const failures: string[] = [];

  if (!/^https:\/\//.test(appUrl) || appUrl.includes('example.com') || appUrl.includes('localhost') || appUrl.includes('REPLACE_')) {
    failures.push('APP_URL');
  }

  if (sessionSecret.length < 32 || sessionSecret.includes('replace_with') || sessionSecret.includes('REPLACE_WITH')) {
    failures.push('AUTH_SESSION_SECRET');
  }

  if (!/^\d{8,12}$/.test(sovereignPin) || sovereignPin.includes('REPLACE_WITH')) {
    failures.push('SOVEREIGN_CONTROL_PIN');
  }

  if (failures.length > 0) {
    throw new Error(`Production startup blocked. Set valid values for: ${failures.join(', ')}.`);
  }
}

function requireSameOriginMutation(req: Request, res: Response): boolean {
  if (!isSameOriginRequest(req.get('origin'), req.get('host'), process.env.NODE_ENV === 'production')) {
    res.status(403).json({ error: 'Request origin could not be verified.' });
    return false;
  }
  return true;
}

function readVerifiedTenantSession(req: Request, res: Response) {
  const token = readTenantSessionCookie(req.get('cookie'));
  const secret = validateSessionSecret(process.env.AUTH_SESSION_SECRET, process.env.NODE_ENV === 'production');
  const claims = token ? verifyTenantSessionToken(token, secret) : null;
  if (!claims) {
    res.setHeader('Set-Cookie', serializeClearedTenantSessionCookie(process.env.NODE_ENV === 'production'));
    res.status(401).json({ error: 'A valid session for this shop is required.' });
    return null;
  }
  return claims;
}

function requireTenantSession(req: Request, res: Response, expectedTenantId: string): boolean {
  const claims = readVerifiedTenantSession(req, res);
  if (!claims) return false;
  if (claims.tenantId !== expectedTenantId) {
    res.status(403).json({ error: 'This session is not authorized for the requested shop.' });
    return false;
  }
  return true;
}

async function startProductionServer() {
  validateProductionRuntime();
  const isProduction = process.env.NODE_ENV === 'production';
  const sessionSecret = validateSessionSecret(process.env.AUTH_SESSION_SECRET, isProduction);
  const app = express();
  app.set('trust proxy', parseTrustedProxyHops(process.env.TRUST_PROXY_HOPS));
  app.use(
    helmet({
      contentSecurityPolicy: isProduction
        ? {
          directives: {
            defaultSrc: ["'self'"],
            baseUri: ["'self'"],
            fontSrc: ["'self'", 'https://fonts.gstatic.com', 'data:'],
            formAction: ["'self'"],
            frameAncestors: ["'none'"],
            imgSrc: ["'self'", 'data:', 'blob:'],
            objectSrc: ["'none'"],
            scriptSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
          },
        }
        : false,
      crossOriginEmbedderPolicy: false,
      frameguard: { action: 'deny' },
    }),
  );
  app.use(express.json({ limit: '8mb' }));

  app.use('/api', (req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Pragma', 'no-cache');
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.setHeader('Cache-Control', 'no-store');
    }
    next();
  });

  const apiLimiter = rateLimit({
    windowMs: 60_000,
    max: 240,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many requests. Please wait a minute.' },
  });
  const authLimiter = rateLimit({
    windowMs: 60_000,
    max: 25,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many PIN attempts. Wait 60 seconds.' },
  });
  const aiLimiter = rateLimit({
    windowMs: 60_000,
    max: 12,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'AI request limit reached. Try again in a minute.' },
  });
  app.use('/api', apiLimiter);

  app.use('/api/sovereign', (req, res, next) => {
    if (isSovereignMutationDisabledInProduction(req.method, req.path, isProduction)) {
      res.status(503).json({
        error: 'This shared sovereign operation is disabled in production until role-based authorization is deployed.',
      });
      return;
    }
    next();
  });

  // 1. Health & Connector Readiness Check
  app.get('/api/health', (_req, res) => {
    res.json({
      ok: true,
      service: 'BolMizan Production Khata & Anti-Scam OS',
      database: 'SQLite WAL Multi-Tenant Active',
      persistence: 'durable_sqlite_wal',
      productionStatus: 'pilot_only',
      publicFintechClaimsBlocked: true,
      merchantEnrollment: isProduction ? 'disabled_until_phone_verification_is_configured' : 'local',
      connectors: {
        geminiAi: Boolean(process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY !== 'MY_GEMINI_API_KEY'),
        whatsappCloudApi: Boolean(process.env.WHATSAPP_CLOUD_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID),
        jazzCashMerchant: Boolean(process.env.JAZZCASH_INTEGRITY_SALT),
      },
      complianceBoundaries: {
        realKycRequired: true,
        realPaymentProviderIntegrationRequired: true,
        realMoneyMovementBlocked: true,
        walletOrBankBrandingBlocked: true,
        publicFintechClaimsBlocked: true,
      },
      timestamp: new Date().toISOString(),
    });
  });

  // 2. Multi-Tenant Shopkeeper Login / Registration (Strict Tenant Isolation)
  app.post('/api/tenant/auth', authLimiter, (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    if (!requireSameOriginMutation(req, res)) return;
    const { phone, pin, businessName, ownerName, city, raastIban } = req.body ?? {};
    if (typeof phone !== 'string' || typeof pin !== 'string') {
      res.status(400).json({ error: 'Mobile number and 4-6 digit PIN are required.' });
      return;
    }
    const result = productionDb.registerOrLoginShop({
      phone,
      pin,
      businessName: typeof businessName === 'string' ? businessName : undefined,
      ownerName: typeof ownerName === 'string' ? ownerName : undefined,
      city: typeof city === 'string' ? city : undefined,
      raastIban: typeof raastIban === 'string' ? raastIban : undefined,
    }, !isProduction);
    if (!result.ok) {
      res.status(401).json({ error: result.error });
      return;
    }
    const token = createTenantSessionToken(result.tenant.id, sessionSecret);
    res.setHeader('Set-Cookie', serializeTenantSessionCookie(token, isProduction));
    const ledger = productionDb.getTenantLedger(result.tenant.id);
    const chain = productionDb.verifyTenantChain(result.tenant.id);
    res.json({ ok: true, isNew: result.isNew, tenant: result.tenant, ledger, chain });
  });

  app.post('/api/tenant/logout', (req, res) => {
    if (!requireSameOriginMutation(req, res)) return;
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Set-Cookie', serializeClearedTenantSessionCookie(isProduction));
    res.status(204).end();
  });

  app.get('/api/tenant/session', (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    const claims = readVerifiedTenantSession(req, res);
    if (!claims) return;
    const tenant = productionDb.getTenantById(claims.tenantId);
    if (!tenant) {
      res.setHeader('Set-Cookie', serializeClearedTenantSessionCookie(isProduction));
      res.status(401).json({ error: 'Shop account no longer exists.' });
      return;
    }
    res.json({ tenant, ledger: productionDb.getTenantLedger(tenant.id), chain: productionDb.verifyTenantChain(tenant.id) });
  });

  // 3. Get Isolated Shopkeeper Ledger
  app.get('/api/tenant/:tenantId/ledger', (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    if (!requireTenantSession(req, res, req.params.tenantId)) return;
    const tenant = productionDb.getTenantById(req.params.tenantId);
    if (!tenant) {
      res.status(404).json({ error: 'Shopkeeper account not found.' });
      return;
    }
    const ledger = productionDb.getTenantLedger(tenant.id);
    const chain = productionDb.verifyTenantChain(tenant.id);
    res.json({ tenant, ledger, chain });
  });

  // 4. Append Zero-Riba Entry + Generate SBP Raast EMVCo QR + Auto-Send WhatsApp Parchi
  app.post('/api/tenant/:tenantId/ledger', async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    if (!requireSameOriginMutation(req, res)) return;
    if (!requireTenantSession(req, res, req.params.tenantId)) return;
    const tenant = productionDb.getTenantById(req.params.tenantId);
    if (!tenant) {
      res.status(404).json({ error: 'Shopkeeper account not found.' });
      return;
    }
    const idempotencyKey = req.get('idempotency-key')?.trim() || '';
    if (!/^[A-Za-z0-9._:-]{8,128}$/.test(idempotencyKey)) {
      res.status(400).json({ error: 'A unique Idempotency-Key header (8 to 128 safe characters) is required.' });
      return;
    }
    const { partyName, partyPhone, entryType, amountPkr, itemsSummary, autoWhatsapp } = req.body ?? {};
    if (
      typeof partyName !== 'string' ||
      partyName.trim().length === 0 ||
      partyName.length > 120 ||
      (partyPhone !== undefined && (typeof partyPhone !== 'string' || partyPhone.length > 32)) ||
      (itemsSummary !== undefined && (typeof itemsSummary !== 'string' || itemsSummary.length > 500)) ||
      !Number.isSafeInteger(amountPkr) ||
      amountPkr <= 0 ||
      amountPkr > 1_000_000_000_000 ||
      (entryType !== undefined && !['udhaar_given', 'payment_received', 'cash_sale'].includes(entryType)) ||
      (autoWhatsapp !== undefined && typeof autoWhatsapp !== 'boolean')
    ) {
      res.status(400).json({ error: 'Customer name and positive PKR amount are required.' });
      return;
    }

    let appendResult;
    try {
      appendResult = productionDb.appendTenantBlock({
        tenantId: tenant.id,
        idempotencyKey,
        partyName: String(partyName),
        partyPhone: partyPhone || '',
        entryType: entryType || 'udhaar_given',
        amountPkr,
        itemsSummary: itemsSummary || 'Mandi / Shop Trade Goods',
      });
    } catch (error) {
      if (error instanceof Error && error.name === 'IdempotencyConflictError') {
        res.status(409).json({ error: error.message });
        return;
      }
      throw error;
    }
    const { block, replayed } = appendResult;

    const registeredRaastId = tenant.raastIban || process.env.DEFAULT_RAAST_IBAN?.trim() || '';
    const raastQrPayload = registeredRaastId ? buildRealSbpRaastQr({
      merchantName: tenant.businessName,
      city: tenant.city,
      raastIdOrIban: registeredRaastId,
      amountPkr: block.amount_pkr,
      reference: `BLK-${block.block_index}`,
    }) : null;

    let whatsappDelivery = null;
    if (!replayed && autoWhatsapp && block.party_phone) {
      const label =
        block.entry_type === 'payment_received'
          ? 'Wasooli (Payment Received)'
          : block.entry_type === 'cash_sale'
            ? 'Naqad Sale'
            : 'Udhaar (Credit)';
      const receiptText = `${tenant.businessName} (${tenant.city})\nParchi #${block.block_index}: ${label}\nCustomer: ${block.party_name}\nAmount: PKR ${block.amount_pkr.toLocaleString('en-US')} (0% Riba)\nGoods: ${block.items_summary}\nSHA-256: ${block.block_hash.slice(0, 16)}`;
      whatsappDelivery = await sendRealWhatsappMessage({
        recipientPhone: block.party_phone,
        messageText: receiptText,
      });
    }

    res.status(replayed ? 200 : 201).json({
      block,
      replayed,
      raastQrPayload,
      whatsappDelivery,
      chain: productionDb.verifyTenantChain(tenant.id),
    });
  });

  app.post('/api/tenant/:tenantId/reconciliation/preview', (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    if (!requireSameOriginMutation(req, res)) return;
    if (!requireTenantSession(req, res, req.params.tenantId)) return;
    const rows = req.body?.entries;
    if (
      !Array.isArray(rows) ||
      rows.length === 0 ||
      rows.length > 2000 ||
      rows.some((row) =>
        !row ||
        typeof row.reference !== 'string' ||
        !/^BLK-\d{1,12}$/.test(row.reference) ||
        !Number.isSafeInteger(row.amountPkr) ||
        row.amountPkr <= 0 ||
        row.currency !== 'PKR'
      )
    ) {
      res.status(400).json({ error: 'Provide 1–2,000 statement rows with reference BLK-<number>, positive integer amountPkr, and PKR currency.' });
      return;
    }
    res.json(productionDb.previewTenantStatementReconciliation(req.params.tenantId, rows));
  });

  // 5. Real JazzCash Merchant Return Webhook Verifier
  app.post('/api/payments/jazzcash-webhook', (req, res) => {
    const valid = verifyJazzCashReturnHash(req.body ?? {});
    if (!valid) {
      res.status(401).json({ error: 'Invalid JazzCash HMAC-SHA256 pp_SecureHash signature.' });
      return;
    }
    // A valid signature alone does not prove the payment was captured, settled, or not replayed.
    res.status(501).json({
      signatureValid: true,
      accepted: false,
      error: 'Signature verified; payment status reconciliation and replay protection are not configured.',
    });
  });

  // 6. Anti-Scam Cognitive Firewall (Blocks Fake 8171 / Bank / OTP Calls & SMS)
  app.post('/api/scam-shield/scan', (req, res) => {
    const transcript = String(req.body?.transcript || '').trim();
    if (!transcript) {
      res.status(400).json({ error: 'Paste SMS or call transcript to scan.' });
      return;
    }
    const result = verifyIntentCognitiveFirewall({
      transcript,
      keystrokeIntervalsMs: Array.isArray(req.body?.keystrokeIntervalsMs)
        ? req.body.keystrokeIntervalsMs
        : [],
      actionContext: String(req.body?.actionContext || 'shopkeeper_scam_shield'),
    });
    sovereignStore.recordIntentResult(result);
    res.json(result);
  });

  // 7. Gemini 2.5 Flash Voice-to-Hisab & Mizan Shariah Advisor
  app.post('/api/ai/extract-voice', aiLimiter, async (req, res) => {
    const { text, audioBase64, mimeType } = req.body ?? {};
    if (!text && !audioBase64) {
      res.status(400).json({ error: 'Provide voice audio or text note.' });
      return;
    }
    const result = await extractMultilingualVoiceOrText({ text, audioBase64, mimeType });
    res.json(result);
  });

  app.post('/api/ai/mizan-advisor', aiLimiter, async (req, res) => {
    const question = String(req.body?.question || '').trim();
    if (!question) {
      res.status(400).json({ error: 'Question is required.' });
      return;
    }
    const result = await askMizanAdvisor({
      question,
      language: String(req.body?.language || 'Urdu'),
    });
    res.json(result);
  });

  // 8. BolMizan VERITAS-SOVEREIGN OS v30.0 Full Sovereign State & Treasury Endpoints
  app.get('/api/sovereign/state', (_req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    const state = sovereignStore.getState();
    if (isProduction) {
      res.json(sanitizeSovereignStateForProduction(state));
      return;
    }
    res.json(state);
  });

  app.post('/api/sovereign/kill-switch', authLimiter, (req, res) => {
    if (!requireSameOriginMutation(req, res)) return;
    if (isProduction) {
      res.status(503).json({ error: 'This local demo control is disabled in production until durable role-based authentication is deployed.' });
      return;
    }
    const pin = String(req.body?.pin || '');
    const action = req.body?.action === 'restore' ? 'restore' : 'freeze';
    const result = sovereignStore.toggleKillSwitch({ pin, action });
    if (!result.ok) {
      res.status(401).json(result);
      return;
    }
    res.json(result);
  });

  app.post('/api/sovereign/truth-filter', (req, res) => {
    const content = String(req.body?.content || '').trim();
    if (!content) {
      res.status(400).json({ error: 'Document content or claim is required.' });
      return;
    }
    const docType =
      req.body?.documentType === 'digital-invoice' || req.body?.documentType === 'media-claim'
        ? req.body.documentType
        : 'whatsapp-forward';
    const result = runTruthFilter({
      content,
      documentType: docType,
      declaredHash: req.body?.declaredHash ? String(req.body.declaredHash) : undefined,
      claimedTotal:
        typeof req.body?.claimedTotal === 'number' ? req.body.claimedTotal : undefined,
      lineItems: Array.isArray(req.body?.lineItems) ? req.body.lineItems : undefined,
    });
    res.json(result);
  });

  app.post('/api/sovereign/deals', (req, res) => {
    const body = req.body ?? {};
    if (!body.title || !body.commodity || !Number(body.dealValuePkr)) {
      res.status(400).json({ error: 'Deal title, commodity, and positive PKR value required.' });
      return;
    }
    const dealValuePkr = Math.max(1000, Math.round(Number(body.dealValuePkr)));
    const deal = sovereignStore.createDeal({
      title: String(body.title),
      sector: body.sector === 'sector-2-solar-energy' ? 'sector-2-solar-energy' : 'sector-1-food-water',
      commodity: String(body.commodity),
      originCity: String(body.originCity || 'Sakrand, Sindh'),
      destinationCity: String(body.destinationCity || 'Riyadh, Saudi Arabia'),
      supplierName: String(body.supplierName || 'Sakrand Producers Syndicate'),
      buyerName: String(body.buyerName || 'Gulf Halal Foods LLC'),
      dealValuePkr,
      dealValueUsd: Math.round(dealValuePkr / 278),
      ujrahMarginPct: Number(body.ujrahMarginPct ?? 6.5),
      mudarabahEquitySharePct: Number(body.mudarabahEquitySharePct ?? 0),
      syndicateMembers: Math.max(1, Number(body.syndicateMembers ?? 1)),
      khufiyaSadaqahPct: Math.max(5, Math.min(10, Number(body.khufiyaSadaqahPct ?? 7))),
      niyatChecklist: {
        halalOrigin: true,
        zeroRiba: true,
        zeroDeception: true,
        haqEMazdoorPriority: true,
      },
      defectDisclosure: String(
        body.defectDisclosure || '0.8% natural transit variance disclosed upfront per Siddiq (RA) protocol.',
      ),
      warehouseProof: {
        videoFileRef: String(body.videoFileRef || 'sakrand_warehouse_gps_live.mp4'),
        gpsCoords: String(body.gpsCoords || '26.1384° N, 68.2747° E (Sakrand)'),
        capturedAt: new Date().toISOString(),
        verified: true,
      },
    });
    res.status(201).json({ deal, state: sovereignStore.getState() });
  });

  app.post('/api/sovereign/deals/:id/attest', (req, res) => {
    const witness1 = String(req.body?.witness1 || '').trim();
    const witness2 = String(req.body?.witness2 || '').trim();
    if (!witness1 || !witness2) {
      res.status(400).json({ error: 'Two Otaq Majlis witnesses are required per Quran 2:282.' });
      return;
    }
    const deal = sovereignStore.attestDeal(req.params.id, witness1, witness2);
    if (!deal) {
      res.status(404).json({ error: 'Deal not found.' });
      return;
    }
    res.json({ deal, state: sovereignStore.getState() });
  });

  app.post('/api/sovereign/mukasa/add', (req, res) => {
    const { from, to, amountPkr, invoiceRef } = req.body ?? {};
    if (!from || !to || !Number(amountPkr)) {
      res.status(400).json({ error: 'Debtor, creditor, and amountPkr are required.' });
      return;
    }
    const edge = sovereignStore.addMukasaEdge(
      String(from),
      String(to),
      Number(amountPkr),
      String(invoiceRef || ''),
    );
    res.status(201).json({ edge, state: sovereignStore.getState() });
  });

  app.post('/api/sovereign/mukasa/clear', (_req, res) => {
    const report = sovereignStore.clearMukasa();
    res.json({ report, state: sovereignStore.getState() });
  });

  app.post('/api/sovereign/wages/add', (req, res) => {
    const { workerName, role, raastId, amountPkr, sadaqahPct } = req.body ?? {};
    if (!workerName || !raastId || !Number(amountPkr)) {
      res.status(400).json({ error: 'Worker name, Raast ID, and wage amount required.' });
      return;
    }
    const payout = sovereignStore.addWage(
      String(workerName),
      String(role || 'Mill Worker'),
      String(raastId),
      Number(amountPkr),
      Number(sadaqahPct ?? 5),
    );
    res.status(201).json({ payout, state: sovereignStore.getState() });
  });

  app.post('/api/sovereign/wages/:id/settle', (req, res) => {
    const result = sovereignStore.settleWage(req.params.id);
    if (!result.ok) {
      res.status(400).json(result);
      return;
    }
    res.json({ ...result, state: sovereignStore.getState() });
  });

  app.post('/api/sovereign/maal-guard/:id/rescue', (req, res) => {
    const rescuedBy = String(req.body?.rescuedBy || 'Sakrand Bulk Syndicate');
    const result = sovereignStore.rescueMaalGuard(req.params.id, rescuedBy);
    if (!result.ok) {
      res.status(400).json(result);
      return;
    }
    res.json({ ...result, state: sovereignStore.getState() });
  });

  app.post('/api/sovereign/reset', authLimiter, (req, res) => {
    if (!requireSameOriginMutation(req, res)) return;
    if (isProduction) {
      res.status(503).json({ error: 'Demo reset is disabled in production.' });
      return;
    }
    const pin = String(req.body?.pin || '');
    const result = sovereignStore.resetDemoState(pin);
    if (!result.ok) {
      res.status(401).json(result);
      return;
    }
    res.json(result);
  });

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true, hmr: false },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.join(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  const port =
    process.env.NODE_ENV === 'production'
      ? Number(process.env.PORT) || 3000
      : Number(process.env.DEFAULT_APP_PORT) || 3000;
  const host = process.env.HOST?.trim() || '0.0.0.0';
  const server = http.createServer(app);
  server.listen(port, host, () => {
    console.log(`BolMizan Production Khata OS listening on http://${host}:${port}`);
  });
}

startProductionServer().catch((err) => {
  console.error('Failed to start BolMizan Production server:', err);
  process.exit(1);
});
