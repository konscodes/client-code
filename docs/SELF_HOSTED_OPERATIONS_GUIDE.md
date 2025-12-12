# Self-Hosted Operations Guide

This document provides complete information about the self-hosted Supabase instance and frontend application running on Yandex Cloud.

## Overview

The application uses a **self-hosted Supabase instance** deployed on Yandex Cloud to ensure connectivity from Russia. The setup includes:
- **Frontend**: React/Vite application served via NGINX
- **Backend**: Supabase (PostgreSQL, GoTrue, PostgREST, etc.) running in Docker

## Project Structure

The deployment on the VM follows a separation of concerns:

| Directory | Purpose | Notes |
|-----------|---------|-------|
| `/opt/crm-app/repo/` | **Git Repository** | Source of truth. `git pull` updates this folder. All builds happen here. |
| `/opt/crm-app/frontend/` | **Live Frontend** | Static files served by Nginx. Copied from `repo/dist/` after build. |
| `/opt/crm-app/python-service/` | **Live Python Service** | Running application. Copied from `repo/python-service/` during deployment. |
| `/opt/crm-app/deployment/` | **Scripts** | Contains the deployment scripts. |

## Deployment

### Quick Deployment

To deploy the latest changes from the `main` branch:

```bash
ssh <SSH_HOST_ALIAS> "/opt/crm-app/deployment/deploy.sh"
```

This script automatically:
1. Pulls the latest code from GitHub to `/opt/crm-app/repo`
2. Installs/updates Node.js dependencies
3. Builds the frontend application
4. Updates the served frontend files in `/opt/crm-app/frontend`
5. Updates the Python service files in `/opt/crm-app/python-service`
6. Installs/updates Python dependencies
7. Restarts `python-docx-service` and reloads Nginx

### Manual Deployment Steps

If the automated script fails, you can perform these steps manually:

1. **SSH into the VM**:
   ```bash
   ssh <SSH_HOST_ALIAS>
   ```

2. **Navigate to the repo**:
   ```bash
   cd /opt/crm-app/repo
   ```

3. **Pull changes**:
   ```bash
   git pull origin main
   ```

4. **Run build script**:
   ```bash
   sudo /opt/crm-app/repo/deployment/pull-and-build.sh
   ```

### Logs

Deployment logs are stored in:
```bash
/opt/crm-app/logs/deployment.log
```

To view the last deployment log:
```bash
ssh <SSH_HOST_ALIAS> "tail -f /opt/crm-app/logs/deployment.log"
```

## Infrastructure

## Infrastructure

### VM Specifications

- **Provider**: Yandex Cloud
- **VM ID**: `<VM_ID>` (obtain from Yandex Cloud console)
- **Public IP**: `<VM_PUBLIC_IP>` (obtain from Yandex Cloud console)
- **Resources**:
  - RAM: 1.9GB
  - Disk: 19GB SSD
  - CPU: 2 vCPU
  - Swap: 2GB (configured)

### Network Access

- **SSH**: Port 22 (configured with SSH key)
- **API (Direct IP)**: `http://<VM_PUBLIC_IP>:8000`
- **API (Domain)**: `https://supabase.service-mk.ru` or `https://api.service-mk.ru` (both point to port 8000)
- **Studio (Direct IP only)**: `http://<VM_PUBLIC_IP>:3000` (not exposed via domain)
- **NGINX Proxy Manager**: `http://<VM_PUBLIC_IP>:81` (for domain configuration)

### SSH Access

SSH access is configured via `~/.ssh/config`:

```
Host <SSH_HOST_ALIAS>
    HostName <VM_PUBLIC_IP>
    User <VM_USERNAME>
    IdentityFile ~/.ssh/<SSH_KEY_NAME>
    StrictHostKeyChecking no
    ServerAliveInterval 60
    ServerAliveCountMax 3
```

