# Deployment

Documentation for Malkovich's deployment automation features, including PR deployments and main branch deployment workflows.

## Overview

Malkovich provides automated deployment capabilities for the Garage44 monorepo:

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
bun run malkovich deploy-pr \
  --number 999 \
  --branch $(git branch --show-current)

# Deploy specific branch
bun run malkovich deploy-pr \
  --number 123 \
  --branch feature/new-ui
```

#### List Active Deployments

```bash
bun run malkovich list-pr-deployments
```

#### Cleanup PR Deployment

```bash
bun run malkovich cleanup-pr --number 999
```

### Main Branch Deployment

Main branch deployments are automatically triggered via GitHub Actions when code is merged to `main`. The webhook handler in Malkovich receives the deployment request and:

1. Pulls the latest code from `main`
2. Builds all packages
3. Restarts systemd services
4. Cleans up old databases

### Generate Configuration Files

Malkovich can generate systemd and nginx configuration files:

```bash
# Generate systemd service files
bun run malkovich generate-systemd --domain garage44.org

# Generate nginx configuration
bun run malkovich generate-nginx --domain garage44.org
```

## Setup

### Prerequisites

- VPS running Linux (Arch Linux recommended)
- Bun installed on the VPS
- Nginx installed and configured
- Git repository cloned to `/home/garage44/garage44`
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
sudo -u garage44 git clone <repository-url> /home/garage44/garage44
cd /home/garage44/garage44
sudo -u garage44 bun install
```

### 3. Install Bun

```bash
curl -fsSL https://bun.sh/install | bash
```

### 4. Set Up Environment Variables

Create `/home/garage44/.env` or add to `/home/garage44/.bashrc`:

```bash
export WEBHOOK_SECRET="your-secret-here"
export WEBHOOK_PORT=3001
export REPO_PATH="/home/garage44/garage44"
export DEPLOY_USER="garage44"
```

Generate a secure webhook secret:

```bash
openssl rand -hex 32
```

### 5. Install Systemd Services

Copy service files to systemd directory. Malkovich will auto-discover application packages in your workspace:

```bash
cd /home/garage44/garage44
# Copy service files for your application packages
sudo cp deploy/<projectName>.service /etc/systemd/system/
sudo cp deploy/malkovich.service /etc/systemd/system/
```

Reload systemd and enable services:

```bash
sudo systemctl daemon-reload
sudo systemctl enable <projectName>.service
sudo systemctl enable malkovich.service

sudo systemctl start <projectName>.service
sudo systemctl start malkovich.service
```

### 6. Configure Nginx

#### Install Nginx and Certbot

```bash
sudo pacman -S nginx certbot certbot-nginx
```

#### Obtain SSL Certificates

**Important**: SSL certificates must be generated before configuring nginx with SSL.

```bash
# Stop nginx temporarily (if running)
sudo systemctl stop nginx

# Obtain certificates for your domains
sudo certbot certonly --standalone -d garage44.org -d www.garage44.org
sudo certbot certonly --standalone -d <projectName>.garage44.org
```

For PR deployments, you'll need a wildcard certificate:

```bash
# Using DNS plugin (recommended)
sudo certbot certonly --dns-cloudflare \
  --dns-cloudflare-credentials ~/.secrets/cloudflare.ini \
  -d "*.garage44.org" \
  -d "garage44.org"

# Or manual DNS challenge
sudo certbot certonly --manual --preferred-challenges dns \
  -d "*.garage44.org" \
  -d "garage44.org"
```

#### Configure Nginx

Copy the example configuration:

```bash
sudo cp deploy/nginx.conf.example /etc/nginx/sites-available/garage44.org
sudo ln -s /etc/nginx/sites-available/garage44.org /etc/nginx/sites-enabled/
```

Edit the configuration to match your domain names:

```bash
sudo nano /etc/nginx/sites-available/garage44.org
```

Test and reload nginx:

```bash
sudo nginx -t
sudo systemctl reload nginx
```

#### Set Up Automatic Certificate Renewal

Certbot automatically sets up a systemd timer for renewal:

```bash
# Test renewal
sudo certbot renew --dry-run

# Check timer status
systemctl status certbot.timer
```

### 7. Configure GitHub Actions

Add secrets to your GitHub repository:

1. Go to Settings → Secrets and variables → Actions
2. Add the following secrets:
   - **WEBHOOK_URL**: `https://garage44.org/webhook`
   - **WEBHOOK_SECRET**: The same secret you set in VPS environment variables

