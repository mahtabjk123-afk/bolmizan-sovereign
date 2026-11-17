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

// -------------------------------------------------------------------------
// 1. ROOT DUPLICATION & ARCHITECTURE HYGIENE CHECK
// -------------------------------------------------------------------------
const rootTsFiles = ['bolmizanFinalCore.ts', 'scamClassifier.ts'];
for (const file of rootTsFiles) {
    if (fs.existsSync(path.join(ROOT, file)) && fs.existsSync(path.join(ROOT, 'server', file))) {
        addFinding(
            'HIGH',
            'Architecture Drift',
            file,
            `Duplicate core module exists at root (${file}) alongside server/${file}. Risk of importing stale logic.`,
            `Remove root ${file} after verifying no script imports it, or re-export strictly from ./server/${file}.`
        );
    }
}

// -------------------------------------------------------------------------
// 2. FRONTEND-TO-BACKEND API ROUTE WIRING VERIFICATION
// -------------------------------------------------------------------------
const serverFile = path.join(ROOT, 'server.ts');
const serverDirFiles = walkFiles(path.join(ROOT, 'server'), /\.ts$/);
let backendCode = fs.existsSync(serverFile) ? fs.readFileSync(serverFile, 'utf8') : '';
for (const sf of serverDirFiles) {
    backendCode += '\n' + fs.readFileSync(sf, 'utf8');
}

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
                `Implement ${calledApi} in server.ts with Zod schema validation or disable the UI trigger until ready.`
            );
        }
    }
}

// -------------------------------------------------------------------------
// 3. SECURITY, CRYPTO & SECRETS HYGIENE AUDIT
// -------------------------------------------------------------------------
const allCodeFiles = [...frontendFiles, ...serverDirFiles, ...(fs.existsSync(serverFile) ? [serverFile] : [])];

for (const cf of allCodeFiles) {
    const content = fs.readFileSync(cf, 'utf8');
    const relPath = path.relative(ROOT, cf);

    // Check for weak randomness in security-sensitive contexts
    if (/Math\.random\(\)/.test(content) && /(token|secret|key|hash|pin|idempotency|session)/i.test(content)) {
        addFinding(
            'MEDIUM',
            'Weak Entropy',
            relPath,
            'Math.random() used near security/idempotency identifiers.',
            'Replace Math.random() with crypto.randomUUID() or crypto.getRandomValues() for cryptographic unpredictability.'
        );
    }

    // Check for raw innerHTML / dangerouslySetInnerHTML
    if (/dangerouslySetInnerHTML/.test(content)) {
        addFinding(
            'HIGH',
            'XSS Surface',
            relPath,
            'dangerouslySetInnerHTML detected; potential XSS vector if user/SMS text is rendered.',
            'Sanitize content strictly or render via safe React text nodes.'
        );
    }
}

// Check .env safety
const envPath = path.join(ROOT, '.env');
if (fs.existsSync(envPath)) {
    const envText = fs.readFileSync(envPath, 'utf8');
    if (/ISEF_JUDGE_PIN=112233/.test(envText)) {
        addFinding(
            'HIGH',
            'Default Credential',
            '.env',
            'ISEF_JUDGE_PIN is still set to default weak PIN (112233).',
            'Rotate ISEF_JUDGE_PIN to a high-entropy 8+ digit PIN before any external demo or VPS deployment.'
        );
    }
}

