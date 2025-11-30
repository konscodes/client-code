# Deployment Guide

This guide covers the complete deployment process for the Premium Welding CRM application.

## Prerequisites

- GitHub repository: https://github.com/konscodes/client-code.git
- Supabase project created and configured
- Vercel account (free tier works)

## Step 1: Supabase Setup

### 1.1 Database Schema

The database schema has been created via migrations:
- `001_initial_schema` - Creates all 8 tables
- `002_enable_rls` - Enables Row Level Security and policies

### 1.2 Get Supabase Credentials

1. Go to your Supabase project dashboard
2. Navigate to Settings → API
3. Copy the following:
   - **Project URL**: `https://yjmnehvlpxzqmtmemkdv.supabase.co`
   - **anon/public key**: Used in frontend
   - **service_role key**: Used for migration scripts (keep secret!)

### 1.3 Create Admin User

1. Go to Authentication → Users in Supabase dashboard
2. Click "Add user" → "Create new user"
3. Enter email and password for admin account
4. The user will have full access via RLS policies

## Step 2: Local Environment Setup

1. **Create `.env.local` file** (already gitignored):
   ```env
   VITE_SUPABASE_URL=https://yjmnehvlpxzqmtmemkdv.supabase.co
   VITE_SUPABASE_ANON_KEY=your-anon-key-here
   SUPABASE_SERVICE_ROLE_KEY=your-service-role-key-here
   VITE_DOCX_SERVICE_URL=http://localhost:5001/generate
   ```

2. **Setup Python DOCX Service** (for document generation):
   ```bash
   cd python-service
   ./setup.sh
   # Or use npm script: npm run python:setup
   ```

3. **Start Python service** (in a separate terminal):
   ```bash
   cd python-service
   ./start.sh
   # Or use npm script: npm run python:dev
   ```
   The service will run on `http://localhost:5001`

4. **Test local connection:**
   ```bash
   npm run dev
   ```
   - Verify the app loads and connects to Supabase
   - Check browser console for any errors
   - Test document generation from an order

## Step 3: XML Data Migration (Optional)

If you have `servicemk3.xml` to migrate:

1. **Ensure XML file is in project root:**
   - File: `servicemk3.xml`
   - Already excluded from git (in `.gitignore`)

2. **Run migration script:**
   ```bash
   npm run migrate
   ```

3. **Verify migration:**
   - Check Supabase dashboard → Table Editor
   - Verify clients and orders were imported
   - Spot check a few records for accuracy

## Step 4: Vercel Deployment

### 4.1 Connect Repository

