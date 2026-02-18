# Deployment

Documentation for Nonlinear's deployment automation features, including PR deployments and main branch deployment workflows.

## Overview

Nonlinear provides automated deployment capabilities for the Codebrew monorepo:

- **PR Deployments**: Automated preview environments for pull requests
- **Main Branch Deployment**: Production deployment automation
- **Deployment Automation**: Systemd and nginx configuration generation
- **CI/CD Integration**: GitHub Actions workflows for automated deployments

## Usage

### PR Deployments

PR deployments allow you to test changes in isolated environments before merging.

#### Deploy a PR

```bash
# Deploy current branch as PR #999
bun run nonlinear deploy-pr \
  --number 999 \
  --branch $(git branch --show-current)

# Deploy specific branch
bun run nonlinear deploy-pr \
  --number 123 \
  --branch feature/new-ui
```

#### List Active Deployments

```bash
bun run nonlinear list-pr-deployments
```

#### Cleanup PR Deployment

```bash
bun run nonlinear cleanup-pr --number 999
```

### Main Branch Deployment

Main branch deployments are automatically triggered via GitHub Actions when code is merged to `main`. The webhook handler in Nonlinear receives the deployment request and:

1. Pulls the latest code from `main`
2. Builds all packages
3. Restarts systemd services
4. Cleans up old databases

### Generate Configuration Files

Nonlinear can generate systemd and nginx configuration files:

```bash
# Generate systemd service files
bun run nonlinear generate-systemd --domain garage44.org

# Generate nginx configuration
bun run nonlinear generate-nginx --domain garage44.org
```

## Setup

### Prerequisites

- VPS running Linux (Arch Linux recommended)
- Bun installed on the VPS
- Nginx installed and configured
- Git repository cloned to `/home/garage44/codebrew`
- Dedicated user `garage44` created on the VPS
- Sudo access for the `garage44` user to restart systemd services
- Domain pointing to your VPS (e.g., `garage44.org`)

### 1. Create Dedicated User

```bash
sudo useradd -m -s /bin/bash garage44
sudo usermod -aG wheel garage44
```

### 2. Clone Repository

```bash
sudo -u garage44 git clone https://github.com/garage44/codebrew.git /home/garage44/codebrew
cd /home/garage44/codebrew
su garage44
curl -fsSL https://bun.sh/install | bash
bun install
```


### 3. Set Up Environment Variables

Create `/home/garage44/.env` or add to `/home/garage44/.bashrc`:

```bash
export WEBHOOK_SECRET="your-secret-here"
export WEBHOOK_PORT=3001
export REPO_PATH="/home/garage44/codebrew"
export DEPLOY_USER="garage44"
```

Generate a secure webhook secret:

```bash
openssl rand -hex 32
```

### 4. Install Systemd Services

Copy service files and fix paths (WorkingDirectory must be `/home/garage44/codebrew/packages/nonlinear`):

```bash
cd /home/garage44/codebrew
sudo cp deploy/expressio.service deploy/pyrite.service deploy/nonlinear.service /etc/systemd/system/
sudo cp deploy/pr-cleanup.service deploy/pr-cleanup.timer /etc/systemd/system/

# Edit nonlinear.service: set WEBHOOK_SECRET, WorkingDirectory=/home/garage44/codebrew/packages/nonlinear
sudo nano /etc/systemd/system/nonlinear.service

# pr-cleanup.service uses WorkingDirectory=/home/garage44/codebrew (repo root for bun run nonlinear)
```

Reload and start:

```bash
sudo systemctl daemon-reload
sudo systemctl enable expressio pyrite nonlinear pr-cleanup.timer
sudo systemctl start expressio pyrite nonlinear pr-cleanup.timer
```

### 5. Configure Nginx

#### Install Nginx

```bash
sudo pacman -S nginx
```

#### Domain Layout

| Domain | Purpose |
|--------|---------|
| `nonlinear.garage44.org` | Nonlinear app + webhook |
| `expressio.garage44.org` | Expressio i18n |
| `pyrite.garage44.org` | Pyrite chat |
| `garage44.org` | Reserved for codebrew (placeholder) |

#### TransIP Wildcard DNS

Configure DNS in TransIP so all subdomains resolve to your VPS:

1. **Control Panel** → Domain → select your domain (e.g. `garage44.org`)
2. **Advanced Domain Settings** → DNS (disable "TransIP settings" if needed)
3. Add these records:

| Name | Type | TTL | Value |
|------|------|-----|-------|
| `@` | A | 300 | Your VPS IP |
| `*` | A | 300 | Your VPS IP |
| `www` | CNAME | 300 | `@` |

