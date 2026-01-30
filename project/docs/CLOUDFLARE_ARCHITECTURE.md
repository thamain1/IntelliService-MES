# IntelliService - Cloudflare Deployment Architecture

## Overview

This document outlines the backend services and architecture required to deploy IntelliService to Cloudflare with full functionality including notifications, background jobs, and external integrations.

---

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              CLOUDFLARE                                      │
│  ┌─────────────────────┐    ┌─────────────────────────────────────────┐    │
│  │   Cloudflare Pages  │    │         Cloudflare Workers              │    │
│  │   (React Frontend)  │    │  ┌─────────────────────────────────┐   │    │
│  │                     │    │  │  API Workers                     │   │    │
│  │  - Static Assets    │    │  │  - /api/notifications/send      │   │    │
│  │  - SPA Routing      │    │  │  - /api/geocode                 │   │    │
│  │  - Edge Caching     │    │  │  - /api/routes/optimize         │   │    │
│  │                     │    │  │  - /api/contracts/renew-check   │   │    │
│  └─────────┬───────────┘    │  └─────────────────────────────────┘   │    │
│            │                │  ┌─────────────────────────────────┐   │    │
│            │                │  │  Cron Triggers (Scheduled)      │   │    │
│            │                │  │  - Daily: Contract expiry check │   │    │
│            │                │  │  - Daily: SLA breach alerts     │   │    │
│            │                │  │  - Weekly: Inventory alerts     │   │    │
│            │                │  └─────────────────────────────────┘   │    │
│            │                └──────────────────┬──────────────────────┘    │
│            │                                   │                            │
│  ┌─────────┴───────────────────────────────────┴──────────────────────┐    │
│  │                        Cloudflare KV                                │    │
│  │  - Session cache        - Rate limiting        - Feature flags     │    │
│  └────────────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      │ HTTPS
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                          EXTERNAL SERVICES                                   │
│                                                                              │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────────────────┐ │
│  │    SUPABASE     │  │    SENDGRID     │  │      GOOGLE CLOUD           │ │
│  │                 │  │                 │  │                             │ │
│  │  - PostgreSQL   │  │  - Email API    │  │  - Maps JavaScript API     │ │
│  │  - Auth         │  │  - Templates    │  │  - Geocoding API           │ │
│  │  - Realtime     │  │  - Analytics    │  │  - Directions API          │ │
│  │  - Storage      │  │                 │  │  - Routes API (optional)   │ │
│  │  - Edge Funcs   │  │                 │  │                             │ │
│  └─────────────────┘  └─────────────────┘  └─────────────────────────────┘ │
│                                                                              │
│  ┌─────────────────┐  ┌─────────────────┐                                  │
│  │     TWILIO      │  │   STRIPE (opt)  │                                  │
│  │   (Optional)    │  │                 │                                  │
│  │  - SMS API      │  │  - Payments     │                                  │
│  │  - Voice (fut.) │  │  - Invoicing    │                                  │
│  └─────────────────┘  └─────────────────┘                                  │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 1. Cloudflare Pages (Frontend)

### Purpose
Hosts the React SPA with global edge distribution.

### Configuration
```toml
# wrangler.toml (for Pages)
name = "intelliservice"
compatibility_date = "2024-01-01"

[build]
command = "npm run build"
publish = "dist"

[[redirects]]
from = "/*"
to = "/index.html"
status = 200
```

### Build Settings
| Setting | Value |
|---------|-------|
| Framework preset | Vite |
| Build command | `npm run build` |
| Build output directory | `dist` |
| Root directory | `project` |
| Node.js version | 18.x or 20.x |

### Environment Variables (Pages)
```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...
VITE_GOOGLE_MAPS_API_KEY=AIza...
VITE_APP_ENV=production
```

---

## 2. Cloudflare Workers (Backend API)

### Purpose
Serverless functions for operations that can't run client-side (sending emails, server-side API calls, scheduled jobs).

### Worker Structure
```
workers/
├── api/
│   ├── notifications/
│   │   ├── send.ts           # Send individual notification
│   │   ├── bulk.ts           # Bulk notification send
│   │   └── preferences.ts    # Get/update preferences
│   ├── contracts/
│   │   ├── check-expiring.ts # Check for expiring contracts
│   │   └── auto-renew.ts     # Process auto-renewals
│   ├── geocode/
│   │   └── address.ts        # Server-side geocoding
│   └── routes/
│       └── optimize.ts       # Route optimization with Routes API
├── cron/
│   ├── daily-contract-check.ts
│   ├── daily-sla-alerts.ts
│   └── weekly-inventory-alerts.ts
├── lib/
│   ├── supabase.ts           # Supabase client init
│   ├── sendgrid.ts           # SendGrid client init
│   └── google.ts             # Google APIs client
└── wrangler.toml
```