1. Go to [Vercel Dashboard](https://vercel.com/dashboard)
2. Click "Add New..." → "Project"
3. Import your GitHub repository: `konscodes/client-code`
4. Vercel will auto-detect Vite framework

### 4.2 Configure Build Settings

Vercel should auto-detect, but verify:
- **Framework Preset**: Vite
- **Build Command**: `npm run build`
- **Output Directory**: `dist`
- **Install Command**: `npm install`

### 4.3 Deploy Python DOCX Service

Since Vercel doesn't support Python directly, deploy the Python service separately:

#### Option 1: Railway (Recommended)

1. Create account at [railway.app](https://railway.app)
2. Create new project → "Deploy from GitHub repo"
3. Select your repository
4. Set root directory to `python-service`
5. Railway will auto-detect Python and install dependencies
6. Set environment variables:
   - `PORT` = (auto-set by Railway)
   - `FLASK_DEBUG` = `False`
7. Deploy and get the service URL (e.g., `https://your-service.railway.app`)
8. Add this URL to Vercel environment variables (see below)

#### Option 2: Render

1. Create account at [render.com](https://render.com)
2. Create new "Web Service"
3. Connect your GitHub repository
4. Configure:
   - **Root Directory**: `python-service`
   - **Build Command**: `pip install -r requirements.txt`
   - **Start Command**: `python docx_generator.py`
5. Set environment variables and deploy
6. Get the service URL and add to Vercel

#### Option 3: Fly.io

1. Install Fly CLI: `curl -L https://fly.io/install.sh | sh`
2. In `python-service` directory, run: `fly launch`
3. Follow prompts to create app
4. Deploy: `fly deploy`
5. Get the service URL and add to Vercel

### 4.4 Add Environment Variables

In Vercel project settings → Environment Variables, add:

**Production:**
- `VITE_SUPABASE_URL` = `https://yjmnehvlpxzqmtmemkdv.supabase.co`
- `VITE_SUPABASE_ANON_KEY` = (your anon key)
- `VITE_DOCX_SERVICE_URL` = `https://your-python-service.railway.app/generate` (or your deployed service URL)

**Preview** (optional, same as production):
- Same variables as production

**Development** (optional):
- `VITE_SUPABASE_URL` = (same as production)
- `VITE_SUPABASE_ANON_KEY` = (same as production)
- `VITE_DOCX_SERVICE_URL` = `http://localhost:5001/generate` (for local testing)

### 4.5 Deploy

1. Click "Deploy"
2. Wait for build to complete
3. Visit the deployment URL
4. Verify the app works correctly

### 4.6 Post-Deployment Verification

- [ ] App loads without errors
- [ ] Can view clients list
- [ ] Can view orders list
- [ ] Can create new client
- [ ] Can create new order
- [ ] Database queries work correctly
- [ ] Document generation works (invoice/PO)
- [ ] No console errors

## Step 5: Document Generation Testing

After deploying both services:

1. **Test document generation:**
   - Create or open an order in the app
   - Click "Generate Invoice" or "Generate PO"
   - Verify document downloads correctly
   - Check document contains correct data

2. **Troubleshooting:**
   - If generation fails, check browser console
   - Verify `VITE_DOCX_SERVICE_URL` is set correctly in Vercel
   - Check Python service logs in Railway/Render/Fly.io
   - Ensure CORS is enabled on Python service (already configured)

## Step 6: Domain Configuration (Optional)

1. In Vercel project settings → Domains
2. Add your custom domain
3. Follow DNS configuration instructions
4. Wait for SSL certificate provisioning

## Troubleshooting

### Build Fails

- Check build logs in Vercel dashboard
- Verify all dependencies are in `package.json`
- Ensure TypeScript compiles without errors

### Database Connection Errors

- Verify environment variables are set in Vercel
- Check Supabase project is active
- Verify RLS policies allow access
- Check browser console for specific error messages

### Migration Script Errors

- Verify `servicemk3.xml` exists in project root
- Check `SUPABASE_SERVICE_ROLE_KEY` is set in `.env.local`
- Verify XML file format is correct
- Check migration script logs for specific errors

### RLS Policy Issues

- Verify admin user is authenticated
- Check RLS policies in Supabase dashboard
- Ensure policies allow operations for authenticated users

## Security Notes

- **Never commit** `.env.local` or `servicemk3.xml` to git
- **Never expose** `SUPABASE_SERVICE_ROLE_KEY` in frontend code
- Use anon key in frontend, service role only in server-side scripts
- RLS policies protect data at the database level

## Maintenance

### Updating Database Schema

1. Create new migration via Supabase MCP or dashboard
2. Test migration locally
3. Apply to production Supabase project
4. Update application code if needed

### Adding New Features

1. Develop locally with `.env.local`
2. Test thoroughly
3. Push to GitHub (triggers Vercel deployment)
4. Monitor deployment logs

### Backup

- Supabase automatically backs up your database
- Manual backups available in Supabase dashboard
- Consider exporting data periodically for additional safety

## Support

For issues or questions:
- Check Supabase documentation: https://supabase.com/docs
- Check Vercel documentation: https://vercel.com/docs
- Review application logs in browser console and Vercel dashboard