**Note**: Replace placeholders:
- `<SSH_HOST_ALIAS>`: Your preferred SSH host alias (e.g., `yandex-vm`)
- `<VM_PUBLIC_IP>`: The VM's public IP address
- `<VM_USERNAME>`: The SSH username for the VM
- `<SSH_KEY_NAME>`: The name of your SSH private key file

Connect using:
```bash
ssh <SSH_HOST_ALIAS>
```

## Supabase Services

### Active Services

The following Supabase services are running (optimized setup):

| Service | Container Name | Port | Status | Purpose |
|---------|---------------|------|--------|---------|
| PostgreSQL | `supabase-db` | 5432 (internal) | ✅ Healthy | Core database |
| Kong | `supabase-kong` | 8000 (external) | ✅ Healthy | API Gateway |
| PostgREST | `supabase-rest` | 3000 (internal) | ✅ Running | REST API |
| GoTrue (Auth) | `supabase-auth` | 9999 (internal) | ✅ Healthy | Authentication |
| Studio | `supabase-studio` | 3000 (external) | ✅ Running | Admin UI |
| Meta | `supabase-meta` | 8080 (internal) | ✅ Healthy | Metadata service |

### Disabled Services

The following services are **disabled** to save resources (not used by the application):

- ❌ Storage (file storage not used)
- ❌ Realtime (real-time features not used)
- ❌ Edge Functions (not used)
- ❌ Image Proxy (only needed for storage)
- ❌ Analytics (optional)

## Directory Structure

On the VM, Supabase is installed at:
```
~/supabase/docker/
├── docker-compose.yml    # Main configuration
├── .env                  # Environment variables (secrets)
└── volumes/              # Persistent data
    ├── db/               # PostgreSQL data
    ├── api/              # API data
    └── logs/             # Log files
```

## Environment Configuration

### Frontend Configuration

The frontend uses the following environment variables (in `.env.local`):

```bash
VITE_SUPABASE_URL=http://<VM_PUBLIC_IP>:8000
VITE_SUPABASE_ANON_KEY=<ANON_KEY from VM .env file>
```

**Note**: Replace `<VM_PUBLIC_IP>` with your VM's public IP address and `<ANON_KEY>` with the actual anon key from `~/supabase/docker/.env` on the VM.

**Note**: The ANON_KEY is stored in `~/supabase/docker/.env` on the VM.

### Database Configuration

PostgreSQL is optimized for low RAM:
- `shared_buffers`: 256MB
- `max_connections`: 50
- `work_mem`: 8MB

## Monitoring & Maintenance

### Quick Status Check

Run the system status report:
```bash
ssh <SSH_HOST_ALIAS> "~/system-status.sh"
```

This shows:
- Resource usage (memory, disk)
- Docker service status
- Recent backups
- Monitoring log summary

### Resource Monitoring

**Check current resources:**
```bash
ssh <SSH_HOST_ALIAS> "~/check-resources.sh"
```

**Check disk space:**
```bash
ssh <SSH_HOST_ALIAS> "~/check-disk-space.sh"
```

**Check memory usage:**
```bash
ssh <SSH_HOST_ALIAS> "~/check-memory.sh"
```

**Check service health:**
```bash
ssh <SSH_HOST_ALIAS> "~/check-services.sh"
```

### Automated Monitoring

The following cron jobs run automatically:

| Task | Schedule | Script | Log File |
|------|----------|--------|----------|
| Disk space check | Every 30 min | `~/check-disk-space.sh` | `~/monitoring.log` |
| Memory check | Every 30 min | `~/check-memory.sh` | `~/monitoring.log` |
| Service health | Every 15 min | `~/check-services.sh` | `~/monitoring.log` |
| Daily backup | 2:00 AM UTC | `~/backup-database.sh` | `~/backup.log` |

**View monitoring logs:**
```bash
ssh <SSH_HOST_ALIAS> "tail -50 ~/monitoring.log"
```

**View backup logs:**
```bash
ssh <SSH_HOST_ALIAS> "tail -50 ~/backup.log"
```

### Alert Thresholds