### Worker Configuration
```toml
# workers/wrangler.toml
name = "intelliservice-api"
main = "src/index.ts"
compatibility_date = "2024-01-01"

# KV Namespace bindings
[[kv_namespaces]]
binding = "CACHE"
id = "your-kv-namespace-id"

# Environment variables (secrets)
[vars]
APP_ENV = "production"

# Cron Triggers
[triggers]
crons = [
  "0 6 * * *",   # Daily at 6 AM UTC - Contract expiry check
  "0 7 * * *",   # Daily at 7 AM UTC - SLA breach alerts
  "0 8 * * 1"    # Weekly Monday 8 AM UTC - Inventory alerts
]

# Routes
[[routes]]
pattern = "api.intelliservice.com/*"
zone_name = "intelliservice.com"
```

### Secrets (via Wrangler CLI)
```bash
# Set secrets (not in wrangler.toml for security)
wrangler secret put SUPABASE_SERVICE_KEY
wrangler secret put SENDGRID_API_KEY
wrangler secret put GOOGLE_MAPS_SERVER_KEY
wrangler secret put TWILIO_AUTH_TOKEN  # Optional
```

---

## 3. Cloudflare KV (Key-Value Storage)

### Purpose
Fast edge caching and temporary data storage.

### Namespaces Needed
| Namespace | Purpose |
|-----------|---------|
| `CACHE` | API response caching, geocode results |
| `RATE_LIMITS` | Rate limiting per user/IP |
| `FEATURE_FLAGS` | Feature toggles without redeploy |

### Example Usage
```typescript
// Cache geocode results
await env.CACHE.put(
  `geocode:${addressHash}`,
  JSON.stringify(result),
  { expirationTtl: 86400 * 30 } // 30 days
);

// Rate limiting
const key = `rate:${userId}:notifications`;
const count = await env.RATE_LIMITS.get(key);
if (count > 100) throw new Error('Rate limited');
```

---

## 4. Supabase (Database & Auth)

### Current Usage (No Changes Needed)
- **PostgreSQL**: All application data
- **Auth**: User authentication
- **Realtime**: GPS tracking subscriptions
- **Storage**: File uploads (attachments, photos)

### Additional Tables for Notifications
```sql
-- Notification queue (for retry logic)
CREATE TABLE notification_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES profiles(id),
  channel text NOT NULL, -- 'email', 'sms', 'push'
  template text NOT NULL,
  payload jsonb NOT NULL,
  status text DEFAULT 'pending', -- pending, sent, failed
  attempts integer DEFAULT 0,
  last_attempt_at timestamptz,
  sent_at timestamptz,
  error_message text,
  created_at timestamptz DEFAULT now()
);

-- Notification log (audit trail)
CREATE TABLE notification_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES profiles(id),
  channel text NOT NULL,
  template text NOT NULL,
  recipient text NOT NULL, -- email address, phone number
  status text NOT NULL,
  external_id text, -- SendGrid message ID, etc.
  created_at timestamptz DEFAULT now()
);
```

### Supabase Edge Functions (Alternative to Workers)
You could also use Supabase Edge Functions instead of Cloudflare Workers:
```
supabase/functions/
├── send-notification/
├── check-contracts/
└── process-webhooks/
```

**Trade-off**: Supabase Edge Functions are simpler but Cloudflare Workers have better global distribution and cron triggers.

---

## 5. External Services

### 5.1 SendGrid (Email)

**Required API Endpoints:**
- `POST /v3/mail/send` - Send transactional email
- `GET /v3/templates` - List email templates (optional)

**Environment Variables:**
```env
SENDGRID_API_KEY=SG.xxxx
SENDGRID_FROM_EMAIL=notifications@yourdomain.com
SENDGRID_FROM_NAME=IntelliService
```

**Email Templates Needed:**
| Template ID | Purpose |
|-------------|---------|
| `contract-expiring` | X days until contract expires |
| `contract-renewed` | Confirmation of renewal |
| `sla-breach-alert` | SLA compliance dropped below threshold |
| `ticket-assigned` | New ticket assigned to technician |
| `ticket-updated` | Status change on ticket |
| `invoice-created` | New invoice for customer |
| `invoice-overdue` | Payment reminder |
| `inventory-low` | Reorder alert |

### 5.2 Google Cloud Platform

**APIs Required:**
| API | Purpose | Billing |
|-----|---------|---------|
| Maps JavaScript API | Frontend map display | Per load |
| Geocoding API | Address → coordinates | Per request |
| Directions API | Route display on map | Per request |
| Routes API | Accurate drive times (optional) | Per request |

**Environment Variables:**
```env
# Frontend (restricted to your domain)
VITE_GOOGLE_MAPS_API_KEY=AIza...

# Backend (IP restricted or unrestricted for Workers)
GOOGLE_MAPS_SERVER_KEY=AIza...
```

**API Restrictions Recommended:**
- Frontend key: HTTP referrer restricted to your domain
- Backend key: IP restricted or used only in Workers

### 5.3 Twilio (Optional - SMS)

**Required if enabling SMS notifications:**
```env
TWILIO_ACCOUNT_SID=AC...
TWILIO_AUTH_TOKEN=...
TWILIO_FROM_NUMBER=+1234567890
```

---

## 6. Environment Variables Summary

