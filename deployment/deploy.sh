#!/bin/bash

# Deployment script for VM
# This script pulls latest code from GitHub and rebuilds the application
# Usage: ./deploy.sh [branch]
# Default branch: main

set -e  # Exit on error

# Configuration
APP_DIR="/opt/crm-app"
REPO_DIR="$APP_DIR/repo"
FRONTEND_DIR="$APP_DIR/frontend"
SCRIPTS_DIR="$APP_DIR/scripts"
LOGS_DIR="$APP_DIR/logs"
GITHUB_REPO="https://github.com/konscodes/client-code.git"
BRANCH="${1:-main}"

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

log "=========================================="
log "Starting deployment - Branch: $BRANCH"
log "=========================================="

# Check if repo directory exists
if [ ! -d "$REPO_DIR" ]; then
    print_info "Repository not found. Cloning from GitHub..."
    mkdir -p "$REPO_DIR"
    git clone "$GITHUB_REPO" "$REPO_DIR"
    print_success "Repository cloned"
else
    print_info "Updating repository from GitHub..."
    cd "$REPO_DIR"
    
    # Fetch latest changes
    git fetch origin
    
    # Checkout the specified branch
    git checkout "$BRANCH" 2>/dev/null || git checkout -b "$BRANCH" "origin/$BRANCH"
    
    # Pull latest changes
    git pull origin "$BRANCH"
    
    print_success "Repository updated"
fi

# Run the pull-and-build script
if [ -f "$REPO_DIR/deployment/pull-and-build.sh" ]; then
    print_info "Running build script..."
    bash -x "$REPO_DIR/deployment/pull-and-build.sh" 2>&1 | tee -a "$LOGS_DIR/deployment.log"
    BUILD_EXIT_CODE=${PIPESTATUS[0]}
    if [ $BUILD_EXIT_CODE -ne 0 ]; then
        print_error "Build script failed with exit code: $BUILD_EXIT_CODE"
        exit $BUILD_EXIT_CODE
    fi
else
    print_error "Build script not found at $REPO_DIR/deployment/pull-and-build.sh"
    exit 1
fi

log "=========================================="
log "Deployment completed successfully"
log "=========================================="

print_success "Deployment completed!"
