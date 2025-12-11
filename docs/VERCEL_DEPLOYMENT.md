# Vercel Deployment Guide

This document outlines the steps and configuration needed to deploy the application to Vercel.

## Prerequisites

- Vercel account
- Self-hosted Supabase instance running on Yandex Cloud
- Access to VM for retrieving API keys

## Environment Variables

The following environment variables must be configured in Vercel:

### Required Variables

1. **`VITE_SUPABASE_URL`**
   - **Value**: `https://supabase.service-mk.ru` (or `http://supabase.service-mk.ru` if SSL not enabled)
   - **Description**: The public URL of your self-hosted Supabase API
   - **Example**: `https://supabase.service-mk.ru`
   - **Note**: Use the domain name configured in NGINX Proxy Manager. Alternative: `https://api.service-mk.ru` (both point to the same API)

2. **`VITE_SUPABASE_ANON_KEY`**
   - **Value**: The anonymous key from your Supabase `.env` file
   - **Description**: Public API key for Supabase client
   - **How to get**: 
     ```bash
     ssh <SSH_HOST_ALIAS> "cd ~/supabase/docker && cat .env | grep '^ANON_KEY=' | cut -d'=' -f2"
     ```
   - **Note**: This is the public key, safe to use in frontend code. The same key works for both IP and domain access.

### Optional Variables

Currently, no optional environment variables are required. All configuration is handled through the required variables above.

## Setting Environment Variables in Vercel

### Via Vercel Dashboard

1. Go to your project in Vercel Dashboard
2. Navigate to **Settings** → **Environment Variables**
3. Add each variable:
   - **Key**: `VITE_SUPABASE_URL`
   - **Value**: Your Supabase URL
   - **Environment**: Select all (Production, Preview, Development)
4. Repeat for `VITE_SUPABASE_ANON_KEY`
5. Click **Save**

### Via Vercel CLI

```bash
# Set environment variables
vercel env add VITE_SUPABASE_URL
vercel env add VITE_SUPABASE_ANON_KEY

# Verify
vercel env ls
```

## Deployment Steps

### Initial Deployment

1. **Connect Repository**
   - Connect your GitHub repository to Vercel
   - Or use Vercel CLI: `vercel`

2. **Configure Build Settings**
   - **Framework Preset**: Vite
   - **Build Command**: `npm run build`
   - **Output Directory**: `dist`
   - **Install Command**: `npm install`

3. **Set Environment Variables**
   - Add all required environment variables (see above)
   - Ensure they're set for Production, Preview, and Development

4. **Deploy**
   - Push to main branch (auto-deploy)
   - Or manually deploy: `vercel --prod`

### Updating Environment Variables

If you need to update environment variables:

1. **Via Dashboard**: 
   - Settings → Environment Variables
   - Edit the variable
   - Redeploy the application

2. **Via CLI**:
   ```bash
   vercel env rm VITE_SUPABASE_URL
   vercel env add VITE_SUPABASE_URL
   vercel --prod
   ```

## Post-Deployment Verification

### 1. Check Application Loads

- Visit your Vercel deployment URL
- Verify the application loads without errors
- Check browser console for any errors

### 2. Test Authentication

- Try logging in with valid credentials
- Verify authentication flow works
- Check that user session persists

### 3. Test API Connectivity

- Create a new client
- Create a new order
- Verify data is saved to database
- Check that data appears in Supabase Studio

### 4. Check Network Requests

- Open browser DevTools → Network tab
- Verify API requests go to `https://supabase.service-mk.ru` (or your configured domain)
- Check that requests include proper authentication headers
- Verify requests use HTTPS (if SSL is configured)

## Troubleshooting

### Common Issues

#### 1. "Missing Supabase environment variables"

**Error**: Application shows error about missing Supabase configuration

**Solution**:
- Verify environment variables are set in Vercel
- Ensure variables are prefixed with `VITE_`
- Redeploy after adding variables

#### 2. "Failed to fetch" or CORS errors

**Error**: Network requests fail with CORS errors

**Solution**:
- Verify `VITE_SUPABASE_URL` is correct (should be `https://supabase.service-mk.ru` or `https://api.service-mk.ru`)
- Check that Supabase API is accessible from internet
- Verify domain resolves correctly: `nslookup supabase.service-mk.ru`
- Check NGINX Proxy Manager is running and configured correctly

#### 3. "401 Unauthorized" errors

**Error**: API requests return 401

**Solution**:
- Verify `VITE_SUPABASE_ANON_KEY` is correct
- Check that the key matches the one in Supabase `.env` file
- Ensure key hasn't been rotated

#### 4. Application builds but shows blank page

**Error**: Build succeeds but app doesn't load

**Solution**:
- Check browser console for errors
- Verify environment variables are available at build time
- Check Vercel build logs for warnings

## Security Considerations

### Environment Variables

- ✅ `VITE_SUPABASE_ANON_KEY` is safe to expose (it's a public key)
- ✅ `VITE_SUPABASE_URL` is safe to expose (it's a public API endpoint)
- ⚠️ Never commit `.env.local` or actual keys to repository
- ⚠️ Never use `SERVICE_ROLE_KEY` in frontend (it's a secret)

### API Security

- Supabase API requires authentication (401 without key is expected)
- RLS (Row Level Security) is enabled on all tables
- Only authenticated users can access data

## Monitoring

### Vercel Analytics

- Enable Vercel Analytics to monitor performance
- Track errors and user behavior
- Monitor API response times

### Supabase Monitoring

- Use monitoring scripts on VM: `~/check-services.sh`
- Check resource usage: `~/check-resources.sh`
- Review logs: `~/monitoring.log`

## Rollback

If deployment has issues:

1. **Via Dashboard**:
   - Go to Deployments
   - Find previous working deployment
   - Click "..." → "Promote to Production"

2. **Via CLI**:
   ```bash
   vercel rollback
   ```

## Continuous Deployment

### Automatic Deployments

- **Production**: Deploys on push to `main` branch
- **Preview**: Deploys on push to other branches
- **Development**: Deploys on pull requests

### Manual Deployments

```bash
# Deploy to preview
vercel

# Deploy to production
vercel --prod
```

## Checklist

Before deploying to production:

- [ ] Environment variables set in Vercel
- [ ] `VITE_SUPABASE_URL` set to `https://supabase.service-mk.ru` (or `http://` if SSL not enabled)
- [ ] `VITE_SUPABASE_ANON_KEY` is correct
- [ ] Supabase services are running and healthy
- [ ] Domain resolves correctly (`supabase.service-mk.ru` → VM IP)
- [ ] NGINX Proxy Manager is configured and running
- [ ] SSL certificate is configured (if using HTTPS)
- [ ] Test deployment on preview environment first
- [ ] Verify authentication works
- [ ] Test creating clients and orders
- [ ] Check browser console for errors
- [ ] Verify API requests succeed and go to correct domain

## Support

For issues:
1. Check Vercel deployment logs
2. Check browser console for errors
3. Verify Supabase services are running
4. Review operations guide: `docs/SUPABASE_OPERATIONS_GUIDE.md`

---

**Last Updated**: December 10, 2025

