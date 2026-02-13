# Pyrite Testing Guide

## Manual Testing Results

### ✅ Build Verification (Completed)

All build processes work without errors:

```bash
# Frontend JavaScript bundle
bun build src/app.ts --outdir=/tmp/test --target=browser
# ✅ Result: 0.47 MB (141 modules) - SUCCESS

# Frontend CSS bundle
bun build src/css/app.css --outdir=/tmp/test
# ✅ Result: 7.14 KB (4 modules) - SUCCESS

# Backend service
bun service.ts --help
# ✅ Result: Shows CLI help - SUCCESS

# Start service
bun service.ts start
# ✅ Result: Server listening on configured port - SUCCESS
```

### Fixed Issues

During manual testing, the following issues were identified and fixed:

#### 1. Missing Exports (`src/app.ts`)
**Problem:** Components importing `$t`, `$tc`, `api`, `store` from `@/app` but not exported

**Fix:**
```typescript
// Added to src/app.ts
import { api, $t, store } from '@garage44/common/app'

// Created pluralization helper
const $tc = (key: string, count: number, context?: any) => {
    return $t(key, { count, ...context })
}

export { $s, $t, $tc, api, app, notifier, store, ws }
```

#### 2. Import Mismatch (`panel-context.tsx`)
**Problem:** Importing named export `animate` from module with default export

**Fix:**
```typescript
// Changed from:
import {animate} from '@/lib/animate'

// To:
import animate from '@/lib/animate'
```

#### 3. Component Export Alias (`elements.ts`)
**Problem:** `SoundMeter` (PascalCase) imported but exported as `Soundmeter`

**Fix:**
```typescript
// Added alias export
export { default as Soundmeter } from './elements/soundmeter/soundmeter'
export { default as SoundMeter } from './elements/soundmeter/soundmeter'
```

#### 4. Missing Dependencies (`package.json`)
**Problem:** Runtime dependencies not declared

**Fix:**
```bash
bun add unique-names-generator  # For user/group name generation
bun add globby                   # For file system operations
```

### Service Status

```
╔════════════════════════════════════════╗
║   PYRITE SERVICE - READY ✅            ║
╠════════════════════════════════════════╣
║ Backend:    Running                    ║
║ WebSocket:  Initialized                ║
║ Bunchy:     Ready                      ║
║ Middleware: Loaded                     ║
║ API:        All endpoints registered   ║
║ Static:     Configured                 ║
║ SFU Proxy:  Configured (needs Galène)  ║
╚════════════════════════════════════════╝
```

## Running Pyrite

### Prerequisites

1. **Galène SFU** must be running:
   ```bash
   # Install and run Galène (see https://galene.org/)
   galene -http localhost:8443 -data /path/to/galene/data
   ```

2. **Configuration file** (`~/.pyriterc`):
   ```bash
   cp .pyriterc.example ~/.pyriterc
   # Edit with your settings
   ```

### Development Mode

```bash
cd packages/pyrite
bun run dev
```

This starts:
- Bun.serve() backend on port 3030
- Bunchy hot-reload system
- WebSocket server (/ws)
- SFU proxy (/sfu)
- Static file serving

Open browser to: `http://localhost:3030` (or `https://192.168.1.204:3030` if HTTPS is enabled)

#### HTTPS Development Setup

For development with HTTPS (required for WebRTC features like camera/microphone access from network devices):

1. **Install mkcert** (one-time setup):
   ```bash
   # macOS
   brew install mkcert
   
   # Arch Linux
   sudo pacman -S mkcert
   
   # Ubuntu/Debian
   sudo apt install mkcert
   
   # Other platforms: See https://github.com/FiloSottile/mkcert#installation
   ```

2. **Generate development certificates**:
   ```bash
   cd packages/pyrite
   ./scripts/generate-dev-cert.sh
   ```
   
   This will:
   - Install a local CA (requires sudo)
   - Generate certificates for `192.168.1.204` and `localhost`
   - Save certificates to `certs/` directory

3. **Run development server**:
   ```bash
   bun run dev
   ```
   
   The dev script automatically detects certificates and uses HTTPS if they exist.

4. **Access the application**:
   - Local: `https://localhost` (port 443)
   - Network: `https://192.168.1.204` (port 443)

**Note:** Port 443 requires root privileges. The dev script will automatically use `sudo` if needed.

**Note:** The certificate generation script creates certificates valid for `192.168.1.204` and `localhost`. If your IP address changes, regenerate the certificates by running the script again.

**Certificate Trust Issues:**
If your browser shows "Not secure" after generating certificates:
1. Restart your browser completely (close all windows and reopen)
2. The `mkcert -install` command should have installed the local CA, but browsers may need a restart to recognize it
3. If still not trusted, manually verify the CA is installed:
   - Check: `mkcert -CAROOT` to see where the CA is stored
   - Verify the CA certificate exists in that directory

**WebSocket Connection Failures with HTTPS:**
If WebSocket connections fail when using HTTPS (`wss://`):
1. **Certificate Trust**: WebSocket connections require a trusted certificate. Ensure the certificate is trusted (see above)
2. **Browser Restart**: After installing the mkcert CA, completely restart your browser
3. **Check Console**: Look for specific WebSocket errors in the browser console
4. **Verify Connection**: The WebSocket URL should be `wss://192.168.1.204/sfu` (no port for default HTTPS)
5. **Test HTTP First**: Try accessing via HTTP (`http://192.168.1.204:3030`) to verify WebSocket works, then switch to HTTPS
6. **SFU Proxy Issues**: If the SFU connection fails specifically:
   - Check server logs for `[SFU Proxy]` messages - they will show the upstream connection status
   - Verify Galène is running and accessible: `curl http://localhost:8443/stats.json`
   - Ensure `sfu.url` in `~/.pyriterc` is correct (default: `http://localhost:8443`)
   - The proxy connects to Galène using the configured URL - if Pyrite uses HTTPS but Galène uses HTTP, this should still work
   - If errors persist, check if Bun's server-side WebSocket client has issues connecting to Galène