- **Disk Usage**: Alert if >80%
- **Memory Usage**: Alert if >90%
- **Service Health**: Alert if any service is down or unhealthy

## Backup Procedures

### Automated Backups

Daily backups run automatically at 2:00 AM UTC:
- **Location**: `~/backups/`
- **Format**: `supabase_backup_YYYYMMDD_HHMMSS.sql.gz`
- **Retention**: 7 days (older backups auto-deleted)
- **Compression**: gzip (typically 500KB-1MB per backup)

### Manual Backup

To create a backup manually:
```bash
ssh <SSH_HOST_ALIAS> "~/backup-database.sh"
```

### Backup Restoration

To restore from a backup:

1. **Copy backup to VM** (if needed):
   ```bash
   scp backup_file.sql.gz <SSH_HOST_ALIAS>:~/backups/
   ```

2. **Decompress and import**:
   ```bash
   ssh <SSH_HOST_ALIAS> "cd ~/supabase/docker && \
     gunzip -c ~/backups/backup_file.sql.gz | \
     sudo docker compose exec -T db psql -U postgres -d postgres"
   ```

3. **Verify restoration**:
   ```bash
   ssh <SSH_HOST_ALIAS> "cd ~/supabase/docker && \
     sudo docker compose exec -T db psql -U postgres -d postgres -c \
     'SELECT COUNT(*) FROM clients; SELECT COUNT(*) FROM orders;'"
   ```

## Service Management

### Start/Stop Services

**Start all services:**
```bash
ssh <SSH_HOST_ALIAS> "cd ~/supabase/docker && sudo docker compose up -d"
```

**Stop all services:**
```bash
ssh <SSH_HOST_ALIAS> "cd ~/supabase/docker && sudo docker compose stop"
```

**Restart a specific service:**
```bash
ssh <SSH_HOST_ALIAS> "cd ~/supabase/docker && sudo docker compose restart <service-name>"
```

**View service logs:**
```bash
ssh <SSH_HOST_ALIAS> "cd ~/supabase/docker && sudo docker compose logs <service-name> --tail=50"
```

### Common Service Operations

**Restart PostgREST (if schema changes):**
```bash
ssh <SSH_HOST_ALIAS> "cd ~/supabase/docker && sudo docker compose restart rest"
```

**Restart Auth service:**
```bash
ssh <SSH_HOST_ALIAS> "cd ~/supabase/docker && sudo docker compose restart auth"
```

**Check service status:**
```bash
ssh <SSH_HOST_ALIAS> "cd ~/supabase/docker && sudo docker compose ps"
```

## Database Management

### Accessing the Database

**Via Docker exec:**
```bash
ssh <SSH_HOST_ALIAS> "cd ~/supabase/docker && \
  sudo docker compose exec db psql -U postgres -d postgres"
```

**Run SQL query:**
```bash
ssh <SSH_HOST_ALIAS> "cd ~/supabase/docker && \
  sudo docker compose exec -T db psql -U postgres -d postgres -c \
  'SELECT COUNT(*) FROM clients;'"
```

### Database Maintenance

**Check database size:**
```bash
ssh <SSH_HOST_ALIAS> "cd ~/supabase/docker && \
  sudo docker compose exec -T db psql -U postgres -d postgres -c \
  \"SELECT pg_size_pretty(pg_database_size('postgres'));\""
```

**List all tables:**
```bash
ssh <SSH_HOST_ALIAS> "cd ~/supabase/docker && \
  sudo docker compose exec -T db psql -U postgres -d postgres -c \
  \"\\dt public.*\""
```

**Check table row counts:**
```bash
ssh <SSH_HOST_ALIAS> "cd ~/supabase/docker && \
  sudo docker compose exec -T db psql -U postgres -d postgres -c \
  \"SELECT 'clients' as table_name, COUNT(*) as rows FROM clients \
   UNION ALL SELECT 'orders', COUNT(*) FROM orders \
   UNION ALL SELECT 'order_jobs', COUNT(*) FROM order_jobs;\""
```

