import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

const root = process.cwd();
const srcDir = path.join(root, 'src');

console.log('1. Scanning & fixing file encodings (UTF-8)...');
function cleanDir(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) cleanDir(full);
        else if (/\.(tsx?|jsx?|css|json)$/.test(entry.name)) {
            const buf = fs.readFileSync(full);
            const isUtf16 = (buf[0] === 0xff && buf[1] === 0xfe) || buf.includes(0x00);
            const text = buf.toString(isUtf16 ? 'utf16le' : 'utf8').replace(/^\uFEFF/, '');
            fs.writeFileSync(full, text, 'utf8');
        }
    }
}
cleanDir(srcDir);

console.log('2. Structuring src/App.tsx cleanly...');
const appPath = path.join(srcDir, 'App.tsx');
if (fs.existsSync(appPath)) {
    let app = fs.readFileSync(appPath, 'utf8');
    app = app.replace(/^\/\/.*\r?\n/gm, '');
    app = app.replace(/<IsefMasterDashboard\s*\/>\s*/g, '');
    if (!app.includes("from './components/IsefMasterDashboard'")) {
        app = `import { IsefMasterDashboard } from './components/IsefMasterDashboard';\n` + app;
    }
    const lastClose = app.lastIndexOf('</div>');
    if (lastClose !== -1) {
        app = app.slice(0, lastClose) + '      <IsefMasterDashboard />\n    ' + app.slice(lastClose);
    }
    fs.writeFileSync(appPath, app, 'utf8');
}

console.log('3. Running production build verification...');
try {
    execSync('npm run build', { stdio: 'inherit' });
    console.log('\nALL FIXED! Run "npx vite preview --port 4173 --open" to launch.');
} catch {
    console.error('\nBuild flagged an issue above—share the single error line so we can patch it.');
}
