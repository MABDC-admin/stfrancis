#!/bin/bash
# ============================================
# St. Francis Portal - VPS Deployment Script
# ============================================
# Run this script on your Ubuntu/Debian VPS
# Usage: chmod +x deploy-vps.sh && ./deploy-vps.sh

set -e

echo "============================================"
echo "St. Francis Portal - VPS Deployment"
echo "============================================"

# Configuration
APP_NAME="stfrancis"
APP_DIR="/var/www/$APP_NAME"
REPO_URL="https://github.com/MABDC-admin/stfrancis.git"
NODE_VERSION="20"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log_info() { echo -e "${GREEN}[INFO]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

# Check if running as root
if [ "$EUID" -ne 0 ]; then
  log_error "Please run as root (sudo ./deploy-vps.sh)"
  exit 1
fi

# ============================================
# Step 1: Install System Dependencies
# ============================================
log_info "Installing system dependencies..."

apt update && apt upgrade -y
apt install -y curl git nginx certbot python3-certbot-nginx

# Install Node.js via nvm
if ! command -v node &> /dev/null; then
  log_info "Installing Node.js $NODE_VERSION..."
  curl -fsSL https://deb.nodesource.com/setup_${NODE_VERSION}.x | bash -
  apt install -y nodejs
fi

# Install PM2 globally
if ! command -v pm2 &> /dev/null; then
  log_info "Installing PM2..."
  npm install -g pm2
fi

# ============================================
# Step 2: Clone/Update Repository
# ============================================
log_info "Setting up application directory..."

if [ -d "$APP_DIR" ]; then
  log_info "Updating existing repository..."
  cd $APP_DIR
  git fetch origin
  git reset --hard origin/main
else
  log_info "Cloning repository..."
  git clone $REPO_URL $APP_DIR
  cd $APP_DIR
fi

# ============================================
# Step 3: Install Dependencies
# ============================================
log_info "Installing frontend dependencies..."
npm install

log_info "Installing backend dependencies..."
cd server
npm install
cd ..

# ============================================
# Step 4: Build Frontend
# ============================================
log_info "Building frontend for production..."

# Create frontend .env
if [ ! -f ".env" ]; then
  log_warn "Creating frontend .env file - UPDATE THIS WITH YOUR VALUES!"
  cat > .env << EOF
VITE_API_URL=https://api.sfxsai.com
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
EOF
fi

npm run build

# ============================================
# Step 5: Setup Backend
# ============================================
log_info "Setting up backend..."

cd server

# Create backend .env if not exists
if [ ! -f ".env" ]; then
  log_warn "Creating backend .env file - UPDATE THIS WITH YOUR VALUES!"
  cp .env.vps.example .env
  log_error "IMPORTANT: Edit /var/www/$APP_NAME/server/.env with your database credentials!"
fi

# Create storage directories
mkdir -p storage/{logos,documents,photos,books,student-documents,exports,temp}
chown -R www-data:www-data storage

cd ..

# ============================================
# Step 6: Configure Nginx
# ============================================
log_info "Configuring Nginx..."

cat > /etc/nginx/sites-available/$APP_NAME << 'EOF'
# Frontend (React)
server {
    listen 80;
    server_name sfxsai.com www.sfxsai.com;
    
    root /var/www/stfrancis/dist;
    index index.html;
    
    # Gzip compression
    gzip on;
    gzip_types text/plain text/css application/json application/javascript text/xml application/xml;
    
    # Cache static assets
    location /assets/ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }
    
    # SPA routing
    location / {
        try_files $uri $uri/ /index.html;
    }
}

# Backend API
server {
    listen 80;
    server_name api.sfxsai.com;
    
    location / {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        
        # Increase timeouts for long-running requests
        proxy_read_timeout 300;
        proxy_connect_timeout 300;
        proxy_send_timeout 300;
    }
}
EOF

# Enable site
ln -sf /etc/nginx/sites-available/$APP_NAME /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default

# Test and reload Nginx
nginx -t && systemctl reload nginx

# ============================================
# Step 7: Start Application with PM2
# ============================================
log_info "Starting application with PM2..."

cd $APP_DIR/server

# Stop existing processes
pm2 delete $APP_NAME 2>/dev/null || true

# Start backend
pm2 start index.js --name $APP_NAME --env production

# Save PM2 process list
pm2 save

# Setup PM2 to start on boot
pm2 startup systemd -u root --hp /root

# ============================================
# Step 8: SSL Certificate (Optional)
# ============================================
log_info "SSL Certificate Setup"
echo ""
echo "To enable HTTPS, run these commands after DNS is configured:"
echo ""
echo "  certbot --nginx -d sfxsai.com -d www.sfxsai.com -d api.sfxsai.com"
echo ""

# ============================================
# Deployment Complete
# ============================================
echo ""
echo "============================================"
echo "Deployment Complete!"
echo "============================================"
echo ""
echo "Next Steps:"
echo "1. Edit backend config: nano $APP_DIR/server/.env"
echo "2. Edit frontend config: nano $APP_DIR/.env"
echo "3. Rebuild frontend: cd $APP_DIR && npm run build"
echo "4. Restart backend: pm2 restart $APP_NAME"
echo "5. Setup Cloudflare Tunnel (see cloudflare-tunnel.sh)"
echo "6. Or setup SSL: certbot --nginx -d sfxsai.com -d api.sfxsai.com"
echo ""
echo "Useful Commands:"
echo "  pm2 logs $APP_NAME      # View logs"
echo "  pm2 status              # Check status"
echo "  pm2 restart $APP_NAME   # Restart backend"
echo ""
