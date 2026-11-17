import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

const ROOT = process.cwd();
const findings = [];

function addFinding(severity, category, file, issue, modernSolution) {
  findings.push({ severity, category, file, issue, modernSolution });
}

function walkFiles(dir, extFilter = null) {
  const results = [];
  if (!fs.existsSync(dir)) return results;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (['node_modules', '.git', 'dist', 'data'].includes(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...walkFiles(full, extFilter));
    } else if (!extFilter || extFilter.test(entry.name)) {
      results.push(full);
    }
  }
  return results;
}

console.log('======================================================================');
console.log('   BOLMIZAN — FULL-STACK DEEP FORENSIC & SECURITY AUDIT (2026)        ');
console.log('======================================================================\n');

// 1. ROOT DUPLICATION CHECK
for (const file of ['bolmizanFinalCore.ts', 'scamClassifier.ts']) {
  if (fs.existsSync(path.join(ROOT, file)) && fs.existsSync(path.join(ROOT, 'server', file))) {
    addFinding(
      'HIGH',
      'Architecture Drift',
      file,
      `Duplicate core module at root (${file}) alongside server/${file}.`,
      `Delete root ${file} so all imports strictly use ./server/${file}.`
    );
  }
}

// 2. FRONTEND-TO-BACKEND API ROUTE WIRING VERIFICATION
const serverFile = path.join(ROOT, 'server.ts');
const serverDirFiles = walkFiles(path.join(ROOT, 'server'), /\.ts$/);
let backendCode = fs.existsSync(serverFile) ? fs.readFileSync(serverFile, 'utf8') : '';
for (const sf of serverDirFiles) backendCode += '\n' + fs.readFileSync(sf, 'utf8');

