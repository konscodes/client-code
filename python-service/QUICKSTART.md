# Quick Start Guide

## Local Development

### 1. Setup (One-time)

```bash
# From project root
cd python-service
./setup.sh

# Or use npm script
npm run python:setup
```

### 2. Start Service

```bash
# From python-service directory
./start.sh

# Or use npm script from project root
npm run python:dev
```

The service will start on `http://localhost:5001`

### 3. Verify It's Working

```bash
curl http://localhost:5001/health
# Should return: {"status":"healthy"}
```

## Production Deployment

See [README.md](./README.md) for detailed deployment instructions.

Quick options:
- **Railway**: Easiest, auto-detects Python
- **Render**: Simple web service deployment
- **Fly.io**: More control, CLI-based

After deployment, add the service URL to Vercel environment variables as `VITE_DOCX_SERVICE_URL`.