### Sequence Management

The application uses PostgreSQL sequences to generate unique IDs for clients, orders, and jobs. These sequences must be kept in sync with the actual data in the database.

#### Checking Sequence Values

**View current sequence values:**
```bash
ssh <SSH_HOST_ALIAS> "cd ~/supabase/docker && \
  sudo docker compose exec -T db psql -U postgres -d postgres -c \
  \"SELECT sequencename, last_value FROM pg_sequences WHERE schemaname = 'public' ORDER BY sequencename;\""
```

**Check what the next ID will be:**
```bash
ssh <SSH_HOST_ALIAS> "cd ~/supabase/docker && \
  sudo docker compose exec -T db psql -U postgres -d postgres -c \
  \"SELECT sequencename, last_value, \
    CASE \
      WHEN sequencename = 'client_id_seq' THEN 'Next: client-' || (last_value + 1)::text \
      WHEN sequencename = 'order_id_seq' THEN 'Next: order-' || (last_value + 1)::text \
      WHEN sequencename = 'job_number_seq' THEN 'Next: job-...-' || LPAD((last_value + 1)::text, 6, '0') \
    END as next_id \
   FROM pg_sequences WHERE schemaname = 'public' ORDER BY sequencename;\""
```

**Compare sequences with actual max IDs in database:**
```bash
ssh <SSH_HOST_ALIAS> "cd ~/supabase/docker && \
  sudo docker compose exec -T db psql -U postgres -d postgres -c \
  \"SELECT \
    'clients' as table_name, \
    MAX(CAST(SUBSTRING(id FROM 'client-([0-9]+)') AS INTEGER)) as max_id, \
    (SELECT last_value FROM pg_sequences WHERE sequencename = 'client_id_seq') as sequence_value \
   FROM public.clients WHERE id ~ '^client-[0-9]+$' \
   UNION ALL \
   SELECT \
    'orders', \
    MAX(CAST(SUBSTRING(id FROM 'order-([0-9]+)') AS INTEGER)), \
    (SELECT last_value FROM pg_sequences WHERE sequencename = 'order_id_seq') \
   FROM public.orders WHERE id ~ '^order-([0-9]+)$';\""
```

#### Resetting Sequences

**When to reset sequences:**
- After deleting test records
- After data migration or restoration
- When sequence values are out of sync with database
- After bulk deletions that create gaps in numbering

**Reset all sequences to match database (recommended method):**
```bash
ssh <SSH_HOST_ALIAS> "cd ~/supabase/docker && \
  sudo docker compose exec -T db psql -U postgres -d postgres << 'SQL'
DO \$\$
DECLARE
    max_client_id INTEGER;
    max_order_id INTEGER;
    max_job_id INTEGER;
BEGIN
    -- Get max IDs from database
    SELECT COALESCE(MAX(CAST(SUBSTRING(id FROM 'client-([0-9]+)') AS INTEGER)), 0) INTO max_client_id
    FROM public.clients WHERE id ~ '^client-[0-9]+$';
    
    SELECT COALESCE(MAX(CAST(SUBSTRING(id FROM 'order-([0-9]+)') AS INTEGER)), 0) INTO max_order_id
    FROM public.orders WHERE id ~ '^order-([0-9]+)$';
    
    SELECT COALESCE(MAX(CAST(SUBSTRING(id FROM 'job-.*-([0-9]+)') AS INTEGER)), 0) INTO max_job_id
    FROM public.order_jobs WHERE id ~ '^job-.*-[0-9]+$';
    
    -- Set sequences to max values (already used), so next will be max + 1
    PERFORM setval('public.client_id_seq', max_client_id, true);
    PERFORM setval('public.order_id_seq', max_order_id, true);
    PERFORM setval('public.job_number_seq', max_job_id, true);
    
    RAISE NOTICE 'Sequences reset: client_id_seq=%, order_id_seq=%, job_number_seq=%', 
        max_client_id, max_order_id, max_job_id;
END
\$\$;
SQL
"
```

