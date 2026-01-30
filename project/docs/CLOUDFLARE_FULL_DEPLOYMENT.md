# IntelliService - Full Cloudflare Deployment Architecture

## Overview

IntelliService deployed entirely on Cloudflare's platform, with Supabase as the managed database/auth backend.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                           CLOUDFLARE PLATFORM                                    │
│                                                                                  │
│  ┌──────────────────────────────────────────────────────────────────────────┐   │
│  │                         CLOUDFLARE PAGES                                  │   │
│  │                                                                           │   │
│  │   React SPA (Vite Build)                                                 │   │
│  │   - Global CDN distribution (300+ edge locations)                        │   │
│  │   - Automatic HTTPS                                                      │   │
│  │   - Preview deployments per branch                                       │   │
│  │   - Instant cache invalidation                                           │   │
│  │                                                                           │   │
│  │   URL: https://intelliservice.pages.dev                                  │   │
│  │        https://app.yourdomain.com (custom domain)                        │   │
│  └──────────────────────────────────────────────────────────────────────────┘   │
│                                          │                                       │
│                                          │ API Calls                             │
│                                          ▼                                       │
│  ┌──────────────────────────────────────────────────────────────────────────┐   │
│  │                       CLOUDFLARE WORKERS                                  │   │
│  │                                                                           │   │
│  │   Serverless API Layer (runs at edge, <50ms cold start)                  │   │
│  │                                                                           │   │
│  │   ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐         │   │
│  │   │  Notifications  │  │    Geocoding    │  │     Routes      │         │   │
│  │   │                 │  │                 │  │                 │         │   │
│  │   │ POST /send      │  │ POST /geocode   │  │ POST /optimize  │         │   │
│  │   │ POST /bulk      │  │ POST /batch     │  │ GET /directions │         │   │
│  │   │ GET /status     │  │ GET /lookup     │  │                 │         │   │
│  │   └─────────────────┘  └─────────────────┘  └─────────────────┘         │   │
│  │                                                                           │   │
│  │   ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐         │   │
│  │   │    Webhooks     │  │   Background    │  │    Reports      │         │   │
│  │   │                 │  │     Jobs        │  │                 │         │   │
│  │   │ POST /stripe    │  │ Cron triggers   │  │ POST /generate  │         │   │
│  │   │ POST /sendgrid  │  │ Queue consumers │  │ GET /export     │         │   │
│  │   │ POST /twilio    │  │                 │  │                 │         │   │
│  │   └─────────────────┘  └─────────────────┘  └─────────────────┘         │   │
│  │                                                                           │   │
│  │   URL: https://api.yourdomain.com/*                                      │   │
│  └──────────────────────────────────────────────────────────────────────────┘   │
│                                          │                                       │
│         ┌────────────────────────────────┼────────────────────────────┐         │
│         │                                │                            │         │
│         ▼                                ▼                            ▼         │
│  ┌─────────────┐                 ┌─────────────┐              ┌─────────────┐   │
│  │CLOUDFLARE KV│                 │CLOUDFLARE R2│              │  CLOUDFLARE │   │
│  │             │                 │             │              │   QUEUES    │   │
│  │ - Sessions  │                 │ - Invoices  │              │             │   │
│  │ - Cache     │                 │ - Photos    │              │ - Email Q   │   │
│  │ - Rate lim  │                 │ - Exports   │              │ - SMS Q     │   │
│  │ - Geocode $ │                 │ - Backups   │              │ - Report Q  │   │
│  └─────────────┘                 └─────────────┘              └─────────────┘   │
│                                                                                  │
└─────────────────────────────────────────────────────────────────────────────────┘
                                          │
                                          │ Database & Auth
                                          ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│                              SUPABASE                                            │
