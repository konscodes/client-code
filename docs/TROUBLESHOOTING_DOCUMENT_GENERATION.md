# Troubleshooting Document Generation

## Error: `FUNCTION_INVOCATION_FAILED`

This error indicates that the Vercel serverless function (`/api/generate`) is failing to execute.

### Step 1: Verify Function is Deployed

1. **Check Vercel Dashboard:**
   - Go to your project → **Deployments**
   - Open the latest deployment
   - Check **Functions** tab
   - Verify `api/generate.py` is listed

2. **Test Function Directly:**
   ```bash
   # Health check (should return {"status": "healthy"})
   curl https://client-code-one.vercel.app/api/generate
   ```

### Step 2: Check Environment Variables

The function needs these environment variables in Vercel:

1. **Go to Vercel Dashboard → Project Settings → Environment Variables**

2. **Verify these are set:**
   - `VITE_SUPABASE_URL` - Your Supabase project URL
   - `VITE_SUPABASE_ANON_KEY` - Your Supabase anon key
   - `VITE_DOCX_SERVICE_URL` - (Optional) If using external Python service

3. **Important:** The Python function reads these as:
   - `VITE_SUPABASE_URL` → Used for token verification
   - `VITE_SUPABASE_ANON_KEY` → Used for token verification

   **Note:** In the Python function, these are accessed via `os.environ.get('VITE_SUPABASE_URL')`. Make sure they're set in Vercel.

### Step 3: Check Function Logs

1. **In Vercel Dashboard:**
   - Go to **Deployments** → Latest deployment
   - Click **Functions** tab
   - Click on `api/generate`
   - Check **Logs** for errors

2. **Common Errors:**

   **Error: "Module not found: docx"**
   - **Fix:** Ensure `api/requirements.txt` exists with `python-docx==1.1.0`
   - Redeploy

   **Error: "VITE_SUPABASE_URL not found"**
   - **Fix:** Add environment variables in Vercel dashboard
   - Redeploy

   **Error: "Token verification failed"**
   - **Fix:** Check that `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` are correct
   - Verify token is being sent from frontend

### Step 4: Verify Function Path

The frontend calls `/api/generate` which should map to `api/generate.py`.

**Check `vercel.json`:**
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

The `/api/*` rewrite must come **before** the catch-all rewrite.

### Step 5: Test Authentication

The function requires a Supabase authentication token.

1. **Check Browser Console:**
   - Open DevTools → Network tab
   - Try generating a document
   - Check the request to `/api/generate`
   - Verify `Authorization: Bearer <token>` header is present

2. **If token is missing:**
   - User must be logged in
   - Check `lib/document-generator.ts` - it should get token from `supabase.auth.getSession()`

### Step 6: Verify Function Code

Check that `api/generate.py`:
1. ✅ Has proper error handling
2. ✅ Returns proper error responses
3. ✅ Handles CORS correctly
4. ✅ Verifies authentication token

### Step 7: Test Locally (If Possible)

If you can test locally with Vercel CLI:

```bash
# Install Vercel CLI
npm i -g vercel

# Run locally
vercel dev

# Test the function
curl http://localhost:3000/api/generate
```

### Step 8: Check Function Runtime

Vercel Python functions need:
- ✅ `api/generate.py` file exists
- ✅ `api/requirements.txt` exists with dependencies
- ✅ Function uses `BaseHTTPRequestHandler` (correct for Vercel)

### Common Issues and Fixes

#### Issue: Function returns 500 error

**Possible causes:**
1. Missing `python-docx` dependency
   - **Fix:** Ensure `api/requirements.txt` exists
2. Environment variables not set
   - **Fix:** Add to Vercel dashboard and redeploy
3. Token verification failing
   - **Fix:** Check Supabase URL and key are correct

#### Issue: Function returns 401 error

**Possible causes:**
1. Token not sent from frontend
   - **Fix:** Check `lib/document-generator.ts` gets session token
2. Token expired
   - **Fix:** User needs to log in again
3. Token verification failing
   - **Fix:** Check Supabase environment variables

#### Issue: CORS errors

**Possible causes:**
1. Origin not in allowed list
   - **Fix:** Check `PRODUCTION_DOMAIN` in `api/generate.py` matches your domain
2. CORS headers not sent
   - **Fix:** Verify `send_cors_headers()` is called

### Debugging Steps

1. **Add logging to function:**
   ```python
   # In api/generate.py, add print statements
   print(f"Request received: {self.path}")
   print(f"Auth header: {self.headers.get('Authorization')}")
   print(f"Supabase URL: {os.environ.get('VITE_SUPABASE_URL')}")
   ```

2. **Check Vercel function logs:**
   - Deployments → Functions → api/generate → Logs

3. **Test with curl:**
   ```bash
   # Get token from browser (DevTools → Application → Local Storage → supabase.auth.token)
   TOKEN="your-token-here"
   
   curl -X POST https://client-code-one.vercel.app/api/generate \
     -H "Content-Type: application/json" \
     -H "Authorization: Bearer $TOKEN" \
     -d '{"type":"invoice","company":{},"client":{},"order":{},"jobs":[]}'
   ```

### Verification Checklist

- [ ] `api/generate.py` exists
- [ ] `api/requirements.txt` exists with `python-docx==1.1.0`
- [ ] `vercel.json` has `/api/*` rewrite before catch-all
- [ ] Environment variables set in Vercel:
  - [ ] `VITE_SUPABASE_URL`
  - [ ] `VITE_SUPABASE_ANON_KEY`
- [ ] Function appears in Vercel dashboard → Functions
- [ ] User is logged in (has valid session)
- [ ] Browser console shows token in Authorization header
- [ ] Function logs show no errors

### Next Steps

If the issue persists:
1. Check Vercel function logs for specific error messages
2. Verify all environment variables are set correctly
3. Test the function directly with curl
4. Check that `python-docx` dependency is installed (via `requirements.txt`)