**Reset individual sequence (client):**
```bash
ssh <SSH_HOST_ALIAS> "cd ~/supabase/docker && \
  sudo docker compose exec -T db psql -U postgres -d postgres -c \
  \"SELECT setval('public.client_id_seq', \
    (SELECT COALESCE(MAX(CAST(SUBSTRING(id FROM 'client-([0-9]+)') AS INTEGER)), 0) \
     FROM public.clients WHERE id ~ '^client-[0-9]+$'), \
    true);\""
```

**Reset individual sequence (order):**
```bash
ssh <SSH_HOST_ALIAS> "cd ~/supabase/docker && \
  sudo docker compose exec -T db psql -U postgres -d postgres -c \
  \"SELECT setval('public.order_id_seq', \
    (SELECT COALESCE(MAX(CAST(SUBSTRING(id FROM 'order-([0-9]+)') AS INTEGER)), 0) \
     FROM public.orders WHERE id ~ '^order-([0-9]+)$'), \
    true);\""
```

**Reset individual sequence (job):**
```bash
ssh <SSH_HOST_ALIAS> "cd ~/supabase/docker && \
  sudo docker compose exec -T db psql -U postgres -d postgres -c \
  \"SELECT setval('public.job_number_seq', \
    (SELECT COALESCE(MAX(CAST(SUBSTRING(id FROM 'job-.*-([0-9]+)') AS INTEGER)), 0) \
     FROM public.order_jobs WHERE id ~ '^job-.*-[0-9]+$'), \
    true);\""
```

#### Testing Sequences

**Test RPC functions (this will advance sequences):**
```bash
ssh <SSH_HOST_ALIAS> "cd ~/supabase/docker && \
  sudo docker compose exec -T db psql -U postgres -d postgres -c \
  \"SELECT next_client_id() as test_client, next_order_id() as test_order;\""
```

**Note**: Testing will advance the sequences. Reset them again after testing if needed.

#### Important Notes

- **`setval(sequence, value, true)`**: The `true` parameter means the value has been used, so `nextval()` will return `value + 1`
- **`setval(sequence, value, false)`**: The `false` parameter means the value hasn't been used yet, so `nextval()` will return `value`
- Always use `true` when resetting based on max database IDs to ensure the next ID is correct
- Sequences are used by RPC functions: `next_client_id()`, `next_order_id()`, `next_job_id()`
- If sequences get out of sync, new records may get duplicate IDs or skip numbers

## User Management

### Creating Users

Users are created via the Supabase Admin API:

```bash
# Get SERVICE_ROLE_KEY from VM
SERVICE_KEY=$(ssh <SSH_HOST_ALIAS> "cd ~/supabase/docker && cat .env | grep '^SERVICE_ROLE_KEY=' | cut -d'=' -f2")

# Create user
curl -X POST 'http://<VM_PUBLIC_IP>:8000/auth/v1/admin/users' \
  -H "apikey: $SERVICE_KEY" \
  -H "Authorization: Bearer $SERVICE_KEY" \
  -H 'Content-Type: application/json' \
  -d '{
    "email": "user@example.com",
    "password": "secure-password",
    "email_confirm": true
  }'
```

**Note**: Replace `<SSH_HOST_ALIAS>` and `<VM_PUBLIC_IP>` with your actual values.

### Accessing Studio

1. Navigate to: `http://<VM_PUBLIC_IP>:3000`
2. Login with user credentials
3. Access database tables, run SQL queries, manage data

**Default admin user** (if created):
- Email: Check with team lead
- Password: Check with team lead (stored securely)

## Troubleshooting

### Service Not Starting

**Check service logs:**
```bash
ssh <SSH_HOST_ALIAS> "cd ~/supabase/docker && \
  sudo docker compose logs <service-name> --tail=50"
```

