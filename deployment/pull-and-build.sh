#!/bin/bash

# Core deployment logic - pulls code and builds frontend
# This script is called by deploy.sh
# It should be run from the repository root directory

set -e  # Exit on error

# Configuration
APP_DIR="/opt/crm-app"
REPO_DIR="$APP_DIR/repo"
FRONTEND_DIR="$APP_DIR/frontend"
LOGS_DIR="$APP_DIR/logs"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to print colored output
print_success() {
    echo -e "${GREEN}✓${NC} $1"
}

print_error() {
    echo -e "${RED}✗${NC} $1"
}

print_info() {
    echo -e "${YELLOW}→${NC} $1"
}

# Log function
log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOGS_DIR/deployment.log"
}

# Ensure we're in the repo directory
cd "$REPO_DIR" || {
    print_error "Cannot access repository directory: $REPO_DIR"
    exit 1
}

log "Starting build process..."

# Check if .env.production exists
if [ ! -f "$REPO_DIR/.env.production" ]; then
    print_info ".env.production not found. Creating from template..."
    if [ -f "$REPO_DIR/.env.example" ]; then
        cp "$REPO_DIR/.env.example" "$REPO_DIR/.env.production"
        print_info "Created .env.production from .env.example"
        print_info "Please edit .env.production with your production values"
    else
        print_error ".env.production not found and no .env.example to copy from"
        print_info "Creating minimal .env.production..."
        cat > "$REPO_DIR/.env.production" << EOF
# Production Environment Variables
VITE_SUPABASE_URL=https://api.service-mk.com
VITE_SUPABASE_ANON_KEY=your-anon-key-here
VITE_DOCX_SERVICE_URL=/api/generate
EOF
        print_info "Created minimal .env.production - please update with your values"
    fi
fi

# Install/update Node.js dependencies
print_info "Installing/update Node.js dependencies..."
print_info "Using low-memory mode for resource-constrained VM..."

# Set Node.js memory limits for low-resource environments
export NODE_OPTIONS="--max-old-space-size=1024"

if [ ! -d "$REPO_DIR/node_modules" ]; then
    npm install --prefer-offline --no-audit
    print_success "Dependencies installed"
else
    npm install --prefer-offline --no-audit
    print_success "Dependencies updated"
fi

# Build frontend
print_info "Building frontend application..."
export NODE_ENV=production

# Load environment variables from .env.production for build
if [ -f "$REPO_DIR/.env.production" ]; then
    set -a
    source "$REPO_DIR/.env.production"
    set +a
fi

# Build with memory optimization
print_info "Starting build (this may take a few minutes on low-resource VM)..."
NODE_OPTIONS="--max-old-space-size=1024" npm run build

if [ ! -d "$REPO_DIR/dist" ]; then
    print_error "Build failed - dist directory not created"
    exit 1
fi

print_success "Frontend built successfully"

# Copy built files to frontend directory
print_info "Copying built files to frontend directory..."
mkdir -p "$FRONTEND_DIR"
rm -rf "$FRONTEND_DIR"/*
cp -r "$REPO_DIR/dist"/* "$FRONTEND_DIR/"
print_success "Frontend files copied to $FRONTEND_DIR"

# Copy Python service files
print_info "Updating Python service files..."
# Create directory if it doesn't exist (it should, but safety first)
mkdir -p "$APP_DIR/python-service"
# Copy files, excluding venv and __pycache__
rsync -av --exclude 'venv' --exclude '__pycache__' --exclude '*.pyc' "$REPO_DIR/python-service/" "$APP_DIR/python-service/"
# Ensure venv exists in target (if not created by setup script)
if [ ! -d "$APP_DIR/python-service/venv" ]; then
    print_info "Creating virtual environment..."
    python3 -m venv "$APP_DIR/python-service/venv"
    source "$APP_DIR/python-service/venv/bin/activate"
    pip install -r "$APP_DIR/python-service/requirements.txt"
else
    # Update dependencies if requirements changed
    if [ -f "$REPO_DIR/python-service/requirements.txt" ]; then
        print_info "Checking/Updating Python dependencies..."
        source "$APP_DIR/python-service/venv/bin/activate"
        pip install -r "$APP_DIR/python-service/requirements.txt"
    fi
fi
print_success "Python service files updated"

# Copy Python service files
print_info "Updating Python service files..."
# Create directory if it doesn't exist (it should, but safety first)
mkdir -p "$APP_DIR/python-service"
# Copy files, excluding venv and __pycache__
rsync -av --exclude 'venv' --exclude '__pycache__' --exclude '*.pyc' "$REPO_DIR/python-service/" "$APP_DIR/python-service/"
# Ensure venv exists in target (if not created by setup script)
if [ ! -d "$APP_DIR/python-service/venv" ]; then
    print_info "Creating virtual environment..."
    python3 -m venv "$APP_DIR/python-service/venv"
    source "$APP_DIR/python-service/venv/bin/activate"
    pip install -r "$APP_DIR/python-service/requirements.txt"
else
    # Update dependencies if requirements changed
    if [ -f "$REPO_DIR/python-service/requirements.txt" ]; then
        print_info "Checking/Updating Python dependencies..."
        source "$APP_DIR/python-service/venv/bin/activate"
        pip install -r "$APP_DIR/python-service/requirements.txt"
    fi
fi
print_success "Python service files updated"

# Restart Python service
print_info "Restarting Python service..."
if sudo systemctl restart python-docx-service; then
    print_success "Python service restarted"
else
    print_error "Failed to restart Python service"
    # Do not exit with error, as it might be a transient issue or service not installed
    # log "Warning: Failed to restart python-docx-service"
fi

# Reload Nginx (if configured)
if command -v nginx &> /dev/null; then
    if sudo systemctl is-active --quiet nginx; then
        print_info "Reloading Nginx..."
        sudo nginx -t && sudo systemctl reload nginx
        print_success "Nginx reloaded"
    fi
fi

log "Build process completed successfully"

print_success "Build completed successfully!"
print_info "Frontend files are available at: $FRONTEND_DIR"
