# IntelliService Deployment Factory: Multi-Instance Blueprint

This document outlines the automated process for replicating the IntelliService platform for new, isolated clients.

## 1. Architectural Strategy: Siloed Multi-Tenancy
Each client receives:
- **Dedicated Supabase Project:** Complete isolation of Data, Auth, and Storage.
- **Dedicated Cloudflare Pages Instance:** Independent frontend URL (e.g., `clientname.intelliservice.io`).
- **Independent Build Pipeline:** Custom environment variables injected at build time.

---

## 2. The Replication Workflow

### Step A: Infrastructure Provisioning (Backend)
1. **Supabase Project Creation:**
   - Use the Supabase Management API to create a new project.
   - Retrieve `PROJECT_REF`, `API_URL`, and `SERVICE_ROLE_KEY`.
2. **Database Initialization:**
   - Link the local deployment factory to the new project: `supabase link --project-ref <REF>`
   - Apply the master migrations: `supabase db push`
   - Apply the client seed data: `psql -f scripts/seed_new_client.sql`
3. **Storage Setup:**
   - Create required buckets (`ticket-photos`, `estimate-documents`) via API.

### Step B: Application Deployment (Frontend)
1. **Environment Configuration:**
   - Create a temporary `.env.production` for the specific client:
     ```env
     VITE_SUPABASE_URL=https://<new-ref>.supabase.co
     VITE_SUPABASE_ANON_KEY=<new-anon-key>
     ```
2. **Build Process:**
   - Execute `npm run build` using the client's specific environment variables.
3. **Cloudflare Deployment:**
   - Deploy the `dist/` folder to a new Cloudflare Pages project.
   - Configure custom domain/SSL.

---

## 3. Maintenance & Fleet Updates
When the "Master Mold" is updated (new features/fixes):
1. **Schema Updates:** Iterate through all active `PROJECT_REFS` and run `supabase db push`.
2. **Frontend Updates:** Re-run the build/deploy pipeline for all instances to propagate the latest React code.

---

## 4. Automation Checklist
- [ ] Finalize `scripts/replicate_client.py` (Python wrapper for Supabase/Cloudflare APIs).
- [ ] Create `scripts/seed_new_client.sql` (Sanitized version of `seed_test_data.sql`).
- [ ] Define `clients.json` registry to track the "Fleet".
