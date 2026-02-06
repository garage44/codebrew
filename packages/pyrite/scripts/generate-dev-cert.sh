#!/bin/bash
# Generate development TLS certificates using mkcert
# This script creates locally-trusted certificates for localhost and 192.168.1.204

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CERTS_DIR="$SCRIPT_DIR/../certs"
IP_ADDRESS="192.168.1.204"

# Check if mkcert is installed
if ! command -v mkcert &> /dev/null; then
    echo "❌ mkcert is not installed."
    echo ""
    echo "Please install mkcert first:"
    echo "  macOS:   brew install mkcert"
    echo "  Arch:    sudo pacman -S mkcert"
    echo "  Ubuntu:  sudo apt install mkcert"
    echo "  Other:   See https://github.com/FiloSottile/mkcert#installation"
    echo ""
    exit 1
fi

# Create certs directory if it doesn't exist
mkdir -p "$CERTS_DIR"

# Install local CA (if not already installed)
echo "📦 Installing local CA (may require sudo)..."
if mkcert -install; then
    echo "✅ Local CA installed successfully!"
    echo ""
    echo "⚠️  IMPORTANT: Browser trust setup"
    echo "   The local CA has been installed, but your browser may need to trust it."
    echo ""
    echo "   To trust the certificate in your browser:"
    echo "   1. Restart your browser completely"
    echo "   2. If still not trusted, manually trust the CA:"
    echo "      - Chrome/Edge: Settings → Privacy → Security → Manage certificates"
    echo "      - Firefox: Settings → Privacy & Security → Certificates → View Certificates → Authorities"
    echo "      - Look for 'mkcert' or the local CA certificate"
    echo ""
else
    echo "⚠️  Failed to install local CA. You may need to run with sudo:"
    echo "   sudo mkcert -install"
    echo ""
fi

# Generate certificate for IP address and localhost
echo "🔐 Generating certificate for $IP_ADDRESS and localhost..."
cd "$CERTS_DIR"
mkcert "$IP_ADDRESS" localhost 127.0.0.1 ::1

# Rename files to match expected names
if [ -f "$IP_ADDRESS+2.pem" ]; then
    mv "$IP_ADDRESS+2.pem" "$IP_ADDRESS+2.pem.bak"
    mv "$IP_ADDRESS+2-key.pem" "$IP_ADDRESS+2-key.pem.bak"
fi

# Find the generated certificate files
CERT_FILE=$(ls -1 "$CERTS_DIR"/*.pem 2>/dev/null | grep -v key | head -1)
KEY_FILE=$(ls -1 "$CERTS_DIR"/*-key.pem 2>/dev/null | head -1)

if [ -z "$CERT_FILE" ] || [ -z "$KEY_FILE" ]; then
    echo "❌ Failed to find generated certificate files"
    exit 1
fi

echo ""
echo "✅ Certificate generated successfully!"
echo ""
echo "Certificate files:"
echo "  Cert: $CERT_FILE"
echo "  Key:  $KEY_FILE"
echo ""
echo "To use HTTPS in development, run:"
echo "  bun run dev"
echo ""
echo "Or manually specify certificates:"
echo "  bun service.ts start -h 0.0.0.0 -p 443 --cert $CERT_FILE --key $KEY_FILE"
echo ""
echo "Note: Port 443 requires root privileges. Use sudo if needed."
echo ""
