#!/bin/bash
# Development script wrapper that automatically uses HTTPS if certificates exist

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CERTS_DIR="$SCRIPT_DIR/../certs"
IP_ADDRESS="192.168.1.204"

# Find certificate files
CERT_FILE=$(ls -1 "$CERTS_DIR"/*.pem 2>/dev/null | grep -v key | grep -E "(localhost|$IP_ADDRESS)" | head -1)
KEY_FILE=$(ls -1 "$CERTS_DIR"/*-key.pem 2>/dev/null | grep -E "(localhost|$IP_ADDRESS)" | head -1)

# Set environment variables
export NODE_ENV=development
export BUN_ENV=development

# Build command arguments
# Use port 443 for standard HTTPS (requires root/sudo)
ARGS=("run" "--watch" "service.ts" "start" "-h" "0.0.0.0" "-p" "443")

# Add TLS options if certificates exist
if [ -n "$CERT_FILE" ] && [ -n "$KEY_FILE" ] && [ -f "$CERT_FILE" ] && [ -f "$KEY_FILE" ]; then
    echo "🔐 Using HTTPS with certificates:"
    echo "   Cert: $CERT_FILE"
    echo "   Key:  $KEY_FILE"
    echo ""
    ARGS+=("--cert" "$CERT_FILE" "--key" "$KEY_FILE")
else
    echo "ℹ️  No certificates found, using HTTP"
    echo "   To enable HTTPS, run: ./scripts/generate-dev-cert.sh"
    echo ""
fi

# Check if we need sudo for port 443
if [ "$(id -u)" -ne 0 ]; then
    echo "⚠️  Port 443 requires root privileges."
    echo "   Running with sudo..."
    echo ""
    exec sudo -E env "PATH=$PATH" bun "${ARGS[@]}"
else
    exec bun "${ARGS[@]}"
fi
