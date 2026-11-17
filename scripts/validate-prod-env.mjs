import process from 'node:process';

const isProduction = process.env.NODE_ENV === 'production';

if (!isProduction) {
  console.log('Production validation skipped: NODE_ENV is not production.');
  process.exit(0);
}

const checks = [
  {
    name: 'APP_URL',
    value: process.env.APP_URL,
    validator: (value) => typeof value === 'string' && /^https:\/\//.test(value) && !value.includes('example.com') && !value.includes('localhost') && !value.includes('REPLACE_'),
  },
  {
    name: 'AUTH_SESSION_SECRET',
    value: process.env.AUTH_SESSION_SECRET,
    validator: (value) => typeof value === 'string' && value.length >= 32 && !value.includes('replace_with') && !value.includes('REPLACE_WITH'),
  },
  {
    name: 'SOVEREIGN_CONTROL_PIN',
    value: process.env.SOVEREIGN_CONTROL_PIN,
    validator: (value) => typeof value === 'string' && /^\d{8,12}$/.test(value) && !value.includes('REPLACE_WITH'),
  },
  {
    name: 'PUBLIC_FINTECH_CLAIMS_BLOCKED',
    value: process.env.PUBLIC_FINTECH_CLAIMS_BLOCKED,
    validator: (value) => value === 'true',
  },
];

const failures = checks.filter((entry) => !entry.validator(entry.value)).map((entry) => entry.name);
const judgePin = process.env.ISEF_JUDGE_PIN;
if (judgePin && (!/^\d{8,12}$/.test(judgePin) || judgePin === process.env.SOVEREIGN_CONTROL_PIN)) {
  failures.push('ISEF_JUDGE_PIN (must be a distinct 8-12 digit PIN)');
}

if (failures.length > 0) {
  console.error('Production startup blocked. Missing or invalid environment values:', failures.join(', '));
  console.error('Set valid APP_URL, AUTH_SESSION_SECRET, SOVEREIGN_CONTROL_PIN, and PUBLIC_FINTECH_CLAIMS_BLOCKED=true before starting in production.');
  process.exit(1);
}

console.log('Production environment validation passed.');