**Common issues:**
- **Database connection refused**: Check if database container is running
- **Password authentication failed**: Verify `.env` file has correct `POSTGRES_PASSWORD`
- **Port already in use**: Check if another service is using the port

### High Memory Usage

**Check memory:**
```bash
ssh <SSH_HOST_ALIAS> "free -h && ~/check-memory.sh"
```

**If memory >90%:**
1. Check which containers use most memory: `sudo docker stats`
2. Restart heavy services if needed
3. Consider increasing swap if consistently high

### High Disk Usage

**Check disk space:**
```bash
ssh <SSH_HOST_ALIAS> "df -h / && ~/check-disk-space.sh"
```

**If disk >80%:**
1. Check backup retention: `ls -lh ~/backups/`
2. Clean old backups manually if needed
3. Check Docker logs: `sudo du -sh /var/lib/docker/containers/*/*-json.log`
4. Restart Docker to apply log rotation if configured

### API Not Responding

1. **Check Kong service:**
   ```bash
   ssh <SSH_HOST_ALIAS> "cd ~/supabase/docker && sudo docker compose ps kong"
   ```

2. **Test API directly:**
   ```bash
   curl -H "apikey: <ANON_KEY>" http://<VM_PUBLIC_IP>:8000/rest/v1/
   ```

3. **Restart Kong if needed:**
   ```bash
   ssh <SSH_HOST_ALIAS> "cd ~/supabase/docker && sudo docker compose restart kong"
   ```

### Studio Not Accessible

1. **Check Studio service:**
   ```bash
   ssh <SSH_HOST_ALIAS> "cd ~/supabase/docker && sudo docker compose ps studio"
   ```

2. **Verify port is exposed:**
   ```bash
   ssh <SSH_HOST_ALIAS> "sudo docker ps | grep studio"
   ```
   Should show: `0.0.0.0:3000->3000/tcp`

3. **Check Studio logs:**
   ```bash
   ssh <SSH_HOST_ALIAS> "cd ~/supabase/docker && sudo docker compose logs studio --tail=30"
   ```

4. **Restart Studio:**
   ```bash
   ssh <SSH_HOST_ALIAS> "cd ~/supabase/docker && sudo docker compose restart studio"
   ```

### Database Connection Issues

**Check database is running:**
```bash
ssh <SSH_HOST_ALIAS> "cd ~/supabase/docker && \
  sudo docker compose exec -T db psql -U postgres -d postgres -c 'SELECT 1;'"
```

**Check database connections:**
```bash
ssh <SSH_HOST_ALIAS> "cd ~/supabase/docker && \
  sudo docker compose exec -T db psql -U postgres -d postgres -c \
  'SELECT count(*) FROM pg_stat_activity;'"
```

## Security Considerations

### Important Notes

⚠️ **This document is public** - All sensitive information has been replaced with placeholders:
- `<VM_ID>`: VM identifier from Yandex Cloud console
- `<VM_PUBLIC_IP>`: Public IP address of the VM
- `<VM_USERNAME>`: SSH username for the VM
- `<SSH_HOST_ALIAS>`: Local SSH host alias (e.g., `yandex-vm`)
- `<SSH_KEY_NAME>`: Name of SSH private key file
- `<ANON_KEY>`: Supabase anonymous key (from `.env` file on VM)
- `<SERVICE_ROLE_KEY>`: Supabase service role key (from `.env` file on VM)

**Never commit to version control:**
- Actual API keys or passwords
- SSH private keys
- Database passwords
- Service role keys
- Real IP addresses or VM IDs

### Security Best Practices

1. **SSH Keys**: Keep SSH keys secure, use strong passphrases
2. **API Keys**: Rotate keys periodically
3. **Firewall**: Consider configuring UFW firewall (currently inactive)
4. **Access Control**: Limit Studio access (consider IP restrictions)
5. **Backups**: Store backups securely, encrypt if containing sensitive data
6. **Updates**: Keep Docker images and system packages updated

### Security Checks

#### Running Security Check

