# Security Audit Report — service-mk.ru Infrastructure

**Date**: March 3, 2026  
**Status**: Remediated  
**Severity**: Critical (breach confirmed)

---

## Executive Summary

An anonymous report on March 3, 2026 identified a critical security breach: the self-hosted Supabase Studio admin interface was publicly accessible without authentication at `http://<VM_PUBLIC_IP>:3000`. Evidence confirmed the attacker had direct access to the database and created two malicious tables (`POC BY UMA`, `antidigital_djf`). All vulnerabilities have been remediated across four stages. A fifth residual gap (Kong proxying Studio through the public API domain) was identified and closed during the audit session.

---

## 1. Breach Evidence

### Attacker-Created Tables
Two tables not present in the application schema were found and dropped:

| Table Name | Evidence |
|---|---|
| `POC BY UMA` | Proof-of-concept table — confirms attacker had DDL write access |
| `antidigital_djf` | Second attacker marker |

### Timeline
- **Dec 10, 2025**: `DELETE` statements appeared in DB logs — initially attributed to data migration, now suspected to be attacker activity
- **Dec–Feb 2026**: Attacker had persistent Studio access (PostgreSQL statement logging was disabled, making SQL queries invisible in logs)
- **Mar 3, 2026**: Anonymous breach report received; audit initiated
- **Mar 3, 2026**: All vulnerabilities confirmed and remediated within the same session

### What Was Not Compromised
- SSH access was secure throughout (key-only auth, no brute force in auth logs)
- Application user passwords (`auth.users`) were not altered by the attacker
- No evidence of data exfiltration (though cannot be confirmed without statement logging)

---

## 2. Root Cause Analysis

Five overlapping vulnerabilities created the breach:

### Vulnerability 1 — Studio Publicly Accessible (Critical)
Supabase Studio on port 3000 was bound to `0.0.0.0:3000`, making it reachable from the internet. Self-hosted Supabase Studio has **no built-in authentication** — anyone with the URL had full database admin access.

```
# Before (vulnerable)
ports:
  - "3000:3000/tcp"          # Exposed to 0.0.0.0

# After (fixed)
ports:
  - "127.0.0.1:3000:3000/tcp"  # Localhost only
```

### Vulnerability 2 — UFW Disabled (Critical)
The host-level firewall (UFW) was completely inactive. The only firewall was the Yandex Cloud Security Group, which allowed **all incoming traffic on all ports (0–65535)**. Docker bypasses UFW by injecting iptables rules directly, so even enabling UFW without Docker-aware rules would not have protected the admin ports.

### Vulnerability 3 — NGINX Proxy Manager Admin UI Exposed (High)
The NPM admin panel (port 81) was bound to `0.0.0.0:81`, publicly accessible. NPM uses default credentials on first install.

### Vulnerability 4 — Studio Accessible via Public API Domain (High)
Kong API gateway included a catch-all route (`/* → http://studio:3000/*`) that proxied all requests to Studio, including those arriving via the public domain `supabase.service-mk.ru`. While protected by HTTP Basic Auth in Kong, this created an unnecessary internet-facing entry point for the Studio admin UI.

### Vulnerability 5 — Kong Basic Auth Credentials Never Rotated (Medium)
The `DASHBOARD_PASSWORD` protecting the Studio-via-Kong route was at its installation default, making brute force trivial.

---

## 3. Remediation — All Stages Completed

### Stage 1 — Database Audit & Cleanup
- Dropped attacker tables (`POC BY UMA`, `antidigital_djf`)
- Verified all 7 application tables are present and unmodified
- Confirmed RLS is enabled with policies on all public tables
- Verified no unexpected superuser roles
- Confirmed no external connections to PostgreSQL

**Script**: `scripts/remediate/stage1-db-audit.sh`

### Stage 2 — Docker Port Hardening
Bound all admin ports to `127.0.0.1` to make them unreachable from the network even without a firewall:

| Service | Before | After |
|---|---|---|
| Supabase Studio | `0.0.0.0:3000->3000/tcp` | `127.0.0.1:3000->3000/tcp` |
| NGINX Proxy Manager admin | `0.0.0.0:81->81/tcp` | `127.0.0.1:81->81/tcp` |

**Script**: `scripts/remediate/stage2-harden-ports.sh`

### Stage 3 — UFW Firewall with Docker-aware Rules
Enabled UFW with correct rules and added `DOCKER-USER` chain rules to block admin ports at the iptables level. Docker bypasses UFW's INPUT chain, so the DOCKER-USER chain (which fires before Docker's own FORWARD rules) is the correct enforcement point.

**Allowed ports**: 22 (SSH), 80 (HTTP), 443 (HTTPS), 8000 (Supabase API Kong)  
**Internal only**: 8080 (CRM nginx, restricted to `172.16.0.0/12` Docker bridge)  
**Blocked everywhere**: 3000 (Studio), 81 (NPM admin)

