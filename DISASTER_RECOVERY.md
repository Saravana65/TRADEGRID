# TRADEGRID — Production Disaster Recovery Runbook

**Target SLA Metrics:**
- **Recovery Time Objective (RTO):** $< 15$ minutes
- **Recovery Point Objective (RPO):** $< 24$ hours (daily compressed dumps) / $< 1$ hour (with MySQL binlogs)
- **Target Audience:** Site Reliability Engineers, DevOps, Platform Administrators

---

## 1. Disaster Recovery Architecture Overview

TRADEGRID operates on a resilient multi-container topology:
- **Application Tier:** Stateless Node.js / Express containers (horizontally scalable)
- **Edge Tier:** Nginx reverse proxy with automated SPA routing and WebSocket upgrade headers
- **Database Tier:** MySQL 8.0 with InnoDB ACID transactions and persistent volume mounts
- **Backup Archive:** Gzipped transactional dumps stored with 7-day daily and 4-week weekly retention

---

## 2. Disaster Recovery Scenarios & Playbooks

### Playbook A: Container Crash or Node Reboot (RTO $< 3$ minutes)

1. **Symptom:**
   - Liveness probe (`/health/liveness`) fails or returns connection refused.
2. **Action:**
   ```bash
   # Check container status
   docker compose -f docker-compose.production.yml ps

   # Inspect crash logs
   docker compose -f docker-compose.production.yml logs --tail=100 backend

   # Restart containers
   docker compose -f docker-compose.production.yml up -d
   ```
3. **Verification:**
   - Confirm `/health/liveness` returns 200 OK.
   - Confirm `/health/readiness` returns 200 OK with `database: connected`.

---

### Playbook B: Database Corruption or Accidental Table Drop (RTO $< 15$ minutes)

1. **Symptom:**
   - Readiness probe (`/health/readiness`) returns HTTP 503.
   - Knex query errors: `Table 'tradegrid.users' doesn't exist` or InnoDB corruption error.
2. **Recovery Procedure:**
   ```bash
   # Step 1: Temporarily stop backend application traffic
   docker compose -f docker-compose.production.yml stop backend

   # Step 2: Identify the latest valid backup archive
   ls -lt /backups/tradegrid_backup_tradegrid_*.sql.gz | head -n 1
   LATEST_BACKUP=$(ls -t /backups/tradegrid_backup_tradegrid_*.sql.gz | head -n 1)

   # Step 3: Restore backup into MySQL
   gunzip < "${LATEST_BACKUP}" | mysql \
     --host=127.0.0.1 \
     --port=3306 \
     --user=tradegrid_user \
     --password=tradegrid_secure_password \
     tradegrid

   # Step 4: Run startup migrations to ensure schema aligns with latest code
   npm run migrate -w apps/backend

   # Step 5: Restart backend services
   docker compose -f docker-compose.production.yml start backend
   ```
3. **Verification:**
   - Check `/health/readiness` -> HTTP 200 OK.
   - Verify ledger consistency:
     `GET /api/v1/wallet/summary` returns `isConsistentWithLedger: true`.

---

### Playbook C: Compromised Secret or Session Hijack Incident (RTO $< 5$ minutes)

1. **Symptom:**
   - An access token or refresh token is leaked, or anomalous trading signals detected.
2. **Mitigation Actions:**
   - **Step 1:** Revoke all active user sessions immediately:
     ```sql
     UPDATE user_sessions SET is_revoked = 1 WHERE is_revoked = 0;
     ```
   - **Step 2:** Rotate JWT secrets in `.env.production`:
     ```bash
     openssl rand -hex 32 # generate new JWT_ACCESS_SECRET
     openssl rand -hex 32 # generate new JWT_REFRESH_SECRET
     ```
   - **Step 3:** Perform rolling restart of backend containers:
     ```bash
     docker compose -f docker-compose.production.yml restart backend
     ```

---

## 3. Post-Recovery Verification Checklist

- [ ] Liveness probe: `curl -f http://localhost:5000/health/liveness` (200 OK)
- [ ] Readiness probe: `curl -f http://localhost:5000/health/readiness` (200 OK)
- [ ] Double-entry ledger invariant verified (no negative balances, credit/debit totals equal)
- [ ] Background queue is idle / non-draining: `queue.isDraining == false`
- [ ] Simulated market feeds publishing ticks without sequence gaps
- [ ] WebSocket connections reconnecting cleanly
