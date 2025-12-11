# Production Deployment Checklist

## Pre-Deployment

- [x] Project cleaned up (backup files removed)
- [x] .gitignore updated
- [x] Documentation complete
- [x] No sensitive data in repository
- [x] All tests passed (Phase 9 complete)

## Vercel Configuration

### Environment Variables to Set

1. **VITE_SUPABASE_URL**
   - Value: `https://supabase.service-mk.ru`
   - Alternative: `https://api.service-mk.ru` (both point to same API)
   - Set for: Production, Preview, Development
   - Note: Use `http://` if SSL not enabled yet

2. **VITE_SUPABASE_ANON_KEY**
   - Get from: `~/supabase/docker/.env` on VM
   - Command: `ssh <SSH_HOST_ALIAS> "cd ~/supabase/docker && cat .env | grep '^ANON_KEY=' | cut -d'=' -f2"`
   - Set for: Production, Preview, Development

### Build Settings

- Framework: Vite
- Build Command: `npm run build`
- Output Directory: `dist`
- Install Command: `npm install`

## Post-Deployment Verification

- [ ] Application loads without errors
- [ ] Authentication works
- [ ] Can create new clients
- [ ] Can create new orders
- [ ] Data persists in database
- [ ] No console errors
- [ ] API requests succeed

## Quick Commands

```bash
# Get ANON_KEY from VM
ssh <SSH_HOST_ALIAS> "cd ~/supabase/docker && cat .env | grep '^ANON_KEY=' | cut -d'=' -f2"

# Test domain access
curl -I https://supabase.service-mk.ru/rest/v1/
# Should return HTTP 401 (authentication required - expected)

# Deploy to Vercel
vercel --prod

# Check deployment status
vercel ls
```

## Documentation

- Vercel Deployment: `docs/VERCEL_DEPLOYMENT.md`
- Operations Guide: `docs/SUPABASE_OPERATIONS_GUIDE.md`