const definedRoutes = new Set();
const routeDefRegex = /\.(get|post|put|delete|patch)\(\s*['"`](\/api\/[^'"`]+)['"`]/g;
let match;
while ((match = routeDefRegex.exec(backendCode)) !== null) {
  definedRoutes.add(match.replace(/\/:[^/]+/g, '/:param'));
}

const frontendFiles = walkFiles(path.join(ROOT, 'src'), /\.(tsx?|jsx?)$/);
const fetchRegex = /fetch\(\s*['"`](\/api\/[^'"`?]+)['"`]/g;

for (const ff of frontendFiles) {
  const content = fs.readFileSync(ff, 'utf8');
  const relPath = path.relative(ROOT, ff);
  let fMatch;
  while ((fMatch = fetchRegex.exec(content)) !== null) {
    const calledApi = fMatch;
    const normalizedCall = calledApi.replace(/\/\$\{[^}]+\}/g, '/:param');
    if (!definedRoutes.has(calledApi) && !definedRoutes.has(normalizedCall)) {
      addFinding(
        'CRITICAL',
        'Broken API Wiring',
        relPath,
        `Frontend calls "${calledApi}" which is NOT implemented in server.ts or server/*.ts.`,
        `Implement ${calledApi} in server.ts with Zod validation or remove dead UI call.`
      );
    }
  }
}

// 3. SECURITY & CRYPTO HYGIENE AUDIT
const allCodeFiles = [...frontendFiles, ...serverDirFiles, ...(fs.existsSync(serverFile) ? [serverFile] : [])];
for (const cf of allCodeFiles) {
  const content = fs.readFileSync(cf, 'utf8');
  const relPath = path.relative(ROOT, cf);

  if (/Math\.random\(\)/.test(content) && /(token|secret|key|hash|pin|idempotency|session)/i.test(content)) {
    addFinding(
      'MEDIUM',
      'Weak Entropy',
      relPath,
      'Math.random() used near security/idempotency identifiers.',
      'Replace Math.random() with crypto.randomUUID() for cryptographic unpredictability.'
    );
  }
  if (/dangerouslySetInnerHTML/.test(content)) {
    addFinding(
      'HIGH',
      'XSS Surface',
      relPath,
      'dangerouslySetInnerHTML detected; potential XSS vector.',
      'Render via safe React text nodes instead of raw HTML injection.'
    );
  }
}

const envPath = path.join(ROOT, '.env');
if (fs.existsSync(envPath) && /ISEF_JUDGE_PIN=112233/.test(fs.readFileSync(envPath, 'utf8'))) {
  addFinding(
    'HIGH',
    'Default Credential',
    '.env',
    'ISEF_JUDGE_PIN is set to weak default PIN (112233).',
    'Rotate ISEF_JUDGE_PIN to an 8+ digit random PIN before public demo.'
  );
}

// 4. BUNDLE SIZE & HEAVY DEPENDENCY AUDIT
for (const ff of frontendFiles) {
  const content = fs.readFileSync(ff, 'utf8');
  const relPath = path.relative(ROOT, ff);

  if (/import\s+\*\s+as\s+d3\s+from\s+['"]d3['"]/.test(content)) {
    addFinding(
      'MEDIUM',
      'Bundle Bloat (>500kB)',
      relPath,
      'Full namespace import (`import * as d3 from "d3"`) pulls ~280 kB.',
      'Import only needed micro-modules (`d3-scale`, `d3-shape`) to cut bundle size.'
    );
  }
  if (relPath === 'src\\App.tsx' || relPath === 'src/App.tsx') {
    const eagerMatches = content.match(/^import\s+\{[^}]+\}\s+from\s+['"]\.\/components\/[^'"]+['"]/gm) || [];
    if (eagerMatches.length > 8) {
      addFinding(
        'MEDIUM',
        'Initial Load Latency',
        relPath,
        `${eagerMatches.length} components are eagerly imported on initial load.`,
        'Convert heavy overlays to React.lazy() for faster low-end Android startup.'
      );
    }
  }
}

// 5. TYPESCRIPT STRICT CHECK
let tscStatus = 'PASS';
try {
  execSync('npx tsc --noEmit', { stdio: 'pipe' });
} catch {
  tscStatus = 'FAIL';
  addFinding(
    'CRITICAL',
    'TypeScript Compilation',
    'tsconfig.json',
    'TypeScript compiler reported type errors.',
    'Run `npx tsc --noEmit` to inspect exact errors.'
  );
}

// 6. SAVE & DISPLAY REPORT
const severityOrder = { CRITICAL: 1, HIGH: 2, MEDIUM: 3, LOW: 4 };
findings.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);

let md = `# BolMizan — Deep Forensic Engineering & Security Audit\n\n`;
md += `**Audit Timestamp:** ${new Date().toISOString()}\n`;
md += `**TypeScript Strict Check:** ${tscStatus}\n`;
md += `**Defined Backend APIs:** ${definedRoutes.size} routes detected\n`;
md += `**Frontend Source Files Scanned:** ${frontendFiles.length} files\n\n`;
md += `## Detailed Findings & Modern Solutions\n\n`;

findings.forEach((f, idx) => {
  md += `### ${idx + 1}. [${f.severity}] ${f.category} — \`${f.file}\`\n`;
  md += `- **Problem:** ${f.issue}\n`;
  md += `- **Verified Modern Solution:** ${f.modernSolution}\n\n`;
});

fs.mkdirSync(path.join(ROOT, 'data'), { recursive: true });
fs.writeFileSync(path.join(ROOT, 'data', 'FORENSIC_AUDIT_REPORT.md'), md, 'utf8');

console.log(`Scanned ${frontendFiles.length} frontend files & ${definedRoutes.size} API routes.`);
console.log(`TypeScript Check: ${tscStatus}`);
console.table(findings.map((f) => ({
  Severity: f.severity,
  Category: f.category,
  File: f.file,
  Issue: f.issue.slice(0, 65) + (f.issue.length > 65 ? '...' : ''),
})));
console.log('\nFull report saved to -> data/FORENSIC_AUDIT_REPORT.md');