The `*` record is the wildcard—it makes `nonlinear.garage44.org`, `expressio.garage44.org`, `pr-123-nonlinear.garage44.org`, etc. resolve to your VPS. DNS changes can take up to 24 hours to propagate.

**API Key Pair** (for certbot DNS-01 challenge): Control Panel → Domain → API → Key Pairs → "Key Pair toevoegen". Create a key, uncheck "Accepteer alleen IP-addressen uit de whitelist" if your VPS IP may change. Save the private key—you'll use it for the SSL certificate step below.

#### Obtain SSL Certificate (Wildcard with TransIP)

Install certbot with TransIP plugin (uv, root user):

```bash
sudo env HOME=/root bash -c 'curl -LsSf https://astral.sh/uv/install.sh | sh'
sudo bash -c 'echo "export PATH=\"/root/.local/bin:\$PATH\"" >> /root/.zshrc'

# Create venv with certbot + TransIP plugin
sudo uv venv /opt/certbot-venv
sudo uv pip install certbot certbot-dns-transip --python /opt/certbot-venv/bin/python
```

Create TransIP credentials (Key Pair from TransIP control panel):

```bash
# Save TransIP private key to /etc/letsencrypt/transip.key, then convert to RSA
sudo cp /path/to/downloaded/key /etc/letsencrypt/transip.key
openssl rsa -in /etc/letsencrypt/transip.key -out /etc/letsencrypt/transip-rsa.key
sudo chmod 600 /etc/letsencrypt/transip-rsa.key

sudo tee /etc/letsencrypt/transip.ini << EOF
dns_transip_username = YOUR_TRANSIP_USERNAME
dns_transip_key_file = /etc/letsencrypt/transip-rsa.key
dns_transip_global_key = yes
EOF
sudo chmod 600 /etc/letsencrypt/transip.ini
```

Obtain wildcard certificate:

```bash
sudo /opt/certbot-venv/bin/certbot certonly \
  -a dns-transip \
  --dns-transip-credentials /etc/letsencrypt/transip.ini \
  --dns-transip-propagation-seconds 240 \
  -d "*.garage44.org" \
  -d "garage44.org" \
  -m your@email.com \
  --agree-tos
```

#### Configure Nginx

Copy and edit the example configuration:

```bash
sudo cp deploy/nginx.conf.example /etc/nginx/sites-available/garage44.org
sudo ln -s /etc/nginx/sites-available/garage44.org /etc/nginx/sites-enabled/
sudo nano /etc/nginx/sites-available/garage44.org
```

Ensure nonlinear.garage44.org serves the app and /webhook. All subdomains use the wildcard cert:

```nginx
ssl_certificate /etc/letsencrypt/live/garage44.org/fullchain.pem;
ssl_certificate_key /etc/letsencrypt/live/garage44.org/privkey.pem;
```

Test and reload:

```bash
sudo nginx -t
sudo systemctl reload nginx
```

#### Certificate Renewal (Cron)

```bash
sudo crontab -e
```

Add (weekly, Sunday 3am):

```
0 3 * * 0 /opt/certbot-venv/bin/certbot renew -a dns-transip --dns-transip-credentials /etc/letsencrypt/transip.ini --dns-transip-propagation-seconds 240 --quiet --deploy-hook "systemctl reload nginx"
```

### 6. Configure GitHub Actions

Add secrets to your GitHub repository:

1. Go to Settings → Secrets and variables → Actions
2. Add:
   - **WEBHOOK_URL**: `https://nonlinear.garage44.org/webhook`
   - **WEBHOOK_SECRET**: Same secret as in nonlinear.service

The GitHub Actions workflows trigger deployments on push to `main` and on pull requests.

### 7. Configure Sudo Permissions

The `garage44` user needs sudo for systemctl and nginx. Add to sudoers (`sudo visudo`):

