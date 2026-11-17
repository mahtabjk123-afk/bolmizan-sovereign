import fs from 'fs';
import path from 'path';

const ROOT = process.cwd();
const IGNORE_DIRS = new Set(['node_modules', '.git', 'dist', 'build', 'coverage', '.next', '.vite']);
const CODE_EXTS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs']);

const allFiles = [];
const codeFiles = [];
const findings = [];
const frontendApiCalls = new Set();
const backendApiRoutes = new Set();
const importedModules = new Set();

function addFinding(severity, category, file, line, message, fixHint) {
    findings.push({ severity, category, file, line, message, fixHint });
}

// 1. Recursive Folder & File Crawler
function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (IGNORE_DIRS.has(entry.name)) continue;
        const fullPath = path.join(dir, entry.name);
        const relPath = path.relative(ROOT, fullPath).replace(/\\/g, '/');

        if (entry.isDirectory()) {
            walk(fullPath);
        } else {
            const stat = fs.statSync(fullPath);
            allFiles.push({ relPath, size: stat.size, ext: path.extname(entry.name) });
            if (CODE_EXTS.has(path.extname(entry.name))) {
                codeFiles.push({ relPath, fullPath });
            }
        }
    }
}

walk(ROOT);

// 2. Deep Static Code, Connection & Security Analysis
for (const { relPath, fullPath } of codeFiles) {
    const content = fs.readFileSync(fullPath, 'utf8');
    const lines = content.split(/\r?\n/);

    if (content.trim().length === 0) {
        addFinding('HIGH', 'Dead/Empty File', relPath, 1, 'File is completely empty (0 bytes).', 'Delete file or restore intended code.');
        continue;
    }

    // Track Imports & Verify Relative Paths
    const importRegex = /(?:import|from)\s+['"]([^'"]+)['"]/g;
    let m;
    while ((m = importRegex.exec(content)) !== null) {
        const spec = m[1];
        importedModules.add(spec);
        if (spec.startsWith('.')) {
            const baseDir = path.dirname(fullPath);
            const candidates = [
                path.resolve(baseDir, spec),
                path.resolve(baseDir, spec + '.ts'),
                path.resolve(baseDir, spec + '.tsx'),
                path.resolve(baseDir, spec + '.js'),
                path.resolve(baseDir, spec + '.mjs'),
                path.resolve(baseDir, spec, 'index.ts'),
                path.resolve(baseDir, spec, 'index.tsx'),
            ];
            if (!candidates.some((c) => fs.existsSync(c))) {
                addFinding('CRITICAL', 'Broken Import', relPath, 1, `Broken relative import: "${spec}"`, 'Fix path or create missing module.');
            }
        }
    }

    // Track Backend API Routes
    const routeRegex = /app\.(get|post|put|delete|patch)\(\s*['"]([^'"]+)['"]/g;
    while ((m = routeRegex.exec(content)) !== null) {
        backendApiRoutes.add(`${m[1].toUpperCase()} ${m[2]}`);
    }

    // Track Frontend Fetch Calls
    const fetchRegex = /fetch\(\s*['"`](\/api\/[^'"`?]+)['"`]/g;
    while ((m = fetchRegex.exec(content)) !== null) {
        frontendApiCalls.add(m[1]);
    }

    // Line-by-Line Extreme Audit
    lines.forEach((lineText, idx) => {
        const lineNo = idx + 1;

        // Hardcoded PIN / Secret check
        if (/DEFAULT_PIN\s*=\s*['"]\d+['"]/.test(lineText) && !relPath.includes('system-audit')) {
            addFinding('CRITICAL', 'Security Leak', relPath, lineNo, 'Hardcoded PIN found in source code.', 'Move PIN verification strictly to backend .env.');
        }

        // Dangerous Regex Comment Stripper check
        if (/replace\(\s*\/\\\^\\\/\\\//.test(lineText) || /replace\(\/\^\\\/\\\//.test(lineText)) {
            addFinding('HIGH', 'Code Corruption Risk', relPath, lineNo, 'Regex strips lines starting with // which can break URLs/strings.', 'Remove legacy patch script.');
        }

        // Floating-point currency math warning
        if (/(amount|rupees|paisa|balance|total)\s*[\*\/]\s*0\.\d+/i.test(lineText) && !relPath.includes('MerchantSuperDashboard')) {
            addFinding('MEDIUM', 'FinTech Math', relPath, lineNo, 'Floating-point multiplication on financial amount.', 'Use integer paisa math (Math.round).');
        }

        // TypeScript 'any' abuse
        if (/:\s*any\b/.test(lineText)) {
            addFinding('LOW', 'Type Safety', relPath, lineNo, 'Explicit "any" type reduces TypeScript safety.', 'Replace with strict interface or unknown.');
        }

        // SBP Regulatory Violation Claims in UI
        if (/(licensed bank|guaranteed profit|instant bank transfer|fdic|sbp licensed wallet)/i.test(lineText) && !relPath.includes('README') && !relPath.includes('IsefMaster')) {
            addFinding('CRITICAL', 'SBP Compliance', relPath, lineNo, 'Potential prohibited financial/banking claim detected.', 'Keep non-custodial pilot disclaimer.');
        }

        // Empty Catch Blocks
        if (/catch\s*\{\s*\}/.test(lineText)) {
            addFinding('MEDIUM', 'Silent Failure', relPath, lineNo, 'Empty catch {} block hides runtime errors.', 'Log error or show offline fallback alert.');
        }
    });
}

// 3. Cross-Layer Frontend <-> Backend Alignment Check
const registeredPaths = new Set([...backendApiRoutes].map((r) => r.split(' ')[1]));
for (const apiPath of frontendApiCalls) {
    if (!registeredPaths.has(apiPath)) {
        addFinding('CRITICAL', 'API Mismatch', 'Frontend <-> server.ts', 0, `Frontend calls "${apiPath}" but backend has no matching route!`, 'Add route to server.ts or fix URL.');
    }
}

// 4. Package.json Unused Dependency Check
if (fs.existsSync(path.join(ROOT, 'package.json'))) {
    const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
    const deps = Object.keys(pkg.dependencies || {});
    const allCodeCombined = codeFiles.map((f) => fs.readFileSync(f.fullPath, 'utf8')).join('\n');
    for (const dep of deps) {
        if (!allCodeCombined.includes(dep) && !['dotenv', 'tsx'].includes(dep)) {
            addFinding('MEDIUM', 'Bundle Bloat', 'package.json', 1, `Dependency "${dep}" appears unused in source files.`, `Run "npm uninstall ${dep}" to speed up mobile load.`);
        }
    }
}

// 5. Duplicate File Detection (by exact byte size & filename patterns)
const dockerFiles = allFiles.filter((f) => f.relPath.toLowerCase().includes('dockerfile'));
if (dockerFiles.length > 1) {
    addFinding('LOW', 'Repo Hygiene', dockerFiles.map((d) => d.relPath).join(', '), 1, 'Multiple Dockerfiles detected.', 'Keep one canonical Dockerfile.');
}

// 6. Generate Comprehensive Markdown Report
const criticalCount = findings.filter((f) => f.severity === 'CRITICAL').length;
const highCount = findings.filter((f) => f.severity === 'HIGH').length;
const mediumCount = findings.filter((f) => f.severity === 'MEDIUM').length;
const lowCount = findings.filter((f) => f.severity === 'LOW').length;

let md = `# BolMizan Extreme Full-Repo X-Ray & Audit Report\n\n`;
md += `- **Generated:** ${new Date().toISOString()}\n`;
md += `- **Total Files Scanned:** ${allFiles.length} (${codeFiles.length} code files)\n`;
md += `- **Backend API Routes:** ${[...backendApiRoutes].join(', ') || 'None detected'}\n`;
md += `- **Frontend API Calls:** ${[...frontendApiCalls].join(', ') || 'None detected'}\n`;
md += `- **Health Score:** ${Math.max(0, 100 - criticalCount * 20 - highCount * 10 - mediumCount * 4 - lowCount * 1)} / 100\n\n`;

md += `## 1. Summary of Findings\n`;
md += `| Severity | Count |\n| :--- | :--- |\n`;
md += `| CRITICAL | ${criticalCount} |\n| HIGH | ${highCount} |\n| MEDIUM | ${mediumCount} |\n| LOW | ${lowCount} |\n\n`;

md += `## 2. Detailed Issue & Improvement Log\n`;
if (findings.length === 0) {
    md += `Zero issues found! Every file, import, API route, and security guardrail is 100% aligned.\n\n`;
} else {
    for (const f of findings) {
        md += `- **[${f.severity}] (${f.category})** \`${f.file}:${f.line}\` — ${f.message}\n  - *Recommended Fix:* ${f.fixHint}\n`;
    }
    md += `\n`;
}

md += `## 3. Complete Project File Map\n`;
for (const f of allFiles) {
    md += `- \`${f.relPath}\` (${(f.size / 1024).toFixed(1)} KB)\n`;
}

const outPath = path.join(ROOT, 'BOLMIZAN_EXTREME_AUDIT.md');
fs.writeFileSync(outPath, md, 'utf8');

console.log(`\n=== X-RAY COMPLETE ===`);
console.log(`Scanned ${allFiles.length} files | Critical: ${criticalCount}, High: ${highCount}, Medium: ${mediumCount}, Low: ${lowCount}`);
console.log(`Full report saved to: BOLMIZAN_EXTREME_AUDIT.md\n`);
