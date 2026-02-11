#!/bin/bash
# ============================================
# Cloudflare Tunnel Setup Script
# ============================================
# Run this after deploy-vps.sh
# Usage: chmod +x cloudflare-tunnel.sh && ./cloudflare-tunnel.sh

set -e

echo "============================================"
echo "Cloudflare Tunnel Setup"
echo "============================================"

# Check if running as root
if [ "$EUID" -ne 0 ]; then
  echo "Please run as root (sudo ./cloudflare-tunnel.sh)"
  exit 1
fi

# ============================================
# Step 1: Install cloudflared
# ============================================
echo "[INFO] Installing cloudflared..."

if ! command -v cloudflared &> /dev/null; then
  curl -L --output cloudflared.deb https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb
  dpkg -i cloudflared.deb
  rm cloudflared.deb
else
  echo "[INFO] cloudflared already installed"
fi

# ============================================
# Step 2: Authenticate with Cloudflare
# ============================================
echo ""
echo "[INFO] Authenticating with Cloudflare..."
echo "A browser window will open. Log in and authorize the tunnel."
echo ""

cloudflared tunnel login

# ============================================
# Step 3: Create Tunnel
# ============================================
TUNNEL_NAME="stfrancis-portal"

echo "[INFO] Creating tunnel: $TUNNEL_NAME"

# Check if tunnel exists
if cloudflared tunnel list | grep -q "$TUNNEL_NAME"; then
  echo "[INFO] Tunnel already exists"
else
  cloudflared tunnel create $TUNNEL_NAME
fi

# Get tunnel ID
TUNNEL_ID=$(cloudflared tunnel list | grep "$TUNNEL_NAME" | awk '{print $1}')
echo "[INFO] Tunnel ID: $TUNNEL_ID"

# ============================================
# Step 4: Create Tunnel Configuration
# ============================================
echo "[INFO] Creating tunnel configuration..."

mkdir -p /etc/cloudflared

cat > /etc/cloudflared/config.yml << EOF
tunnel: $TUNNEL_ID
credentials-file: /root/.cloudflared/$TUNNEL_ID.json

ingress:
  # Frontend - Main domain
  - hostname: sfxsai.com
    service: http://localhost:80
  
  # Frontend - www subdomain
  - hostname: www.sfxsai.com
    service: http://localhost:80
  
  # Backend API
  - hostname: api.sfxsai.com
    service: http://localhost:3001
  
  # Catch-all (required)
  - service: http_status:404
EOF

echo "[INFO] Configuration saved to /etc/cloudflared/config.yml"

# ============================================
# Step 5: Create DNS Records
# ============================================
echo ""
echo "[INFO] Creating DNS records..."
echo "You may be prompted to select a zone."
echo ""

# These commands will create CNAME records pointing to your tunnel
cloudflared tunnel route dns $TUNNEL_NAME sfxsai.com || true
cloudflared tunnel route dns $TUNNEL_NAME www.sfxsai.com || true
cloudflared tunnel route dns $TUNNEL_NAME api.sfxsai.com || true

# ============================================
# Step 6: Install as System Service
# ============================================
echo "[INFO] Installing cloudflared as system service..."

cloudflared service install
systemctl enable cloudflared
systemctl start cloudflared

# ============================================
# Done!
# ============================================
echo ""
echo "============================================"
echo "Cloudflare Tunnel Setup Complete!"
echo "============================================"
echo ""
echo "Your tunnel is now running and will:"
echo "  - sfxsai.com → Frontend (port 80)"
echo "  - www.sfxsai.com → Frontend (port 80)"  
echo "  - api.sfxsai.com → Backend (port 3001)"
echo ""
echo "Useful Commands:"
echo "  systemctl status cloudflared    # Check tunnel status"
echo "  systemctl restart cloudflared   # Restart tunnel"
echo "  journalctl -u cloudflared -f    # View tunnel logs"
echo "  cloudflared tunnel list         # List tunnels"
echo ""
echo "Configuration file: /etc/cloudflared/config.yml"
echo ""