A comprehensive security check script is available on the VM:

```bash
ssh <SSH_HOST_ALIAS> "~/security-check.sh"
```

This script checks:
- File permissions (`.env` should be 600 or 400)
- SSH security configuration
- Firewall status
- Docker security
- Database security settings

#### Database Security Verification

**Check RLS status:**
```bash
ssh <SSH_HOST_ALIAS> "cd ~/supabase/docker && \
  sudo docker compose exec -T db psql -U postgres -d postgres -c \
  \"SELECT schemaname, tablename, rowsecurity FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename;\""
```

**Check RLS policies:**
```bash
ssh <SSH_HOST_ALIAS> "cd ~/supabase/docker && \
  sudo docker compose exec -T db psql -U postgres -d postgres -c \
  \"SELECT schemaname, tablename, policyname, roles, cmd FROM pg_policies WHERE schemaname = 'public' ORDER BY tablename, policyname;\""
```

**Verify PostgreSQL is not exposed externally:**
```bash
ssh <SSH_HOST_ALIAS> "cd ~/supabase/docker && \
  sudo docker ps --format 'table {{.Names}}\t{{.Ports}}' | grep -E 'db|postgres'"
```

Port 5432 should NOT be mapped to the host (only accessible within Docker network).

**Check database authentication:**
```bash
ssh <SSH_HOST_ALIAS> "cd ~/supabase/docker && \
  sudo docker compose exec -T db psql -U postgres -d postgres -c \
  \"SELECT name, setting FROM pg_settings WHERE name IN ('password_encryption', 'ssl', 'ssl_min_protocol_version') ORDER BY name;\""
```

Expected:
- `password_encryption`: `scram-sha-256` (strong encryption)
- `ssl_min_protocol_version`: `TLSv1.2` or higher

#### Row Level Security (RLS)

All tables have RLS enabled with policies that allow authenticated users full access. This provides defense-in-depth security.

**RLS Status:**
- ✅ RLS enabled on all public tables
- ✅ Policies configured for `authenticated` role
- ✅ Access controlled via Supabase Auth

**Current RLS Policies:**
All tables have the policy: "Allow all for authenticated users"
- Applies to: `authenticated` role
- Permissions: ALL (SELECT, INSERT, UPDATE, DELETE)
- Condition: `true` (all authenticated users have access)

**Managing RLS Policies:**

To view all policies:
```bash
ssh <SSH_HOST_ALIAS> "cd ~/supabase/docker && \
  sudo docker compose exec -T db psql -U postgres -d postgres -c \
  \"SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check FROM pg_policies WHERE schemaname = 'public' ORDER BY tablename, policyname;\""
```

To create a new policy:
```sql
CREATE POLICY "policy_name" ON public.table_name 
  FOR ALL TO authenticated 
  USING (condition) 
  WITH CHECK (condition);
```

To drop a policy:
```sql
DROP POLICY "policy_name" ON public.table_name;
```

### Firewall Configuration (Optional)

To enable firewall:
```bash
ssh <SSH_HOST_ALIAS> "sudo ufw allow 22/tcp    # SSH
sudo ufw allow 80/tcp    # HTTP
sudo ufw allow 443/tcp   # HTTPS
sudo ufw allow 8000/tcp  # API
sudo ufw allow 3000/tcp  # Studio
sudo ufw enable"
```

## Updates & Upgrades

### Updating Supabase

1. **Backup first:**
   ```bash
   ssh <SSH_HOST_ALIAS> "~/backup-database.sh"
   ```

2. **Pull latest images:**
   ```bash
   ssh <SSH_HOST_ALIAS> "cd ~/supabase/docker && \
     sudo docker compose pull"
   ```

3. **Restart services:**
   ```bash
   ssh <SSH_HOST_ALIAS> "cd ~/supabase/docker && \
     sudo docker compose up -d"
   ```

4. **Verify services:**
   ```bash
   ssh <SSH_HOST_ALIAS> "~/check-services.sh"
   ```