// -------------------------------------------------------------------------
// 4. BUNDLE SIZE & HEAVY DEPENDENCY AUDIT (VITE >500KB CHECK)
// -------------------------------------------------------------------------
let heavyD3Imports = 0;
let eagerHeavyComponents = 0;
for (const ff of frontendFiles) {
    const content = fs.readFileSync(ff, 'utf8');
    const relPath = path.relative(ROOT, ff);

    if (/import\s+\*\s+as\s+d3\s+from\s+['"]d3['"]/.test(content)) {
        heavyD3Imports++;
        addFinding(
            'MEDIUM',
            'Bundle Bloat (>500kB)',
            relPath,
            'Full namespace import (`import * as d3 from "d3"`) pulls entire D3 library (~280 kB).',
            'Import only needed micro-modules (e.g., `d3-scale`, `d3-shape`, `d3-selection`) to cut bundle size by ~40%.'
        );
    }

    if (relPath === 'src\\App.tsx' || relPath === 'src/App.tsx') {
        const eagerMatches = content.match(/^import\s+\{[^}]+\}\s+from\s+['"]\.\/components\/[^'"]+['"]/gm) || [];
        if (eagerMatches.length > 8) {
            eagerHeavyComponents = eagerMatches.length;
            addFinding(
                'MEDIUM',
                'Initial Load Latency',
                relPath,
                `${eagerHeavyComponents} components are eagerly imported on initial load, slowing down low-end Android 3G/4G startup.`,
                'Convert heavy overlays (CinematicDirectorStage, JudgePassportModal, SindhCultureGallery) to React.lazy().'
            );
        }
    }
}

// -------------------------------------------------------------------------
// 5. TYPECHECK & TEST SUITE VERIFICATION
// -------------------------------------------------------------------------
let tscStatus = 'PASS';
try {
    execSync('npx tsc --noEmit', { stdio: 'pipe' });
} catch (err) {
    tscStatus = 'FAIL';
    addFinding(
        'CRITICAL',
        'TypeScript Compilation',
        'tsconfig.json',
        'TypeScript compiler reported type errors.',
        'Run `npx tsc --noEmit` to view exact line numbers and resolve strict type mismatches.'
    );
}

// -------------------------------------------------------------------------
// 6. GENERATE EXECUTIVE MARKDOWN REPORT
// -------------------------------------------------------------------------
const severityOrder = { CRITICAL: 1, HIGH: 2, MEDIUM: 3, LOW: 4 };
findings.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);

const summaryCounts = {
    CRITICAL: findings.filter((f) => f.severity === 'CRITICAL').length,
    HIGH: findings.filter((f) => f.severity === 'HIGH').length,
    MEDIUM: findings.filter((f) => f.severity === 'MEDIUM').length,
};

let md = `# BolMizan — Deep Forensic Engineering & Security Audit\n\n`;
md += `**Audit Timestamp:** ${new Date().toISOString()}\n`;
md += `**TypeScript Strict Check:** ${tscStatus}\n`;
md += `**Defined Backend APIs:** ${definedRoutes.size} routes detected\n`;
md += `**Frontend Source Files Scanned:** ${frontendFiles.length} files\n\n`;
md += `## Executive Summary\n`;
md += `- **CRITICAL Issues:** ${summaryCounts.CRITICAL}\n`;
md += `- **HIGH Issues:** ${summaryCounts.HIGH}\n`;
md += `- **MEDIUM Issues:** ${summaryCounts.MEDIUM}\n\n`;
md += `## Detailed Findings & Modern Solutions\n\n`;

if (findings.length === 0) {
    md += `All automated checks passed with zero critical or high findings.\n`;
} else {
    findings.forEach((f, idx) => {
        md += `### ${idx + 1}. [${f.severity}] ${f.category} — \`${f.file}\`\n`;
        md += `- **Problem:** ${f.issue}\n`;
        md += `- **Verified Modern Solution:** ${f.modernSolution}\n\n`;
    });
}

fs.mkdirSync(path.join(ROOT, 'data'), { recursive: true });
const reportPath = path.join(ROOT, 'data', 'FORENSIC_AUDIT_REPORT.md');
fs.writeFileSync(reportPath, md, 'utf8');

console.log(`Scanned ${frontendFiles.length} frontend files & ${definedRoutes.size} API routes.`);
console.log(`TypeScript Check: ${tscStatus}`);
console.table(
    findings.map((f) => ({
        Severity: f.severity,
        Category: f.category,
        File: f.file,
        Issue: f.issue.slice(0, 65) + (f.issue.length > 65 ? '...' : ''),
    }))
);
console.log(`\nFull report saved to -> ${reportPath}`);