```
garage44 ALL=(ALL) NOPASSWD: /usr/bin/systemctl restart expressio.service, /usr/bin/systemctl restart pyrite.service, /usr/bin/systemctl restart nonlinear.service, /usr/bin/systemctl start pr-*, /usr/bin/systemctl stop pr-*, /usr/bin/systemctl restart pr-*, /usr/bin/systemctl disable pr-*, /usr/bin/systemctl status pr-*, /usr/bin/systemctl is-active pr-*, /usr/bin/systemctl daemon-reload, /usr/bin/nginx -s reload, /usr/bin/nginx -t, /usr/bin/rm -f /etc/systemd/system/pr-*.service, /usr/bin/rm -f /etc/nginx/sites-*/pr-*.garage44.org, /usr/bin/ln -s /etc/nginx/sites-available/pr-*.garage44.org /etc/nginx/sites-enabled/pr-*.garage44.org, /usr/bin/mv /tmp/pr-*.service /etc/systemd/system/pr-*.service, /usr/bin/mv /tmp/pr-*.nginx.conf /etc/nginx/sites-available/pr-*.garage44.org, /usr/bin/mv /tmp/pr-*-removed.nginx.conf /etc/nginx/sites-available/pr-*.garage44.org, /usr/bin/fuser -k [0-9]*/tcp
```

For PR deployments, add nginx rate limiting to `/etc/nginx/nginx.conf` (inside `http` block):

```nginx
limit_req_zone $binary_remote_addr zone=pr_public:10m rate=10r/s;
```

## Codebrew Setup

Codebrew is the unified app (Expressio + Pyrite + Nonlinear) served at `garage44.org`. The nginx placeholder can be replaced once the `packages/codebrew` package exists.

### Prerequisites

- Nonlinear, Expressio, and Pyrite already deployed (see Setup above)
- `bun run codebrew` available in the monorepo

The Codebrew `start` script builds assets before starting the server (same pattern as Nonlinear).

### 1. Install Codebrew Systemd Service

```bash
cd /home/garage44/codebrew
sudo cp deploy/codebrew.service /etc/systemd/system/

# Edit if needed: WorkingDirectory, port
sudo nano /etc/systemd/system/codebrew.service

sudo systemctl daemon-reload
sudo systemctl enable codebrew
sudo systemctl start codebrew
```

### 2. Update Nginx for garage44.org

Replace the placeholder block in `/etc/nginx/sites-available/garage44.org`:

```nginx
# garage44.org - Codebrew unified app
server {
    listen 80;
    server_name garage44.org www.garage44.org;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl;
    http2 on;
    server_name garage44.org www.garage44.org;

    ssl_certificate /etc/letsencrypt/live/garage44.org/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/garage44.org/privkey.pem;

    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers on;
    ssl_session_cache shared:SSL:10m;
    ssl_session_timeout 10m;

    location /ws {
        proxy_pass http://localhost:3033;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 86400;
        proxy_send_timeout 86400;
    }

    location / {
        proxy_pass http://localhost:3033;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

### 3. Add to Sudoers

Add `codebrew.service` to the systemctl restart list in sudoers so the webhook can restart it on deploy:

```
/usr/bin/systemctl restart codebrew.service
```

### 4. Update Webhook Deploy Logic

When Codebrew is deployed, the Nonlinear webhook handler should restart `codebrew.service` in addition to expressio, pyrite, and nonlinear. Update the deploy script or webhook config to include codebrew in the restart list.

### Domain Layout (with Codebrew)

| Domain | Purpose |
|--------|---------|
| `garage44.org` | Codebrew unified app |
| `nonlinear.garage44.org` | Nonlinear standalone + webhook |
| `expressio.garage44.org` | Expressio standalone |
| `pyrite.garage44.org` | Pyrite standalone |

## Features

- **Isolated Environments**: Each PR gets its own directory, database, and ports
- **Automatic Cleanup**: Deployments are cleaned up after 7 days or when PR closes
- **Security**: Only contributor PRs are deployed (forks are blocked)
- **Rate Limiting**: Public deployments are rate-limited for security
- **Package Auto-Discovery**: Automatically discovers and deploys application packages

## Troubleshooting

### Services Not Starting

```bash
# Check service status
sudo systemctl status nonlinear.service

# View logs
sudo journalctl -u nonlinear.service -f
```

### Nginx Configuration Errors

```bash
# Test configuration
sudo nginx -t

# Check error logs
sudo tail -f /var/log/nginx/error.log
```

### Webhook Not Working

```bash
# Check webhook endpoint (401 without valid signature is expected)
curl -X POST https://nonlinear.garage44.org/webhook \
  -H "Content-Type: application/json" \
  -d '{"ref":"refs/heads/main"}'

# Check nonlinear logs
sudo journalctl -u nonlinear.service -f | grep webhook
```

### SSL Certificate Issues

```bash
# Check certificates
sudo /opt/certbot-venv/bin/certbot certificates

# Test renewal
sudo /opt/certbot-venv/bin/certbot renew --dry-run -a dns-transip \
  --dns-transip-credentials /etc/letsencrypt/transip.ini \
  --dns-transip-propagation-seconds 240
```