**Script**: `scripts/remediate/stage3-enable-ufw.sh`

### Stage 4 — Credential Rotation
All secrets that were exposed or potentially compromised were rotated:

| Credential | Notes |
|---|---|
| `JWT_SECRET` | Master signing secret — all derived keys regenerated |
| `ANON_KEY` | Regenerated JWT (anon role), updated in Vercel and VM `.env.production` |
| `SERVICE_ROLE_KEY` | Regenerated JWT (service_role) |
| `POSTGRES_PASSWORD` | Updated in `.env` and applied to all internal DB roles via `ALTER USER` |
| `DASHBOARD_PASSWORD` | Kong basic-auth credential for Studio |

**All internal PostgreSQL roles updated**: `postgres`, `supabase_admin`, `supabase_auth_admin`, `supabase_storage_admin`, `authenticator`, `pgbouncer`

**Script**: `scripts/remediate/stage4-rotate-creds.sh`

### Stage 5 (Discovered During Audit) — Kong Studio Route Removed
During the audit session it was discovered that `supabase.service-mk.ru` still proxied to Studio via Kong's catch-all `/* → http://studio:3000/*` route. This was removed from Kong's declarative config (`volumes/api/kong.yml`) along with the DASHBOARD consumer and basicauth_credentials.

The `studio.service-mk.ru` NPM proxy host (`5.conf`) was also disabled (renamed to `5.conf.disabled`).

---

## 4. Current Security Architecture

### Defense-in-Depth: 3 Independent Layers for Admin Ports

```
Internet
    │
    ▼
Yandex Cloud Security Group
    │  Blocks: 3000, 81 (no rules for these ports)
    │  Allows: 22, 80, 443, 8000
    ▼
Host — UFW + DOCKER-USER iptables chain
    │  Blocks: 3000, 81 via DOCKER-USER
    │  Allows: 22, 80, 443, 8000, 8080 (Docker bridge only)
    ▼
Docker — Port binding to 127.0.0.1
    │  Studio: 127.0.0.1:3000 (loopback only)
    │  NPM admin: 127.0.0.1:81 (loopback only)
    ▼
Kong API Gateway
    │  No Studio route (removed)
    │  API routes only: /auth/v1/, /rest/v1/, /realtime/v1/, /storage/v1/
    ▼
Studio accessible ONLY via SSH tunnel
    ssh -L 3000:localhost:3000 yandex-vm -N
```

### Public Exposure Map (Post-Remediation)

| Endpoint | Accessible | Purpose |
|---|---|---|
| `supabase.service-mk.ru` | ✅ Public (API only) | Supabase API for app clients |
| `api.service-mk.ru` | ✅ Public (API only) | Alias for above |
| `crm.service-mk.ru` | ✅ Public | CRM frontend (Yandex VM) |
| `app.service-mk.ru` | ✅ Public | CRM frontend (Vercel) |
| `supabase.service-mk.ru/` (root) | ❌ 404 | Studio route removed from Kong |
| `studio.service-mk.ru` | ❌ Disabled | NPM proxy host disabled |
| `IP:3000` | ❌ Blocked | 3 layers of protection |
| `IP:81` | ❌ Blocked | 3 layers of protection |
| `IP:5432` | ❌ Internal | Docker-internal only |
| `localhost:3000` (tunnel) | ✅ SSH-only | Studio via SSH tunnel |
| `localhost:8181` (tunnel) | ✅ SSH-only | NPM admin via SSH tunnel |

---

## 5. Accessing Admin Interfaces

### Supabase Studio
Requires SSH private key. Studio has no login prompt — the SSH key IS the authentication.

```bash
ssh -L 3000:localhost:3000 yandex-vm -N
# Then open: http://localhost:3000
```

### NGINX Proxy Manager
```bash
ssh -L 8181:localhost:81 yandex-vm -N
# Then open: http://localhost:8181
```

---

## 6. Ongoing Security Controls

### Automated Audit
Run the security audit to verify all controls remain in place:

```bash
ssh yandex-vm "bash -s" < scripts/security-audit.sh
```

Expected result: **31 PASS, 0 WARN, 0 FAIL**

Run this after any infrastructure changes or at least monthly.

### Recommended Future Improvements

| Priority | Item |
|---|---|
| Medium | Enable PostgreSQL `log_statement = 'all'` on the `postgres` role to log all SQL queries for forensic capability |
| Medium | Add HTTP Basic Auth to Studio port directly (NGINX wrapper in front of port 3000) for password protection even over SSH tunnel |
| Low | Set up log forwarding/alerting (failed SSH attempts, unexpected DB connections) |
| Low | Rotate credentials quarterly via `scripts/remediate/stage4-rotate-creds.sh` |

---

**Audit conducted by**: Development team  
**Last updated**: March 3, 2026
