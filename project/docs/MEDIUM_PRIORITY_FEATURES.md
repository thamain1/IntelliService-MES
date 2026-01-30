# Medium Priority Features Documentation

This document covers the medium priority features implemented in IntelliService, including notifications, automations, GPS tracking, warranty management, and route optimization.

---

## Table of Contents
1. [Notification Settings](#1-notification-settings)
2. [Service Contract Automation](#2-service-contract-automation)
3. [Warranty Claims Management](#3-warranty-claims-management)
4. [Real-Time GPS Tracking](#4-real-time-gps-tracking)
5. [Address Geocoding](#5-address-geocoding)
6. [Dispatch Route Optimization](#6-dispatch-route-optimization)
7. [How It All Works Together](#7-how-it-all-works-together)
8. [Current Limitations](#8-current-limitations)

---

## 1. Notification Settings

### Location
`Settings > Notifications`

### Files
- `src/components/Settings/NotificationSettings.tsx`

### What It Does
Allows users to configure their notification preferences across different channels and event types.

### Features
- **Channel Configuration**: Email, SMS, In-App, Push notifications
- **Event Categories**:
  - Ticket updates (assignment, status changes, comments)
  - Scheduling (appointments, reminders)
  - Invoicing (new invoices, payments, overdue)
  - Inventory (low stock, reorder alerts)
  - Contract alerts (expiring, renewals)

### How Notifications Work (Current State)
**Important**: The notification settings UI is complete, but the actual notification delivery system is NOT yet implemented. Currently:

1. **Settings are saved** to user preferences (stored in Supabase)
2. **No actual notifications are sent** - this requires:
   - Email service integration (SendGrid, AWS SES, etc.)
   - SMS service integration (Twilio, etc.)
   - Push notification service (Firebase Cloud Messaging, etc.)
   - Background job processor for scheduled notifications

### Database Storage
Notification preferences are stored in the `profiles` table or a separate `notification_preferences` table (depending on implementation).

---

## 2. Service Contract Automation

### Location
`Customers > Service Contracts`

### Files
- `src/services/ContractAutomationService.ts`
- `src/components/Contracts/ServiceContractsView.tsx`
- `src/components/Contracts/ContractDetailModal.tsx`

### Features

#### 2.1 Contract Renewal Alerts
**How it works:**
1. `getExpiringContracts(daysThreshold)` queries the database for active contracts where `end_date` is within the threshold
2. Results are displayed in the "Expiring" tab with countdown badges
3. One-click renewal creates a new contract based on the existing one

```typescript
// Example: Get contracts expiring in next 60 days
const expiring = await ContractAutomationService.getExpiringContracts(60);
```

**Renewal Process:**
1. Click "Renew" on an expiring contract
2. System creates a NEW contract with:
   - Same customer, location, plan
   - Start date = old contract's end date
   - End date = 1 year from start
   - Links to previous contract via `previous_contract_id`
3. Old contract status changes to "expired"

#### 2.2 SLA Monitoring
**How it works:**
1. `getSLAMetrics(contractId?)` analyzes tickets linked to service contracts
2. Compares actual response/resolution times against contract SLA targets
3. Calculates compliance rates

```typescript
// SLA Metrics Calculation
for each ticket linked to contract:
  - responseTime = first_response_at - created_at
  - if responseTime <= contract.response_time_hours: ticketsInSLA++
  - else: ticketsBreached++

sla_compliance_rate = (ticketsInSLA / totalTickets) * 100
```

**Display:**
- "SLA Monitor" tab shows all contracts with:
  - Response time target vs actual average
  - Compliance rate with progress bar
  - Status badges (Excellent >90%, Good >80%, At Risk <80%)

#### 2.3 Quick Create from Plans
**Integration with Contract Plans (Settings > Contract Plans):**
1. Contract plans are defined in Settings with:
   - Name, description, base fee
   - Labor/parts/trip charge discounts
   - Included visits per year
   - Priority level (normal/priority/vip)
   - Response time SLA
2. ServiceContractsView loads active plans from database
3. Clicking a plan card opens the New Contract modal with plan pre-selected

#### 2.4 Email Reminders
**How it works:**
1. `formatRenewalReminderEmail(reminder)` generates email subject/body
2. Currently opens user's default email client via `mailto:` link
3. **Not automated** - requires manual click to send

---

## 3. Warranty Claims Management

### Location
`Parts > Warranty Dashboard`

### Files
- `src/services/WarrantyService.ts`
- `src/components/Parts/WarrantyDashboard.tsx`
- `src/components/Parts/WarrantyClaimModal.tsx`
- `supabase/migrations/20260129100000_create_warranty_claims.sql`

### Database Tables
```sql
warranty_claims
├── id, claim_number (auto-generated: WC-YYMM-XXXX)
├── serialized_part_id (links to serialized_parts)
├── equipment_id (links to equipment)
├── claim_type (repair/replacement/refund/labor)
├── status (draft/submitted/in_review/approved/denied/completed/cancelled)
├── description, failure_description, failure_date
├── provider_name, provider_contact, provider_phone, provider_email
├── claim_amount, approved_amount
├── submitted_date, resolution_date
└── created_by, ticket_id

warranty_claim_attachments
├── id, claim_id
├── file_name, file_type, file_size, file_url
└── description, uploaded_by
```

### Claim Lifecycle
```
draft → submitted → in_review → approved/denied → completed
                              ↘ cancelled (any stage)
```

### How It Works
1. **View Warranties**: Warranty Dashboard shows parts under warranty from `vw_warranty_tracking` view
2. **File Claim**: Click "File Claim" on any active warranty
3. **Fill Details**:
   - Select claim type
   - Choose or enter provider (pre-populated list of major HVAC manufacturers)
   - Enter failure description and date
   - Specify claim amount
4. **Save as Draft**: Claim saved but not submitted
5. **Submit Claim**: Status changes to "submitted", locked from editing
6. **Track Progress**: View all claims in "Claims" tab with status filters
7. **Attachments**: Upload supporting documents (invoices, photos)

### Common Providers (Pre-populated)
- Carrier, Trane, Lennox, Rheem, Goodman, Daikin, York, American Standard

---

## 4. Real-Time GPS Tracking

### Location
`Dispatch > Dispatch Map`

### Files
- `src/services/GeolocationService.ts`
- `src/components/Tickets/TechnicianTicketView.tsx`
- `src/hooks/useTechnicianLocations.ts`

### How It Works

#### Technician Side (Mobile/Tablet)
1. Technician opens their ticket view
2. Toggle "Share Location" switch
3. Browser requests geolocation permission
4. If granted, location updates every 60 seconds to `technician_locations` table

```typescript
// GeolocationService auto-update loop
GeolocationService.startAutoUpdates(technicianId, 60000, onUpdate, onError);

// Saves to Supabase
await supabase.from('technician_locations').upsert({
  technician_id,
  latitude,
  longitude,
  accuracy,
  heading,
  speed,
  updated_at: new Date().toISOString()
});
```

#### Dispatcher Side (Office)
1. Open Dispatch Map
2. `useTechnicianLocations` hook subscribes to Supabase Realtime
3. Map updates automatically when technicians move

```typescript
// Realtime subscription in useTechnicianLocations.ts
supabase
  .channel('technician-locations')
  .on('postgres_changes', {
    event: '*',
    schema: 'public',
    table: 'technician_locations'
  }, handleUpdate)
  .subscribe();
```

#### Status Indicators
- **Online** (green): Location updated within 5 minutes
- **Recent** (yellow): Location updated 5-30 minutes ago
- **Offline** (red): No update in 30+ minutes

---

## 5. Address Geocoding

### Location
`Customers > New Customer` (auto-geocode toggle)

### Files
- `src/services/GeocodingService.ts`
- `src/components/Customers/CustomersView.tsx`
- `src/components/Mapping/CallMapGoogle.tsx`

### How It Works

#### Auto-Geocode on Customer Creation
1. When creating a new customer with address
2. If "Auto-geocode address" is checked (default: on)
3. After customer is saved, system calls Google Geocoding API
4. Latitude/longitude stored in customer record

```typescript
// After customer insert
if (autoGeocode && formData.address && newCustomer) {
  await GeocodingService.geocodeCustomer(newCustomer.id);
}
```

#### Manual Geocoding
- Customers without coordinates won't appear on maps
- Can trigger geocoding manually if needed

#### Batch Geocoding
```typescript
// Geocode multiple customers
await GeocodingService.batchGeocodeCustomers(customerIds, (progress) => {
  console.log(`${progress.current}/${progress.total} complete`);
});
```

### Requirements
- `VITE_GOOGLE_MAPS_API_KEY` environment variable
- Google Geocoding API enabled in Google Cloud Console

---

## 6. Dispatch Route Optimization

### Location
`Dispatch > Dispatch Map > "Optimize Routes" button`

### Files
- `src/services/RouteOptimizationService.ts`
- `src/components/Mapping/DispatchMapView.tsx`

### Algorithm
Uses **Nearest Neighbor Algorithm** with priority weighting:

```
1. Separate stops by priority:
   - Emergency/High priority → Must visit first (in order)
   - Normal/Low priority → Optimize order

2. For normal/low stops, apply nearest neighbor:
   - Start at current location (or last urgent stop)
   - Find closest unvisited stop
   - Move there, repeat until all visited

3. Calculate totals:
   - Distance: Haversine formula (great-circle distance)
   - Time: Distance / 30 mph average + job duration
```

### How It Works
1. Click "Optimize Routes" button
2. System analyzes all technicians with assigned tickets
3. For each technician:
   - Gets their current location
   - Gets all assigned ticket locations
   - Calculates optimal visit order
   - Generates Google Maps directions URL
4. Results shown in modal with:
   - Per-technician route cards
   - Stop sequence with ETAs
   - "Open in Maps" button for turn-by-turn navigation
   - Total savings summary (miles/minutes)

### Features
- **Priority-based routing**: Emergency calls visited first
- **ETA calculations**: Estimated arrival time for each stop
- **Google Maps integration**: One-click to open full directions
- **Multi-technician optimization**: Optimize all routes at once

### Limitations
- Uses straight-line distance, not actual road distance
- Assumes 30 mph average speed (urban areas)
- Default 60-minute job duration
- Does not account for traffic or time windows

---

## 7. How It All Works Together

### Data Flow Example: Contract Renewal

```
1. Contract Plan created in Settings
   ↓
2. Service Contract created for customer using plan
   ↓
3. Contract linked to tickets (service_contract_id)
   ↓
4. SLA Monitoring tracks ticket response times
   ↓
5. As end_date approaches, appears in "Expiring" list
   ↓
6. Dispatcher clicks "Remind" → opens email draft
   ↓
7. Customer agrees to renew
   ↓
8. Dispatcher clicks "Renew" → new contract created
```

### Data Flow Example: Dispatch Day

```
1. Morning: Dispatcher views Dispatch Map
   ↓
2. Clicks "Optimize Routes" → gets optimal stop order
   ↓
3. Sends routes to technicians (Open in Maps)
   ↓
4. Technicians enable location sharing
   ↓
5. Map updates in real-time as techs move
   ↓
6. New urgent ticket comes in
   ↓
7. GeocodingService geocodes customer address
   ↓
8. RouteOptimizationService suggests best tech to assign
   ↓
9. Re-optimize affected technician's route
```

---

## 8. Current Limitations

### Notifications
| Feature | Status | What's Needed |
|---------|--------|---------------|
| UI Settings | ✅ Complete | - |
| Email Delivery | ❌ Not Implemented | Email service (SendGrid, etc.) |
| SMS Delivery | ❌ Not Implemented | SMS service (Twilio, etc.) |
| Push Notifications | ❌ Not Implemented | Firebase Cloud Messaging |
| Scheduled Notifications | ❌ Not Implemented | Background job processor |

### Contract Automation
| Feature | Status | What's Needed |
|---------|--------|---------------|
| Renewal Alerts (UI) | ✅ Complete | - |
| SLA Monitoring | ✅ Complete | - |
| Auto-Renewal | ❌ Manual Only | Scheduled job to auto-renew |
| Email Reminders | ⚠️ Manual | Opens mailto: link only |
| Automatic Email Send | ❌ Not Implemented | Email service integration |

### GPS Tracking
| Feature | Status | What's Needed |
|---------|--------|---------------|
| Web Browser Tracking | ✅ Complete | - |
| Native App Tracking | ⚠️ Partial | Works but drains battery |
| Background Tracking | ❌ Not Implemented | Native app with background services |
| Geofencing | ❌ Not Implemented | Would need additional development |

### Route Optimization
| Feature | Status | What's Needed |
|---------|--------|---------------|
| Basic Optimization | ✅ Complete | - |
| Traffic-Aware | ❌ Not Implemented | Google Routes API (paid) |
| Time Windows | ❌ Not Implemented | Additional algorithm work |
| Auto-Assignment | ❌ Not Implemented | Assignment suggestions exist, not automated |

---

## Next Steps (Potential Enhancements)

### High Impact
1. **Email Service Integration** - Connect SendGrid/AWS SES for actual notification delivery
2. **Background Job Processor** - Set up scheduled tasks for:
   - Auto-send renewal reminders X days before expiry
   - Daily SLA breach alerts
   - Low inventory notifications
3. **Google Routes API** - Replace Haversine with actual driving distances/times

### Medium Impact
4. **Native Mobile App** - Better GPS tracking with background support
5. **Automated Contract Renewal** - Auto-renew contracts flagged for auto-renewal
6. **Webhook Integrations** - Connect to external systems (QuickBooks, etc.)

### Nice to Have
7. **Geofencing** - Auto clock-in when technician arrives at job site
8. **AI Route Optimization** - Consider traffic, weather, skill matching
9. **Customer Portal Notifications** - Let customers see appointment reminders
