# Vercel Deployment Checklist

## Pre-Deployment Audit ✅

### Build & TypeScript
- ✅ TypeScript compilation passes without errors
- ✅ Build process completes successfully
- ✅ All environment variables properly typed (`vite-env.d.ts`)
- ✅ Scripts excluded from build (not needed for production)

### Configuration
- ✅ `vercel.json` created with proper SPA routing
- ✅ Vite config optimized with code splitting
- ✅ Output directory set to `dist`
- ✅ Cache headers configured for assets

### Security
- ✅ No hardcoded secrets in frontend code
- ✅ Service role keys only in scripts (not exposed)
- ✅ Environment variables properly prefixed with `VITE_`
- ✅ Error messages don't expose sensitive info in production

### Code Quality
- ✅ No linting errors
- ✅ TypeScript strict mode enabled
- ✅ Proper error handling in critical paths

## Deployment Steps

### 1. Environment Variables Setup

In Vercel Dashboard → Project Settings → Environment Variables, add:

**Production:**
```
VITE_SUPABASE_URL=https://yjmnehvlpxzqmtmemkdv.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key-here
VITE_DOCX_SERVICE_URL=https://your-python-service.railway.app/generate
```

**Preview:**
```
VITE_SUPABASE_URL=https://yjmnehvlpxzqmtmemkdv.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key-here
VITE_DOCX_SERVICE_URL=https://your-python-service.railway.app/generate
```

**Development (optional):**
```
VITE_SUPABASE_URL=https://yjmnehvlpxzqmtmemkdv.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key-here
VITE_DOCX_SERVICE_URL=http://localhost:5001/generate
```

### 2. Connect Repository

1. Go to [Vercel Dashboard](https://vercel.com/dashboard)
2. Click "Add New..." → "Project"
3. Import your GitHub repository
4. Vercel will auto-detect Vite framework

### 3. Verify Build Settings

Vercel should auto-detect from `vercel.json`, but verify:
- **Framework Preset**: Vite
- **Build Command**: `npm run build`
- **Output Directory**: `dist`
- **Install Command**: `npm install`

### 4. Deploy

1. Click "Deploy"
2. Monitor build logs
3. Wait for deployment to complete

### 5. Post-Deployment Verification

- [ ] App loads without errors
- [ ] Can view dashboard
- [ ] Can view clients list
- [ ] Can view orders list
- [ ] Can create new client
- [ ] Can create new order
- [ ] Database queries work correctly
- [ ] Authentication works
- [ ] Document generation works (if Python service is deployed)
- [ ] No console errors in browser
- [ ] All routes work (SPA routing)

## Troubleshooting

### Build Fails
- Check build logs in Vercel dashboard
- Verify all dependencies are in `package.json`
- Ensure TypeScript compiles without errors locally

### Environment Variables Not Working
- Verify variables are set in Vercel dashboard
- Check variable names start with `VITE_`
- Redeploy after adding/changing variables

### Routing Issues (404 on refresh)
- Verify `vercel.json` has the rewrite rule
- Check that all routes redirect to `/index.html`

### Database Connection Errors
- Verify `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` are set
- Check Supabase project is active
- Verify RLS policies allow access
- Check browser console for specific error messages

### Document Generation Fails
- Verify `VITE_DOCX_SERVICE_URL` is set correctly
- Check Python service is deployed and accessible
- Verify CORS is enabled on Python service
- Check browser console and network tab

## Performance Optimizations Applied

1. **Code Splitting**: Vendor chunks separated for better caching
   - React vendor
   - UI vendor (Radix UI)
   - Supabase vendor
   - React Query vendor
   - i18n vendor

2. **Asset Caching**: Static assets cached for 1 year

3. **Build Optimization**: Source maps disabled for production

## Files Changed/Added

- ✅ `vite-env.d.ts` - Type definitions for environment variables
- ✅ `vercel.json` - Vercel deployment configuration
- ✅ `vite.config.ts` - Optimized with code splitting
- ✅ `tsconfig.json` - Excludes scripts from build
- ✅ `lib/supabase.ts` - Improved error handling

## Notes

- Scripts in `/scripts` directory are excluded from build (not needed for production)
- Python service must be deployed separately (Railway, Render, or Fly.io)
- All environment variables must be prefixed with `VITE_` to be accessible in the frontend
- Service role keys should NEVER be exposed in frontend code





