# Document Generation Fix Summary

## Issues Fixed

### 1. ✅ Vercel Rewrite Rule Conflict

**Problem:** The `vercel.json` rewrite rule was catching `/api/generate` and sending it to `index.html` instead of the serverless function.

**Fix:** Added explicit `/api/*` rewrite rule before the catch-all:
```json
{
  "rewrites": [
    {
      "source": "/api/(.*)",
      "destination": "/api/$1"
    },
    {
      "source": "/(.*)",
      "destination": "/index.html"
    }
  ]
}
```

### 2. ✅ Missing Python Dependencies

**Problem:** Vercel needs `requirements.txt` in the `api/` directory to install Python dependencies.

**Fix:** Created `api/requirements.txt` with:
```
python-docx==1.1.0
```

### 3. ✅ Improved Error Logging

**Problem:** Generic error messages made debugging difficult.

**Fixes:**
- Added detailed logging in `api/generate.py`:
  - Logs request path, token presence, environment variables
  - Logs authentication status
  - Logs document generation steps
  - Logs full error tracebacks
- Improved error handling in `lib/document-generator.ts`:
  - Parses JSON error responses
  - Shows detailed error messages
  - Logs error details for debugging

## Verification Steps

### 1. Check Vercel Configuration

1. **Verify `vercel.json` has the API rewrite:**
   ```bash
   cat vercel.json | grep -A 5 "rewrites"
   ```
   Should show `/api/*` rewrite before catch-all.

2. **Verify `api/requirements.txt` exists:**
   ```bash
   cat api/requirements.txt
   ```
   Should contain `python-docx==1.1.0`

### 2. Check Environment Variables in Vercel

Go to **Vercel Dashboard → Project Settings → Environment Variables** and verify:

- ✅ `VITE_SUPABASE_URL` - Your Supabase project URL
- ✅ `VITE_SUPABASE_ANON_KEY` - Your Supabase anon key

**Important:** These must be set for the Python function to verify authentication tokens.

### 3. Test the Function

1. **Health Check:**
   ```bash
   curl https://client-code-one.vercel.app/api/generate
   ```
   Should return: `{"status": "healthy"}`

2. **Check Function Logs:**
   - Go to Vercel Dashboard → Deployments → Latest
   - Click **Functions** tab
   - Click on `api/generate`
   - Check **Logs** for any errors

### 4. Test Document Generation

1. **In Production:**
   - Log in to the app
   - Open an order
   - Try generating a document
   - Check browser console for detailed error messages

2. **Check Network Tab:**
   - Open DevTools → Network
   - Generate a document
   - Check the request to `/api/generate`:
     - Status code
     - Request headers (should have `Authorization: Bearer <token>`)
     - Response body (error details)

## What to Check Next

If document generation still fails:

1. **Check Vercel Function Logs:**
   - The improved logging will show:
     - Whether the request is received
     - Whether environment variables are set
     - Whether authentication succeeds
     - Where exactly the error occurs

2. **Verify Environment Variables:**
   - The function logs will show if `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` are set
   - If not set, add them in Vercel dashboard and redeploy

3. **Check Authentication:**
   - The function logs will show if token verification succeeds
   - If it fails, check:
     - User is logged in
     - Token is being sent from frontend
     - Supabase URL and key are correct

## Files Changed

1. ✅ `vercel.json` - Added `/api/*` rewrite rule
2. ✅ `api/requirements.txt` - Created with Python dependencies
3. ✅ `api/generate.py` - Improved error logging and handling
4. ✅ `lib/document-generator.ts` - Better error parsing and logging
5. ✅ `docs/TROUBLESHOOTING_DOCUMENT_GENERATION.md` - Comprehensive troubleshooting guide

## Next Steps

1. **Commit and push these changes**
2. **Wait for Vercel to redeploy**
3. **Test document generation in production**
4. **Check Vercel function logs if it still fails**
5. **Use the troubleshooting guide** for further debugging

## Expected Behavior After Fix

- ✅ `/api/generate` requests reach the Python function
- ✅ Function can install `python-docx` dependency
- ✅ Detailed error messages in logs if something fails
- ✅ Better error messages shown to users
- ✅ Function logs show exactly where errors occur

