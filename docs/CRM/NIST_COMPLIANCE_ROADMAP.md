# NIST 800-171 Compliance Roadmap

This document outlines the specific software features and configurations required to elevate the IntelliService platform to NIST 800-171 compliance standards.

## 1. Access Control (3.1)
**Goal:** Strictly limit system access to authorized users, processes, and devices.

- [ ] **Enforce MFA (Multi-Factor Authentication):**
  - *Requirement:* NIST 3.5.3
  - *Action:* Configure Supabase Auth to **reject** login attempts for `admin` and `dispatcher` roles if a second factor (TOTP) is not verified.
- [ ] **Session Termination (Inactivity Timer):**
  - *Requirement:* NIST 3.1.11
  - *Action:* Implement a frontend "Idle Watcher" script in React.
    - If no mouse/keyboard events for 15 minutes -> Call `supabase.auth.signOut()` and redirect to login.
- [ ] **Failed Login Lockout:**
  - *Requirement:* NIST 3.1.8
  - *Action:* Configure Supabase Auth Rate Limiting to lock accounts for 30 minutes after 3 consecutive failed attempts.

## 2. Audit & Accountability (3.3)
**Goal:** Create unambiguous records of system activity.

- [ ] **Unified Security Log:**
  - *Requirement:* NIST 3.3.1
  - *Action:* Expand `activity_log` to capture Auth Events.
    - Create a Database Trigger on `auth.sessions` (Supabase system table) to copy "Login" and "Logout" events into the user-facing `activity_log`.
- [ ] **Audit Review UI:**
  - *Requirement:* NIST 3.3.5
  - *Action:* Create an "Audit Viewer" screen in `Settings` visible only to Super Admins, allowing filtering by User, Date, and Event Type.

## 3. Identification & Authentication (3.5)
**Goal:** Identify and authenticate users (or devices) before allowing access.

- [ ] **Password Complexity Policy:**
  - *Requirement:* NIST 3.5.7
  - *Action:* Update Frontend Validation and Supabase Settings to enforce:
    - Minimum 12 characters.
    - 1 Uppercase, 1 Lowercase, 1 Number, 1 Special Character.
    - Prohibit reuse of last 3 passwords (requires tracking password history hash).

## 4. System & Communications Protection (3.13)
**Goal:** Monitor, control, and protect organizational communications.

- [ ] **FIPS-Validated Encryption (Verification):**
  - *Requirement:* NIST 3.13.11
  - *Action:* Verify Supabase's encryption-at-rest implementation. Ensure `pgcrypto` functions used for sensitive data (like `tax_id_number`) use FIPS-approved algorithms (AES-256).

## 5. Configuration Management (3.4)
**Goal:** Enforce security configuration settings.

- [ ] **Least Functionality:**
  - *Requirement:* NIST 3.4.6
  - *Action:* Review all Edge Functions and RPCs. Remove any "Debug" or "Test" endpoints from the production build. Ensure the `public` schema exposes *only* the absolute minimum necessary views.

---

## Operational "Paperwork" (Non-Code Requirements)
Compliance also requires documentation. The following must be drafted:
1.  **System Security Plan (SSP):** A detailed document describing how the above controls are implemented.
2.  **Incident Response Plan (IRP):** A flowchart of actions to take in the event of a breach.