### Cloudflare Pages (Frontend)
```env
# Supabase
VITE_SUPABASE_URL=https://xxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...

# Google Maps
VITE_GOOGLE_MAPS_API_KEY=AIza...

# App Config
VITE_APP_ENV=production
VITE_APP_URL=https://app.intelliservice.com
```

### Cloudflare Workers (Backend)
```env
# Supabase (service role for admin operations)
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_SERVICE_KEY=eyJ...  # SECRET

# SendGrid
SENDGRID_API_KEY=SG.xxx  # SECRET
SENDGRID_FROM_EMAIL=notifications@intelliservice.com

# Google (server-side)
GOOGLE_MAPS_SERVER_KEY=AIza...  # SECRET

# Twilio (optional)
TWILIO_ACCOUNT_SID=AC...
TWILIO_AUTH_TOKEN=...  # SECRET
TWILIO_FROM_NUMBER=+1234567890

# App Config
APP_ENV=production
APP_URL=https://app.intelliservice.com
```

---

## 7. Cron Jobs (Scheduled Workers)

### Daily Contract Expiry Check (6 AM UTC)
```typescript
// cron/daily-contract-check.ts
export default {
  async scheduled(event, env, ctx) {
    // 1. Query contracts expiring in 30, 14, 7, 1 days
    // 2. Check notification preferences for each customer
    // 3. Queue email notifications
    // 4. Log results
  }
}
```

### Daily SLA Breach Alerts (7 AM UTC)
```typescript
// cron/daily-sla-alerts.ts
export default {
  async scheduled(event, env, ctx) {
    // 1. Calculate SLA metrics for all active contracts
    // 2. Find contracts below 80% compliance
    // 3. Notify account managers
    // 4. Log results
  }
}
```

### Weekly Inventory Alerts (Monday 8 AM UTC)
```typescript
// cron/weekly-inventory-alerts.ts
export default {
  async scheduled(event, env, ctx) {
    // 1. Query parts below reorder point
    // 2. Generate reorder report
    // 3. Email to inventory managers
    // 4. Log results
  }
}
```

---

## 8. Deployment Checklist

### Pre-Deployment
- [ ] Create Cloudflare account and add domain
- [ ] Create Cloudflare Pages project
- [ ] Create Cloudflare Workers project
- [ ] Create KV namespaces
- [ ] Set up SendGrid account and verify sender domain
- [ ] Enable required Google Cloud APIs
- [ ] Create Supabase notification tables

### Environment Setup
- [ ] Add all Pages environment variables
- [ ] Add all Workers secrets via `wrangler secret put`
- [ ] Configure KV namespace bindings
- [ ] Set up cron triggers

### DNS Configuration
```
Type  Name              Content
A     @                 192.0.2.1 (Cloudflare proxied)
AAAA  @                 2001:db8::1 (Cloudflare proxied)
CNAME app               your-pages-project.pages.dev
CNAME api               your-workers-project.workers.dev

# SendGrid domain verification
CNAME em1234            u1234.wl.sendgrid.net
TXT   @                 v=spf1 include:sendgrid.net ~all
```

### Post-Deployment
- [ ] Test email delivery
- [ ] Verify cron jobs are running
- [ ] Test GPS tracking Realtime subscriptions
- [ ] Verify Google Maps loads correctly
- [ ] Test notification preferences save/load
- [ ] Monitor error rates in Cloudflare dashboard

---

## 9. Cost Estimates

### Cloudflare
| Service | Free Tier | Paid |
|---------|-----------|------|
| Pages | Unlimited sites, 500 builds/mo | $20/mo for more builds |
| Workers | 100k requests/day | $5/mo + $0.50/million |
| KV | 100k reads/day, 1k writes/day | $5/mo + usage |

### External Services
| Service | Free Tier | Typical Cost |
|---------|-----------|--------------|
| Supabase | 500MB DB, 1GB storage | $25/mo Pro |
| SendGrid | 100 emails/day | $20/mo for 50k/mo |
| Google Maps | $200/mo credit | ~$50-100/mo typical |
| Twilio SMS | None | $0.0075/message |

**Estimated Monthly Total**: $100-200/mo for moderate usage

---

## 10. Security Considerations

### API Keys
- Never expose service keys in frontend code
- Use Cloudflare Workers for all server-side API calls
- Rotate keys periodically

### Rate Limiting
- Implement rate limiting in Workers using KV
- Limit notification sends per user per day
- Limit geocoding requests

### Data Protection
- All traffic over HTTPS (Cloudflare handles)
- Supabase RLS policies for data access
- Audit logging for sensitive operations

---

## Quick Start Commands

```bash
# Install Wrangler CLI
npm install -g wrangler

# Login to Cloudflare
wrangler login

# Create KV namespaces
wrangler kv:namespace create CACHE
wrangler kv:namespace create RATE_LIMITS

# Deploy Workers
cd workers
wrangler deploy

# Set secrets
wrangler secret put SUPABASE_SERVICE_KEY
wrangler secret put SENDGRID_API_KEY
wrangler secret put GOOGLE_MAPS_SERVER_KEY

# Deploy Pages (usually via Git integration)
# Connect your repo in Cloudflare Dashboard > Pages
```