**Manual TLS configuration:**
If you need to specify certificates manually:
```bash
# Port 443 (requires sudo)
sudo bun service.ts start -h 0.0.0.0 -p 443 --cert certs/192.168.1.204+3.pem --key certs/192.168.1.204+3-key.pem

# Or use a non-privileged port (e.g., 8443)
bun service.ts start -h 0.0.0.0 -p 8443 --cert certs/192.168.1.204+3.pem --key certs/192.168.1.204+3-key.pem
```

### Production Build

```bash
cd packages/pyrite
bun run build
```

Generates:
- `public/app.<hash>.js` - Minified frontend
- `public/app.<hash>.css` - Minified styles
- `public/components.<hash>.css` - Component styles
- `public/index.html` - HTML with asset references

### Production Run

```bash
cd packages/pyrite
NODE_ENV=production bun service.ts start
```

## Testing Checklist

### ✅ Build Tests (Completed)
- [x] Frontend JS builds without errors
- [x] Frontend CSS builds without errors
- [x] Backend service loads
- [x] CLI commands work
- [x] Service starts and listens

### ⏸️ Runtime Tests (Requires Galène SFU)
- [ ] Login to conference
- [ ] Join a group
- [ ] Video stream works
- [ ] Audio stream works
- [ ] Screen sharing works
- [ ] Chat messages send/receive
- [ ] User presence updates
- [ ] Admin interface accessible
- [ ] Group management works
- [ ] User management works
- [ ] Recording functionality
- [ ] WebSocket reconnection

### ⏸️ Integration Tests (Requires Full Setup)
- [ ] Multiple users in same group
- [ ] Operator permissions work
- [ ] Group locking works
- [ ] Recording starts/stops
- [ ] File uploads work
- [ ] Emoji picker works
- [ ] Dark/light theme switching
- [ ] Responsive layout on mobile
- [ ] Browser compatibility (Chrome, Firefox, Safari)

## Known Limitations

### External Dependencies

**Galène SFU** (Required)
- Pyrite is a frontend for Galène
- SFU must be running separately
- Configure `sfu.url` in `.pyriterc`
- Configure `sfu.path` for group/recording data

**WebRTC Requirements**
- HTTPS required in production (and recommended for development when accessing from network devices)
- Camera/microphone permissions needed
- Modern browser (2023+)
- For local network access, use HTTPS with locally-trusted certificates (see HTTPS Development Setup above)

### Configuration Requirements

Edit `~/.pyriterc` with your settings. See `.pyriterc.example` for all available options.

## Troubleshooting

### Service won't start

**Check dependencies:**
```bash
cd packages/pyrite
bun install
```

**Check config:**
```bash
cat ~/.pyriterc
```

**Check logs:**
```bash
bun service.ts start --port 3030 2>&1 | tee pyrite.log
```

### Frontend won't build

**Check Bunchy:**
```bash
cd packages/pyrite
bun build src/app.ts --outdir=/tmp/test --target=browser
```

**Check CSS:**
```bash
bun build src/css/app.css --outdir=/tmp/test
```

### WebSocket connection fails

**Check endpoint:**
- Browser console: Look for WebSocket errors
- Network tab: Check `/ws` connection
- Server logs: Look for upgrade failures

**Common causes:**
- Reverse proxy not configured for WebSocket
- CORS/CSP headers blocking connection
- Port mismatch in WebSocket URL

### SFU connection fails

**Check Galène:**
```bash
curl http://localhost:8443/
```

**Check proxy:**
- Server logs: Look for `/sfu` requests
- Galène logs: Look for incoming connections

**Common causes:**
- Galène not running
- Wrong `sfu.url` in config
- Firewall blocking connection

## Next Steps

1. **Set up Galène SFU**
   - Download from https://galene.org/
   - Configure groups in Galène data directory
   - Start Galène service

2. **Configure Pyrite**
   - Copy `.pyriterc.example` to `~/.pyriterc`
   - Edit `~/.pyriterc` with your settings (see `.pyriterc.example` for all options)

3. **Test basic flow**
   - Start Pyrite: `bun run dev`
   - Open browser: `http://localhost:3030`
   - Select a group
   - Join with username
   - Test video/audio

4. **Test advanced features**
   - Multiple users
   - Screen sharing
   - Recording
   - Chat
   - Admin interface

## Migration Validation

All migration tasks completed successfully:

- ✅ Monorepo integration
- ✅ Backend (Express → Bun.serve)
- ✅ Frontend (Vue → Preact)
- ✅ State (Vuex → DeepSignal)
- ✅ Router (vue-router → preact-router)
- ✅ WebSocket (REST-like API pattern)
- ✅ Build system (Vite → Bunchy)
- ✅ CSS (SCSS → Modern CSS)
- ✅ Configuration (`.pyriterc`)
- ✅ Documentation (README, migration guides)

**Service is ready for end-to-end testing with Galène SFU!** 🚀
