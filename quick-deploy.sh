#!/bin/bash
# ============================================
# St. Francis Portal - Quick VPS Deploy
# Run this script directly on the VPS after SSH login
# ============================================

set -e

echo "============================================"
echo "St. Francis Portal - VPS Setup"
echo "============================================"

# Install dependencies
echo "[1/8] Installing system packages..."
apt update
apt install -y curl git nginx certbot python3-certbot-nginx

# Install Node.js 20
echo "[2/8] Installing Node.js 20..."
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs

# Install PM2
echo "[3/8] Installing PM2..."
npm install -g pm2

# Clone repository
echo "[4/8] Cloning repository..."
mkdir -p /var/www
cd /var/www
rm -rf stfrancis
git clone https://github.com/MABDC-admin/stfrancis.git stfrancis
cd stfrancis

# Install frontend dependencies and build
echo "[5/8] Building frontend..."
cat > .env << 'EOF'
VITE_API_URL=https://api.sfxsai.com
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
EOF
npm install
npm run build

# Setup backend
echo "[6/8] Setting up backend..."
cd server
cat > .env << 'EOF'
NODE_ENV=production
PORT=3001
API_URL=https://api.sfxsai.com

# Railway PostgreSQL
DATABASE_URL=postgresql://postgres:wbENsZVdfuLWXAKmXdIkqMCOrMWZPVXl@junction.proxy.rlwy.net:29837/railway

# Security
JWT_SECRET=stfrancis-portal-jwt-secret-production-key-2024

# CORS
FRONTEND_URL=https://sfxsai.com

# File Storage
STORAGE_PATH=/var/www/stfrancis/storage
MAX_FILE_SIZE=52428800

# Email (Optional)
RESEND_API_KEY=
EMAIL_FROM=St. Francis Portal <noreply@sfxsai.com>
EOF

npm install

# Create storage directories
mkdir -p storage/{logos,documents,photos,books,student-documents,exports,temp}
chown -R www-data:www-data storage

# Configure Nginx
echo "[7/8] Configuring Nginx..."
cat > /etc/nginx/sites-available/stfrancis << 'NGINX'
# Frontend
server {
    listen 80;
    server_name sfxsai.com www.sfxsai.com;
    
    root /var/www/stfrancis/dist;
    index index.html;
    
    gzip on;
    gzip_types text/plain text/css application/json application/javascript text/xml application/xml;
    
    location /assets/ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }
    
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
        proxy_read_timeout 300;
    }
}
NGINX

ln -sf /etc/nginx/sites-available/stfrancis /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl reload nginx

# Start backend with PM2
echo "[8/8] Starting backend service..."
cd /var/www/stfrancis/server
pm2 delete stfrancis 2>/dev/null || true
pm2 start index.js --name stfrancis
pm2 save
pm2 startup systemd -u root --hp /root

echo ""
echo "============================================"
echo "Deployment Complete!"
echo "============================================"
echo ""
echo "Backend running on port 3001"
echo "Frontend served from /var/www/stfrancis/dist"
echo ""
echo "Next: Setup Cloudflare Tunnel for HTTPS"
echo "Run: cloudflared tunnel login"
echo ""
