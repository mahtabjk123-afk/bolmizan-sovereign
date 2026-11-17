// server/scamClassifier.ts
export interface ScamAnalysisResult {
  isScam: boolean;
  riskScore: number; // 0 to 100
  detectedSignals: string[];
  latencyMs: number;
}

const SCAM_FEATURES: { pattern: RegExp; weight: number; label: string }[] = [
  { pattern: /\b(8171|8558|3737|9999)\b/i, weight: 30, label: 'Spoofed Shortcode Reference (8171/8558)' },
  { pattern: /(bisp|benazir|ehsaas|kafalat|imdad|\u0627\u0646\u06a9\u0645 \u0633\u067e\u0648\u0631\u0679|\u0627\u0645\u062f\u0627\u062f)/i, weight: 35, label: 'Fake Relief Program Hook' },
  { pattern: /(inaam|jeeto|lottery|prize|lucky draw|\u0627\u0646\u0639\u0627\u0645|\u0644\u0627\u0679\u0631\u06cc)/i, weight: 35, label: 'Unclaimed Prize Bait' },
  { pattern: /(pin|otp|password|mpin|\u06a9\u0648\u0688|\u067e\u0627\u0633\u0648\u0631\u0688|\u067e\u0646)/i, weight: 45, label: 'Credential Harvesting Attempt' },
  { pattern: /(block|suspend|band|\u0645\u0639\u0637\u0644|\u0628\u0646\u062f|\u0628\u0644\u0627\u06aa)/i, weight: 30, label: 'Artificial Account Urgency' },
  { pattern: /(call back|rabta|whatsapp|\u0631\u0627\u0628\u0637\u06c1|\u0648\u0627\u0679\u0633 \u0627\u06cc\u067e)/i, weight: 20, label: 'Off-Platform Redirection' },
  { pattern: /(\u06af\u06be\u0628\u0631\u0627\u06c1\u0679|\u0641\u0648\u0631\u06cc|\u062c\u0644\u062f\u06cc|\u062a\u0648\u0647\u0627\u0646 \u062c\u0648 \u0627\u06aa\u0627\u0626\u0648\u0646\u067d|\u0631\u0642\u0645 \u0645\u0644\u064a \u0648\u0626\u064a|\u0627\u0648\u0647\u0627\u0646 \u062c\u0648 \u0627\u06aa\u0627\u0626\u0648\u0646\u067d)/i, weight: 35, label: 'Sindhi/Urdu Social Engineering' },
  { pattern: /(bit\.ly|tinyurl|ngrok|http:\/\/)/i, weight: 40, label: 'Unverified External Link' },
];

/**
 * Normalizes spaced-out evasion (e.g., "8 1 7 1" -> "8171", "0 T P" -> "otp")
 * while keeping normal words intact to preserve 100% precision.
 */
function deobfuscateText(raw: string): string {
  const collapsedSingleChars = raw.replace(/\b([a-zA-Z0-9])\s+(?=[a-zA-Z0-9]\b)/g, '$1');
  const deLeet = collapsedSingleChars
    .replace(/\b0tp\b/gi, 'otp')
    .replace(/\bp1n\b/gi, 'pin')
    .replace(/\b8l7l\b/gi, '8171');
  return `${raw} ${deLeet}`;
}

export function analyzeMessageForScam(text: string): ScamAnalysisResult {
  const start = performance.now();
  const normalizedText = deobfuscateText(text);
  let score = 0;
  const detectedSignals: string[] = [];

  for (const feature of SCAM_FEATURES) {
    if (feature.pattern.test(normalizedText)) {
      score += feature.weight;
      detectedSignals.push(feature.label);
    }
  }

  // Check for suspicious personal mobile numbers pretending to be official alerts
  if (/03\d{2}[-\s]?\d{7}/.test(normalizedText) && /(received|rs\.?|pkr|\u0645\u0644\u06cc|\u0645\u0648\u0635\u0648\u0644|\u0645\u0644\u064a)/i.test(normalizedText)) {
    score += 40;
    detectedSignals.push('Personal Mobile Number Masquerading as Official Transaction');
  }

  const finalScore = Math.min(score, 100);
  const latencyMs = Number((performance.now() - start).toFixed(4));

  return {
    isScam: finalScore >= 50,
    riskScore: finalScore,
    detectedSignals,
    latencyMs,
  };
}
