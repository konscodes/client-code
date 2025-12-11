# SSL Certificate Setup Guide

This guide explains how to set up SSL certificates for your domains using NGINX Proxy Manager.

## Prerequisites

- Domain DNS records configured and resolving correctly
- NGINX Proxy Manager running and accessible
- Ports 80 and 443 accessible from internet (for Let's Encrypt)

## Setting Up SSL via NGINX Proxy Manager UI

### Step 1: Access NGINX Proxy Manager

1. Navigate to: `http://<VM_PUBLIC_IP>:81`
2. Login with your credentials

### Step 2: Request SSL Certificate

1. Go to **Proxy Hosts**
2. Click **Edit** on the proxy host you want to secure (e.g., `supabase.service-mk.ru`)
3. Go to the **SSL** tab
4. Under **SSL Certificate**, select **Request a new SSL Certificate with Let's Encrypt**
5. Fill in:
   - **Domain Names**: `supabase.service-mk.ru` (should be pre-filled)
   - **Email Address**: Your email for Let's Encrypt notifications
   - **Agree to Terms of Service**: ✅ Check this box
   - **Use a DNS Challenge**: Leave unchecked (use HTTP-01 challenge)
6. Click **Save**

### Step 3: Wait for Certificate

- NGINX Proxy Manager will automatically request the certificate
- This usually takes 30-60 seconds
- Check the **SSL** tab - it should show "Valid" when ready

### Step 4: Force SSL (Recommended)

1. Still in the **SSL** tab
2. Check **Force SSL** to redirect HTTP to HTTPS
3. Click **Save**

## Troubleshooting SSL Certificate Requests

### Issue: "Failed to verify domain ownership"

**Possible causes:**
- DNS not fully propagated
- Port 80 not accessible from internet
- Firewall blocking port 80

**Solutions:**
1. **Check DNS propagation:**
   ```bash
   nslookup supabase.service-mk.ru
   # Should resolve to your VM IP
   ```

2. **Check port 80 accessibility:**
   ```bash
   # From your local machine
   curl -I http://supabase.service-mk.ru/
   # Should return HTTP response (not connection refused)
   ```

3. **Check firewall:**
   ```bash
   ssh <SSH_HOST_ALIAS> "sudo ufw status"
   # Port 80 should be allowed
   ```

4. **Open port 80 if needed:**
   ```bash
   ssh <SSH_HOST_ALIAS> "sudo ufw allow 80/tcp && sudo ufw allow 443/tcp"
   ```

### Issue: "Rate limit exceeded"

**Cause:** Too many certificate requests to Let's Encrypt

**Solution:** Wait 1 hour and try again, or use a staging environment first

### Issue: "Connection refused" or "Timeout"

**Possible causes:**
- NGINX Proxy Manager not running
- Port 80/443 not mapped correctly
- Service not accessible

**Solutions:**
1. **Check NGINX Proxy Manager:**
   ```bash
   ssh <SSH_HOST_ALIAS> "sudo docker ps | grep nginx-proxy-manager"
   ```

2. **Check port mappings:**
   ```bash
   ssh <SSH_HOST_ALIAS> "sudo docker port nginx-proxy-manager"
   # Should show 80->80, 443->443
   ```

3. **Restart NGINX Proxy Manager:**
   ```bash
   ssh <SSH_HOST_ALIAS> "sudo docker restart nginx-proxy-manager"
   ```

## Alternative: Manual Certbot Installation

If NGINX Proxy Manager's Let's Encrypt doesn't work, you can use certbot directly:

### Install Certbot

```bash
ssh <SSH_HOST_ALIAS> "sudo apt update && sudo apt install -y certbot"
```

### Request Certificate

```bash
ssh <SSH_HOST_ALIAS> "sudo certbot certonly --standalone -d supabase.service-mk.ru -d api.service-mk.ru"
```

### Configure NGINX Proxy Manager

1. Go to **Certificates** in NGINX Proxy Manager
2. Click **Add SSL Certificate**
3. Select **Custom**
4. Upload the certificate files:
   - Certificate: `/etc/letsencrypt/live/supabase.service-mk.ru/fullchain.pem`
   - Private Key: `/etc/letsencrypt/live/supabase.service-mk.ru/privkey.pem`

### Auto-Renewal

Certbot certificates auto-renew, but you'll need to manually update them in NGINX Proxy Manager, or set up a script to do it automatically.

## After SSL is Configured

### Update Supabase Configuration

```bash
ssh <SSH_HOST_ALIAS> "cd ~/supabase/docker && \
  sed -i 's|^SUPABASE_PUBLIC_URL=.*|SUPABASE_PUBLIC_URL=https://supabase.service-mk.ru|' .env && \
  sudo docker compose restart auth studio"
```

### Update Vercel Environment Variables

1. Go to Vercel Dashboard → Your Project → Settings → Environment Variables
2. Update `VITE_SUPABASE_URL`:
   - **Old**: `http://supabase.service-mk.ru`
   - **New**: `https://supabase.service-mk.ru`
3. Save and **Redeploy**

## Verification

### Test HTTPS Access

```bash
# Test API endpoint
curl -I https://supabase.service-mk.ru/rest/v1/
# Should return HTTP 401 (authentication required - expected)

# Test SSL certificate
openssl s_client -connect supabase.service-mk.ru:443 -servername supabase.service-mk.ru < /dev/null 2>/dev/null | grep -A 2 "Certificate chain"
```

### Check Certificate Expiry

```bash
echo | openssl s_client -connect supabase.service-mk.ru:443 -servername supabase.service-mk.ru 2>/dev/null | openssl x509 -noout -dates
```

## Common SSL Configuration

### For Multiple Domains

If you have multiple domains pointing to the same service:
- Add all domains in the **Domain Names** field: `supabase.service-mk.ru, api.service-mk.ru`
- Request one certificate for all domains (SAN certificate)

### Certificate Renewal

Let's Encrypt certificates expire after 90 days. NGINX Proxy Manager should auto-renew them, but verify:
1. Go to **Certificates** in NGINX Proxy Manager
2. Check certificate expiry dates
3. Ensure auto-renewal is enabled

## Security Best Practices

- ✅ Always use HTTPS in production
- ✅ Enable "Force SSL" to redirect HTTP to HTTPS
- ✅ Use HSTS (HTTP Strict Transport Security) headers
- ✅ Keep certificates up to date
- ✅ Monitor certificate expiry dates

## Troubleshooting Checklist

- [ ] DNS records resolve correctly
- [ ] Port 80 is accessible from internet
- [ ] Port 443 is accessible from internet
- [ ] NGINX Proxy Manager is running
- [ ] Firewall allows ports 80 and 443
- [ ] Domain is reachable from internet
- [ ] No rate limiting from Let's Encrypt
- [ ] Email address is valid
- [ ] Terms of service are accepted

---

**Last Updated**: December 10, 2025

