# Domain Setup Guide

This guide explains how to configure your domain (`service-mk.ru`) to work with the self-hosted Supabase deployment.

## DNS Configuration

You've already configured DNS records:
- `supabase.service-mk.ru` → `84.201.173.147` (A record)
- `api.service-mk.ru` → `84.201.173.147` (A record)

## NGINX Proxy Manager Configuration

NGINX Proxy Manager is already installed and running. Configure it to handle your domain.

### Access NGINX Proxy Manager

1. Navigate to: `http://<VM_PUBLIC_IP>:81`
2. Login with default credentials (or your configured credentials)

### Create Proxy Host for API

Configure both domains to point to the API (port 8000):

1. Go to **Proxy Hosts** → **Add Proxy Host** (or edit existing)
2. **Details Tab:**
   - **Domain Names**: `supabase.service-mk.ru`, `api.service-mk.ru`
   - **Scheme**: `http`
   - **Forward Hostname/IP**: `localhost` (or `127.0.0.1`)
   - **Forward Port**: `8000` ⚠️ **Important: Use port 8000 for API**
   - **Cache Assets**: ✅ (optional)
   - **Block Common Exploits**: ✅ (recommended)
   - **Websockets Support**: ✅ (if using realtime features)

3. **SSL Tab:**
   - **SSL Certificate**: Request a new SSL Certificate with Let's Encrypt
   - **Email Address**: Your email for Let's Encrypt
   - **Agree to Terms**: ✅
   - **Force SSL**: ✅ (recommended)

4. **Advanced Tab** (optional):
   ```nginx
   # Custom Nginx Configuration
   location / {
       proxy_set_header Host $host;
       proxy_set_header X-Real-IP $remote_addr;
       proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
       proxy_set_header X-Forwarded-Proto $scheme;
   }
   ```

5. Click **Save**

**Note**: Studio remains accessible via direct IP (`http://<VM_PUBLIC_IP>:3000`) if needed, but is not exposed via domain.

## Update Supabase Configuration

After setting up NGINX, update Supabase to use the domain:

```bash
ssh <SSH_HOST_ALIAS> "cd ~/supabase/docker && \
  # Backup current .env
  cp .env .env.backup && \
  # Update SUPABASE_PUBLIC_URL to use domain
  sed -i 's|^SUPABASE_PUBLIC_URL=.*|SUPABASE_PUBLIC_URL=https://supabase.service-mk.ru|' .env && \
  # Restart services that use this URL
  sudo docker compose restart auth studio"
```

**Note**: 
- Use `https://` if SSL is enabled, `http://` if not
- Both `supabase.service-mk.ru` and `api.service-mk.ru` point to the same API (port 8000)
- Studio remains accessible via direct IP only

## Update Vercel Environment Variables

Update your Vercel deployment to use the domain:

1. Go to **Vercel Dashboard** → Your Project → **Settings** → **Environment Variables**
2. Update `VITE_SUPABASE_URL`:
   - **Old**: `http://<VM_PUBLIC_IP>:8000`
   - **New**: `https://supabase.service-mk.ru` (or `http://` if no SSL)
3. Save and **Redeploy** the application

## Verification

### Test Domain Resolution

```bash
# Test DNS resolution
nslookup supabase.service-mk.ru
nslookup api.service-mk.ru

# Should resolve to: 84.201.173.147
```

### Test API Access

```bash
# Test API endpoint
curl -I https://supabase.service-mk.ru/rest/v1/

# Should return HTTP 401 (authentication required - expected)
```

### Test from Browser

1. Visit: `https://supabase.service-mk.ru/rest/v1/`
2. Should see authentication error (expected without API key)
3. Visit your Vercel deployment
4. Verify the app connects to Supabase via domain

## Troubleshooting

### Domain Not Resolving

- **Check DNS propagation**: DNS changes can take up to 48 hours
- **Verify DNS records**: Ensure A records point to correct IP
- **Check TTL**: Lower TTL (600 seconds) helps with faster updates

### SSL Certificate Issues

- **Let's Encrypt rate limits**: Wait if you've made too many requests
- **DNS not propagated**: SSL validation requires DNS to be working
- **Port 80/443 not accessible**: Ensure firewall allows these ports

### Connection Errors

- **502 Bad Gateway**: Check NGINX Proxy Manager configuration
- **Connection refused**: Verify Supabase services are running
- **CORS errors**: Check Supabase CORS settings

### NGINX Proxy Manager Not Accessible

```bash
# Check if NGINX Proxy Manager is running
ssh <SSH_HOST_ALIAS> "sudo docker ps | grep nginx-proxy-manager"

# Check port 81 is open
ssh <SSH_HOST_ALIAS> "sudo netstat -tuln | grep :81"
```

## Security Considerations

### SSL/TLS

- ✅ **Enable SSL**: Always use HTTPS in production
- ✅ **Force SSL**: Redirect HTTP to HTTPS
- ✅ **HSTS**: Enable HTTP Strict Transport Security

### Firewall

Consider opening ports for SSL:
```bash
ssh <SSH_HOST_ALIAS> "sudo ufw allow 80/tcp    # HTTP (for Let's Encrypt)
sudo ufw allow 443/tcp   # HTTPS
sudo ufw enable"
```

## Alternative: Direct IP Access

If you prefer to keep using IP addresses:

1. **Keep current configuration** (no NGINX changes needed)
2. **Update Vercel** to use domain for better UX:
   - `VITE_SUPABASE_URL`: `https://supabase.service-mk.ru`
   - NGINX will proxy to the IP automatically

## Summary

After domain setup:
- ✅ DNS records configured
- ✅ NGINX Proxy Manager configured (if using)
- ✅ Supabase `.env` updated with domain
- ✅ Vercel environment variables updated
- ✅ Application redeployed

---

**Last Updated**: December 10, 2025