│                                                                                  │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐                 │
│  │   PostgreSQL    │  │   Supabase      │  │   Realtime      │                 │
│  │                 │  │     Auth        │  │                 │                 │
│  │ - All tables    │  │                 │  │ - GPS tracking  │                 │
│  │ - Views         │  │ - JWT tokens    │  │ - Live updates  │                 │
│  │ - RLS policies  │  │ - OAuth         │  │ - Presence      │                 │
│  │ - Functions     │  │ - MFA           │  │                 │                 │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘                 │
│                                                                                  │
│  ┌─────────────────┐                                                            │
│  │    Storage      │  Note: Can migrate file storage to Cloudflare R2          │
│  │  (or use R2)    │  if preferred - R2 is S3-compatible                       │
│  └─────────────────┘                                                            │
│                                                                                  │
└─────────────────────────────────────────────────────────────────────────────────┘
                                          │
                                          │ External APIs
                                          ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│                          EXTERNAL SERVICES                                       │
│                                                                                  │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐                 │
│  │    SendGrid     │  │     Twilio      │  │  Google Cloud   │                 │
│  │                 │  │                 │  │                 │                 │
│  │ Email delivery  │  │ SMS delivery    │  │ Maps APIs       │                 │
│  │ Templates       │  │ Voice (future)  │  │ Geocoding       │                 │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘                 │
│                                                                                  │
└─────────────────────────────────────────────────────────────────────────────────┘
```

---

## Cloudflare Services Breakdown

### 1. Cloudflare Pages (Frontend)

**What it does:** Hosts your React application globally

**Features:**
- Automatic builds from Git (GitHub, GitLab)
- Preview URLs for every pull request
- Instant rollbacks
- Built-in analytics
- 100% uptime SLA on Pro plan

**Configuration:**
```
Framework: Vite
Build command: npm run build
Output directory: dist
Node version: 18
```

**Pricing:** Free tier includes unlimited sites, 500 builds/month

---

### 2. Cloudflare Workers (Backend API)

**What it does:** Serverless functions running at the edge

**Use cases for IntelliService:**
| Worker | Purpose |
|--------|---------|
| `notifications-api` | Send emails/SMS via SendGrid/Twilio |
| `geocoding-api` | Server-side address geocoding |
| `reports-api` | Generate PDF/Excel exports |
| `webhooks` | Handle callbacks from external services |
| `cron-contracts` | Daily contract expiry checks |
| `cron-sla` | Daily SLA monitoring alerts |
| `cron-inventory` | Weekly low stock alerts |

**Pricing:**
- Free: 100,000 requests/day
- Paid: $5/month + $0.50 per million requests

---

### 3. Cloudflare KV (Key-Value Store)

**What it does:** Fast, globally distributed key-value storage

**Use cases:**
| Key Pattern | Purpose | TTL |
|-------------|---------|-----|
| `geocode:{hash}` | Cache geocoding results | 30 days |
| `session:{token}` | API session data | 24 hours |
| `ratelimit:{userId}` | Rate limiting counters | 1 hour |
| `config:{key}` | Feature flags, settings | No expiry |

**Pricing:**
- Free: 100,000 reads/day, 1,000 writes/day
- Paid: $5/month + usage

---

### 4. Cloudflare R2 (Object Storage)

**What it does:** S3-compatible object storage with zero egress fees

**Use cases:**
| Bucket | Contents |
|--------|----------|
| `invoices` | Generated PDF invoices |
| `exports` | Report exports (Excel, CSV) |
| `attachments` | Ticket photos, warranty docs |
| `backups` | Database backup files |

**Why R2 over Supabase Storage:**
- Zero egress fees (Supabase charges for bandwidth)
- S3-compatible API
- Larger file limits

**Pricing:**
- Free: 10GB storage, 1M requests/month
- Paid: $0.015/GB/month, no egress fees

---

### 5. Cloudflare Queues (Message Queue)

**What it does:** Reliable message queue for background processing

**Use cases:**
| Queue | Purpose |
|-------|---------|
| `email-queue` | Outbound email processing |
| `sms-queue` | Outbound SMS processing |
| `report-queue` | Large report generation |
| `webhook-queue` | Retry failed webhooks |

**Benefits:**
- Guaranteed delivery
- Automatic retries
- Dead letter queue for failures
- Workers consume messages

**Pricing:** $0.40 per million operations

---

## Environment Configuration

### Cloudflare Pages Environment Variables
```env
# Public (exposed to browser)
VITE_SUPABASE_URL=https://xxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...
VITE_GOOGLE_MAPS_API_KEY=AIza...
VITE_API_URL=https://api.yourdomain.com
VITE_APP_ENV=production
```

### Cloudflare Workers Secrets
```bash
# Set via Wrangler CLI (never in code)
wrangler secret put SUPABASE_SERVICE_KEY
wrangler secret put SENDGRID_API_KEY
wrangler secret put TWILIO_ACCOUNT_SID
wrangler secret put TWILIO_AUTH_TOKEN
wrangler secret put GOOGLE_MAPS_SERVER_KEY
```

### Workers Environment Bindings (wrangler.toml)
```toml
name = "intelliservice-api"
main = "src/index.ts"
compatibility_date = "2024-01-01"

