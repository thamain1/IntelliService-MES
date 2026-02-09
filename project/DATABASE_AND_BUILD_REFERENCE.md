# IntelliSolutions: Database & Build Quick Reference

This document maps the Supabase project environments to their respective frontend builds and local repositories.

---

## 1. Production (Live Environment)
*   **Project Name:** `IntelliService-DunawayHVAC`
*   **Project Ref:** `trtqrdplgjgysyspwvam`
*   **Supabase URL:** `https://trtqrdplgjgysyspwvam.supabase.co`
*   **Local Repository:** `C:\dev\intelliservicebeta`
*   **GitHub Repo:** `thamain1/IntelliServiceBeta`
*   **Deployed URL:** (Cloudflare setup pending or project-specific)
*   **Focus:** Core Field Service (FSM) + AHS Warranty Module. Contains real customer data.

---

## 2. Demo (Sales & Testing Environment)
*   **Project Name:** `IntelliService-Demo`
*   **Project Ref:** `uuarbdrzfakvlhlrnwgc`
*   **Supabase URL:** `https://uuarbdrzfakvlhlrnwgc.supabase.co`
*   **Local Repository:** (Shares codebase with `intelliservicebeta`)
*   **GitHub Repo:** `thamain1/IntelliServiceBeta`
*   **Deployed URL:** `https://intelliservice-dunaway.pages.dev/`
*   **Focus:** Pure FSM features. Sanitized database (Accidental MES/Quality tables removed).

---

## 3. MES (Manufacturing Expansion Build)
*   **Project Name:** `IntelliService-MES-Dev`
*   **Project Ref:** `vijbnqrewokckwmtbbhi`
*   **Supabase URL:** `https://vijbnqrewokckwmtbbhi.supabase.co`
*   **Local Repository:** `C:\Dev\IntelliService-MES`
*   **GitHub Repo:** `thamain1/IntelliService-MES`
*   **Deployed URL:** `https://intelliservice-dunaway-hvac.pages.dev/` (Target URL)
*   **Focus:** Core FSM + Manufacturing Module (MES) + Material Handling. AHS Module is inactive (flagged off).

---

## Summary of Applied Fixes (As of Feb 6, 2026)

| Fix | Production (`trtqrdpl`) | Demo (`uuarbd`) | MES Dev (`vijbnq`) |
| :--- | :---: | :---: | :---: |
| **Inventory Deduction Fix** | ✅ Applied | ✅ Applied | ✅ Applied |
| **Estimate Conversion Visibility**| ✅ Applied | ✅ Applied | ✅ Applied |
| **AHS Warranty Schema** | ✅ Applied | ✅ Applied | ❌ Not Installed |
| **MES / Quality Cleanup** | (N/A) | ✅ Sanitized | (Target Build) |