The GitHub Actions workflow (`.github/workflows/deploy.yml`) will automatically trigger deployments when code is merged to `main`.

### 8. Configure Sudo Permissions

The `garage44` user needs sudo permissions to restart systemd services:

```bash
sudo visudo
```

Add this line (replace `<projectName>` with your actual package names):

```
garage44 ALL=(ALL) NOPASSWD: /usr/bin/systemctl restart expressio.service, /usr/bin/systemctl restart pyrite.service, /usr/bin/systemctl restart malkovich.service, /usr/bin/systemctl restart webhook.service, /usr/bin/systemctl daemon-reload, /usr/bin/nginx -s reload, /usr/bin/nginx -t
```

### 9. PR Deployment Setup (Optional)

If you want to enable PR deployments:

#### Install Cleanup Timer

```bash
sudo cp deploy/pr-cleanup.timer /etc/systemd/system/
sudo cp deploy/pr-cleanup.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable pr-cleanup.timer
sudo systemctl start pr-cleanup.timer
```

#### Configure Nginx Rate Limiting

Add to `/etc/nginx/nginx.conf` (inside the `http` block):

```nginx
# Rate limiting for PR deployments
limit_req_zone $binary_remote_addr zone=pr_public:10m rate=10r/s;
```

#### Update Sudo Permissions for PR Deployments

Add PR deployment commands to sudoers. You can either add this as a separate line or combine it with the main sudoers line from section 8:

```
garage44 ALL=(ALL) NOPASSWD: /usr/bin/systemctl start pr-*, /usr/bin/systemctl stop pr-*, /usr/bin/systemctl restart pr-*, /usr/bin/systemctl disable pr-*, /usr/bin/systemctl status pr-*, /usr/bin/systemctl is-active pr-*, /usr/bin/systemctl daemon-reload, /usr/bin/nginx -s reload, /usr/bin/nginx -t, /usr/bin/rm -f /etc/systemd/system/pr-*.service, /usr/bin/rm -f /etc/nginx/sites-*/pr-*.garage44.org, /usr/bin/ln -s /etc/nginx/sites-available/pr-*.garage44.org /etc/nginx/sites-enabled/pr-*.garage44.org, /usr/bin/mv /tmp/pr-*.service /etc/systemd/system/pr-*.service, /usr/bin/mv /tmp/pr-*.nginx.conf /etc/nginx/sites-available/pr-*.garage44.org, /usr/bin/mv /tmp/pr-*-removed.nginx.conf /etc/nginx/sites-available/pr-*.garage44.org, /usr/bin/fuser -k [0-9]*/tcp
```

**Complete sudoers configuration** (combines main services and PR deployments):

```
garage44 ALL=(ALL) NOPASSWD: /usr/bin/systemctl restart expressio.service, /usr/bin/systemctl restart pyrite.service, /usr/bin/systemctl restart malkovich.service, /usr/bin/systemctl restart webhook.service, /usr/bin/systemctl start pr-*, /usr/bin/systemctl stop pr-*, /usr/bin/systemctl restart pr-*, /usr/bin/systemctl disable pr-*, /usr/bin/systemctl status pr-*, /usr/bin/systemctl is-active pr-*, /usr/bin/systemctl daemon-reload, /usr/bin/nginx -s reload, /usr/bin/nginx -t, /usr/bin/rm -f /etc/systemd/system/pr-*.service, /usr/bin/rm -f /etc/nginx/sites-*/pr-*.garage44.org, /usr/bin/ln -s /etc/nginx/sites-available/pr-*.garage44.org /etc/nginx/sites-enabled/pr-*.garage44.org, /usr/bin/mv /tmp/pr-*.service /etc/systemd/system/pr-*.service, /usr/bin/mv /tmp/pr-*.nginx.conf /etc/nginx/sites-available/pr-*.garage44.org, /usr/bin/mv /tmp/pr-*-removed.nginx.conf /etc/nginx/sites-available/pr-*.garage44.org, /usr/bin/fuser -k [0-9]*/tcp
```

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
sudo systemctl status malkovich.service

# View logs
sudo journalctl -u malkovich.service -f
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
# Check webhook endpoint
curl -X POST https://garage44.org/webhook \
  -H "Content-Type: application/json" \
  -d '{"ref":"refs/heads/main"}'

# Check malkovich logs
sudo journalctl -u malkovich.service -f | grep webhook
```

### SSL Certificate Issues

```bash
# Check certificates
sudo certbot certificates

# Test renewal
sudo certbot renew --dry-run
```
