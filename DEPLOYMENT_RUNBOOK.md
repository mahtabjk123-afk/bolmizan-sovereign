# BolMizan live deployment runbook

This is a technical preview deployment runbook for a restricted internal pilot only. It is not a production banking or payment system and should not be marketed as a live consumer wallet or regulated PSP product.

## 1) Server setup

Ubuntu 22.04 or Debian 12 VPS with 2 GB RAM and 20 GB SSD is enough for an internal preview.

```bash
sudo apt update
sudo apt install -y nginx certbot python3-certbot-nginx git curl build-essential
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs
sudo npm install -g pm2
```

## 2) App installation

```bash
sudo mkdir -p /var/www/bolmizan
sudo chown -R $USER:$USER /var/www/bolmizan
cd /var/www/bolmizan
git clone <your-repo-url> .
npm install
cp .env.example .env
# Set APP_URL, AUTH_SESSION_SECRET, SOVEREIGN_CONTROL_PIN, and production-safe values.
# Keep phone-verification and payment rails disabled for this preview.
```

## 3) Build and run

```bash
npm run build
NODE_ENV=production PORT=3000 HOST=127.0.0.1 npm start
```

For long-running service management:

```bash
pm2 start ./deploy/ecosystem.config.cjs
pm2 save
pm2 status
```

## 4) Nginx reverse proxy

Create a site file:

```bash
sudo nano /etc/nginx/sites-available/bolmizan
```

Contents:

```nginx
server {
    listen 80;
    server_name bolmizan.example.com;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name bolmizan.example.com;

    ssl_certificate /etc/letsencrypt/live/bolmizan.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/bolmizan.example.com/privkey.pem;

    location / {
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_pass http://127.0.0.1:3000;
    }
}
```

Then enable and reload:

```bash
sudo ln -s /etc/nginx/sites-available/bolmizan /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
sudo certbot --nginx -d bolmizan.example.com
```

## 5) Runtime safeguards

- Keep local SQLite file on a mounted volume.
- Use `BOLMIZAN_TENANT_DB_FILE` to keep the ledger on a durable disk path.
- Do not expose live payment APIs, customer wallet functions, or bank-like claims in this preview.
- Only run this against a trusted internal pilot, not public production funds.
- Monitor the server logs and keep a daily backup of the SQLite file and the data directory.

## 6) Launch posture for Nazimabad / Paposh pilot

Use only for a controlled demo:

- show merchant ledger and reconciliation, not wallet deposits
- show WhatsApp receipt sharing, not payment settlement
- export data for manual customer records if needed
- capture actual merchant pain points and fix them before any financial release

## 7) Unsafe or disallowed claims for this preview

Do not advertise or imply:

- licensed banking or payment processing
- live Raast settlement or automatic wallet funding
- production KYC or biometric identity assurance
- confirmed customer payment settlement
- audited financial control or legal compliance beyond the current engineering verification

## 8) Mandatory production launch blockers before commercial claims

This project is not yet a public fintech product. Before any commercial or public launch, these must be completed and verified in a real environment:

- Real KYC / OTP / identity verification for merchant onboarding.
- Real payment provider integration and live settlement testing.
- Bank or wallet licensing review and compliance sign-off.
- Live merchant onboarding approval flow with human review and approval records.
- Daily encrypted database backups with restore testing and monitoring.
- Production audit trail and incident response runbook.
- Real fraud and compliance team process, dispute handling, and escalation policy.
- Verified domain, SSL, and production secrets in the live hosting account.
- Explicit removal of public fintech claims, real-money movement claims, unverified onboarding claims, and licensed financial service branding until all controls are in place.

Any public claim that this is a licensed financial service, wallet, or live settlement product is prohibited until those controls are present and independently evidenced.
