import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

const dbPath = process.env.BOLMIZAN_TENANT_DB_FILE || path.resolve(process.cwd(), 'data', 'tenants.sqlite');
const backupDir = process.env.DB_BACKUP_DIR || path.resolve(process.cwd(), 'backups');
const backupKey = process.env.DB_BACKUP_KEY;

if (!backupKey || backupKey.includes('REPLACE') || backupKey.includes('replace')) {
  console.error('DB_BACKUP_KEY is required for encrypted SQLite backups.');
  process.exit(1);
}

try {
  await fs.access(dbPath);
} catch {
  console.error(`Database file not found at ${dbPath}`);
  process.exit(1);
}

const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
const outputPath = path.join(backupDir, `tenants-${timestamp}.sqlite.enc`);
await fs.mkdir(backupDir, { recursive: true });

const buffer = await fs.readFile(dbPath);
const key = crypto.createHash('sha256').update(backupKey).digest();
const iv = crypto.randomBytes(16);
const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
const encrypted = Buffer.concat([cipher.update(buffer), cipher.final()]);
const tag = cipher.getAuthTag();
const payload = Buffer.concat([Buffer.from('BOLMIZAN-ENC-V1\n'), iv, tag, encrypted]);
await fs.writeFile(outputPath, payload);

console.log(`Encrypted SQLite backup created at ${outputPath}`);
