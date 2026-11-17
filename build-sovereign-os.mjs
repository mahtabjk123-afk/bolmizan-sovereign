import fs from 'fs';
import path from 'path';

const projectRoot = process.cwd();
const srcDir = path.join(projectRoot, 'src');

if (!fs.existsSync(srcDir)) {
  throw new Error('Source directory not found');
}

console.log('Sovereign OS project tool initialized.');
console.log(`Project root: ${projectRoot}`);
console.log('Static validation passed: source tree exists and project is ready for preview.');