### System Updates

**Update Ubuntu packages:**
```bash
ssh <SSH_HOST_ALIAS> "sudo apt update && sudo apt upgrade -y"
```

**Update Docker (if needed):**
```bash
ssh <SSH_HOST_ALIAS> "sudo apt update && sudo apt install docker-ce docker-compose-plugin"
```

## Resource Limits

### Current Resource Usage

- **Memory**: ~48-50% (951-1000MB / 1966MB)
- **Disk**: ~66% (13GB / 19GB)
- **Swap**: Minimal usage (<20MB)

### Resource Warnings

⚠️ **If resources exceed limits:**
- Memory >90%: Restart services, check for memory leaks
- Disk >80%: Clean old backups, check logs, consider increasing disk
- CPU >80% sustained: Check for heavy queries, optimize database

### Scaling Considerations

If resources become insufficient:
1. **Upgrade VM**: Increase RAM/disk in Yandex Cloud console
2. **Optimize further**: Disable Studio if not needed
3. **Monitor closely**: Use monitoring scripts to track trends

## Maintenance Schedule

### Daily
- ✅ Automated backups (2:00 AM UTC)
- ✅ Automated monitoring (every 15-30 minutes)

### Weekly
- Review monitoring logs for trends
- Check backup retention
- Verify service health

### Monthly
- Review resource usage trends
- Check disk space growth
- Update system packages (if needed)
- Review and rotate credentials (if needed)

## Quick Reference

### Quick Reference

### Essential Commands

```bash
# Deploy latest changes
ssh <SSH_HOST_ALIAS> "/opt/crm-app/deployment/deploy.sh"

# System status
ssh <SSH_HOST_ALIAS> "~/system-status.sh"

# Resource check
ssh <SSH_HOST_ALIAS> "~/check-resources.sh"

# Security check
ssh <SSH_HOST_ALIAS> "~/security-check.sh"

# Service status
ssh <SSH_HOST_ALIAS> "cd ~/supabase/docker && sudo docker compose ps"

# View logs
ssh <SSH_HOST_ALIAS> "cd ~/supabase/docker && sudo docker compose logs <service> --tail=50"

# Manual backup
ssh <SSH_HOST_ALIAS> "~/backup-database.sh"

# Restart services
ssh <SSH_HOST_ALIAS> "cd ~/supabase/docker && sudo docker compose restart"

# Check RLS status
ssh <SSH_HOST_ALIAS> "cd ~/supabase/docker && sudo docker compose exec -T db psql -U postgres -d postgres -c \"SELECT schemaname, tablename, rowsecurity FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename;\""
```

### File Locations

| Item | Location |
|------|----------|
| Repository | `/opt/crm-app/repo/` |
| Frontend App | `/opt/crm-app/frontend/` |
| Deployment Scripts | `/opt/crm-app/deployment/` |
| Deployment Logs | `/opt/crm-app/logs/` |
| Supabase config | `~/supabase/docker/` |
| Environment variables | `~/supabase/docker/.env` |
| Database data | `~/supabase/docker/volumes/db/` |
| Backups | `~/backups/` |
| Monitoring scripts | `~/check-*.sh`, `~/backup-database.sh` |
| Monitoring logs | `~/monitoring.log` |
| Backup logs | `~/backup.log` |

## Support & Contacts

For issues or questions:
1. Check this guide first
2. Review monitoring logs
3. Check service logs for errors
4. Contact team lead with specific error messages

## Change Log

### December 2025
- Initial setup of self-hosted Supabase on Yandex Cloud
- Optimized for limited resources (1.9GB RAM, 19GB disk)
- Disabled unused services (storage, realtime, functions)
- Configured monitoring and automated backups
- Fixed client `createdAt` timestamps from XML backup
- Updated migration guide with correct `ClientAddTime` logic
- Added deployment scripts and documentation

---

**Last Updated**: December 12, 2025
**Maintained By**: Development Team
