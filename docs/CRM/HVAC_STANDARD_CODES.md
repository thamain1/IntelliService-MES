# HVAC Standardized Code Library

This document contains the recommended Problem and Resolution codes for the IntelliService FSM-Analytics pipeline. These codes are designed to enable Pareto analysis, Root Cause detection, and Sales Triggering.

## 1. Problem Codes (Symptoms/Findings)
*Categorizes the nature of the failure or customer report.*

1.  **NO-COOL-AIRFLOW**: System runs, but low/no airflow. (Filter/Blower issue).
2.  **NO-COOL-COMPRESSOR**: Fan runs, compressor silent or buzzing. (Capacitor/Seized unit).
3.  **WATER-LEAK-PRIMARY**: Water in drain pan or ceiling. (Clogged lines).
4.  **NO-HEAT-IGNITION**: Furnace tries to start, then locks out. (Igniter/Flame sensor).
5.  **THERMOSTAT-BLANK**: No display or power to thermostat. (Tripped switch/Transformer).
6.  **NOISE-GRINDING**: Imminent mechanical failure. (Motor bearings).
7.  **SMELL-BURNING**: Electrical hazard or seized components.
8.  **SMELL-GAS**: **Critical Safety.** Gas leak detection.
9.  **HIGH-BILLS**: System works but efficiency is poor. (Sales lead trigger).
10. **SYSTEM-FROZEN**: Ice on line or coil. (Refrigerant leak or airflow blockage).
11. **AGE-CONDITION**: Routine check flags unit for replacement. (Sales lead trigger).

---

## 2. Resolution Codes (Actions Taken)
*Categorizes what was done to resolve the problem.*

1.  **RES-REFRIGERANT-CHARGE**: Added refrigerant (R-22 or 410A).
2.  **RES-CAPACITOR-REPLACE**: Replaced start or run capacitor. (High-velocity part).
3.  **RES-CONTACTOR-REPLACE**: Replaced electrical contactor.
4.  **RES-DRAIN-CLEAR-NITRO**: Cleared drain lines using Nitrogen or Vacuum.
5.  **RES-CLEAN-COIL-CHEM**: Performed chemical wash of condenser or evaporator.
6.  **RES-MOTOR-BLOWER-ECM**: Replaced ECM or standard blower motor.
7.  **RES-LEAK-SEARCH-FOUND**: Performed leak search and identified source. (Pivot to Sales).
8.  **RES-COMPRESSOR-REPLACE**: Major repair - replaced compressor unit.
9.  **RES-REPLACE-SYSTEM**: Full system swap. (The "Win" code).
10. **RES-EDUCATE-CUSTOMER**: No mechanical fix; user error or thermostat settings.
11. **RES-TEMP-FIX**: Band-aid repair. (Triggers "Urgent Review" for Sales/Management).

---

## 3. Implementation Note
These codes should be populated into the `standard_codes` table in the database and enforced as mandatory dropdown selections in the technician's mobile application.