# KV Namespaces
[[kv_namespaces]]
binding = "CACHE"
id = "xxx"

[[kv_namespaces]]
binding = "RATE_LIMITS"
id = "xxx"

# R2 Buckets
[[r2_buckets]]
binding = "STORAGE"
bucket_name = "intelliservice-files"

# Queues
[[queues.producers]]
binding = "EMAIL_QUEUE"
queue = "email-notifications"

[[queues.consumers]]
queue = "email-notifications"
max_batch_size = 10
max_retries = 3

# Cron Triggers
[triggers]
crons = [
  "0 6 * * *",   # Contract expiry check - 6 AM UTC
  "0 7 * * *",   # SLA alerts - 7 AM UTC
  "0 8 * * 1",   # Inventory alerts - Monday 8 AM UTC
]

# Environment variables (non-secret)
[vars]
APP_ENV = "production"
SENDGRID_FROM_EMAIL = "notifications@yourdomain.com"
TWILIO_FROM_NUMBER = "+18338545203"
```

---

## DNS Configuration

```
# Cloudflare DNS (proxied through Cloudflare)

Type    Name    Content                         Proxy
─────────────────────────────────────────────────────────
A       @       192.0.2.1                       Proxied
AAAA    @       100::                           Proxied
CNAME   app     intelliservice.pages.dev        Proxied
CNAME   api     intelliservice-api.workers.dev  Proxied
CNAME   www     app.yourdomain.com              Proxied

# SendGrid domain verification (for email deliverability)
CNAME   em1234  u1234567.wl.sendgrid.net        DNS only
TXT     @       v=spf1 include:sendgrid.net ~all
CNAME   s1._domainkey  s1.domainkey.u1234567.wl.sendgrid.net
```

---

## Project Structure for Cloudflare

```
intelliservice/
├── project/                    # React frontend (Cloudflare Pages)
│   ├── src/
│   ├── public/
│   ├── package.json
│   └── vite.config.ts
│
├── workers/                    # Cloudflare Workers (Backend)
│   ├── src/
│   │   ├── index.ts           # Main router
│   │   ├── routes/
│   │   │   ├── notifications.ts
│   │   │   ├── geocoding.ts
│   │   │   ├── reports.ts
│   │   │   └── webhooks.ts
│   │   ├── cron/
│   │   │   ├── contracts.ts
│   │   │   ├── sla.ts
│   │   │   └── inventory.ts
│   │   ├── queues/
│   │   │   ├── email.ts
│   │   │   └── sms.ts
│   │   └── lib/
│   │       ├── supabase.ts
│   │       ├── sendgrid.ts
│   │       ├── twilio.ts
│   │       └── google.ts
│   ├── wrangler.toml
│   └── package.json
│
├── supabase/                   # Database migrations
│   └── migrations/
│
└── docs/
```

---

## Deployment Pipeline

### GitHub Actions Workflow
```yaml
# .github/workflows/deploy.yml
name: Deploy to Cloudflare

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  deploy-pages:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version: '20'

      - name: Install dependencies
        run: cd project && npm ci

      - name: Build
        run: cd project && npm run build
        env:
          VITE_SUPABASE_URL: ${{ secrets.VITE_SUPABASE_URL }}
          VITE_SUPABASE_ANON_KEY: ${{ secrets.VITE_SUPABASE_ANON_KEY }}
          VITE_GOOGLE_MAPS_API_KEY: ${{ secrets.VITE_GOOGLE_MAPS_API_KEY }}

      - name: Deploy to Cloudflare Pages
        uses: cloudflare/pages-action@v1
        with:
          apiToken: ${{ secrets.CF_API_TOKEN }}
          accountId: ${{ secrets.CF_ACCOUNT_ID }}
          projectName: intelliservice
          directory: project/dist

  deploy-workers:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version: '20'

      - name: Install dependencies
        run: cd workers && npm ci

      - name: Deploy Workers
        uses: cloudflare/wrangler-action@v3
        with:
          apiToken: ${{ secrets.CF_API_TOKEN }}
          workingDirectory: workers
```

---

## Cost Estimate (Monthly)

### Cloudflare
| Service | Free Tier | Estimated Usage | Cost |
|---------|-----------|-----------------|------|
| Pages | Unlimited | N/A | $0 |
| Workers | 100k req/day | ~500k req/mo | $0-5 |
| KV | 100k reads/day | ~1M reads/mo | $0-5 |
| R2 | 10GB | ~50GB | $0.60 |
| Queues | N/A | ~100k ops | $0.04 |
| **Subtotal** | | | **$0-11** |

### Supabase
| Service | Free Tier | Estimated | Cost |
|---------|-----------|-----------|------|
| Database | 500MB | Pro plan | $25 |
| Auth | 50k MAU | Included | $0 |
| Realtime | Included | Included | $0 |
| **Subtotal** | | | **$25** |

### External Services
| Service | Estimated | Cost |
|---------|-----------|------|
| SendGrid | 10k emails/mo | $0-20 |
| Twilio SMS | 500 SMS/mo | $4 |
| Google Maps | $200 credit | $0-50 |
| **Subtotal** | | **$4-74** |

### **Total Estimated: $29-110/month**

---

## Security Checklist

### Cloudflare
- [ ] Enable Cloudflare Access for admin routes (optional)
- [ ] Configure WAF rules
- [ ] Enable Bot Fight Mode
- [ ] Set up rate limiting rules
- [ ] Configure CORS in Workers

### API Security
- [ ] Validate Supabase JWT in Workers
- [ ] Rate limit per user/IP
- [ ] Sanitize all inputs
- [ ] Log security events

### Secrets Management
- [ ] All secrets via `wrangler secret put`
- [ ] Never commit secrets to Git
- [ ] Rotate keys periodically
- [ ] Use separate keys for dev/prod

---

## Quick Start

```bash
# 1. Install Wrangler CLI
npm install -g wrangler

# 2. Login to Cloudflare
wrangler login

# 3. Create KV namespaces
wrangler kv:namespace create CACHE
wrangler kv:namespace create RATE_LIMITS

# 4. Create R2 bucket
wrangler r2 bucket create intelliservice-files

# 5. Create Queues
wrangler queues create email-notifications
wrangler queues create sms-notifications

# 6. Set secrets
wrangler secret put SUPABASE_SERVICE_KEY
wrangler secret put SENDGRID_API_KEY
wrangler secret put TWILIO_ACCOUNT_SID
wrangler secret put TWILIO_AUTH_TOKEN
wrangler secret put GOOGLE_MAPS_SERVER_KEY

# 7. Deploy Workers
cd workers && wrangler deploy

# 8. Deploy Pages (connect Git repo in Cloudflare Dashboard)
# Or manual: cd project && npm run build && wrangler pages deploy dist
```

---

## What Stays in Supabase vs Cloudflare

| Component | Location | Reason |
|-----------|----------|--------|
| PostgreSQL Database | Supabase | Complex schema, RLS, views |
| Authentication | Supabase | Built-in, JWT tokens |
| Realtime (GPS) | Supabase | WebSocket subscriptions |
| React Frontend | Cloudflare Pages | Global CDN |
| API Endpoints | Cloudflare Workers | Edge compute |
| File Storage | Cloudflare R2 | Zero egress fees |
| Background Jobs | Cloudflare Workers + Queues | Cron triggers |
| Caching | Cloudflare KV | Edge cache |
