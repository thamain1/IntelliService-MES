/*
  # Seed HVAC Standard Codes

  Populates the standard_codes table with the 11 Problem Codes
  and 11 Resolution Codes defined in HVAC_STANDARD_CODES.md
*/

-- Insert Problem Codes (Symptoms/Findings)
INSERT INTO standard_codes (code, code_type, label, description, category, severity, triggers_sales_lead, is_critical_safety, sort_order) VALUES
('NO-COOL-AIRFLOW', 'problem', 'No Cool - Airflow Issue', 'System runs, but low/no airflow. (Filter/Blower issue)', 'airflow', 5, FALSE, FALSE, 1),
('NO-COOL-COMPRESSOR', 'problem', 'No Cool - Compressor Issue', 'Fan runs, compressor silent or buzzing. (Capacitor/Seized unit)', 'electrical', 6, FALSE, FALSE, 2),
('WATER-LEAK-PRIMARY', 'problem', 'Water Leak - Primary', 'Water in drain pan or ceiling. (Clogged lines)', 'drainage', 5, FALSE, FALSE, 3),
('NO-HEAT-IGNITION', 'problem', 'No Heat - Ignition Failure', 'Furnace tries to start, then locks out. (Igniter/Flame sensor)', 'electrical', 6, FALSE, FALSE, 4),
('THERMOSTAT-BLANK', 'problem', 'Thermostat - No Power', 'No display or power to thermostat. (Tripped switch/Transformer)', 'electrical', 4, FALSE, FALSE, 5),
('NOISE-GRINDING', 'problem', 'Noise - Grinding/Mechanical', 'Imminent mechanical failure. (Motor bearings)', 'mechanical', 7, FALSE, FALSE, 6),
('SMELL-BURNING', 'problem', 'Smell - Burning/Electrical', 'Electrical hazard or seized components', 'safety', 8, FALSE, FALSE, 7),
('SMELL-GAS', 'problem', 'Smell - Gas Leak', 'CRITICAL SAFETY: Gas leak detection', 'safety', 10, FALSE, TRUE, 8),
('HIGH-BILLS', 'problem', 'High Utility Bills', 'System works but efficiency is poor. (Sales lead trigger)', 'usage', 3, TRUE, FALSE, 9),
('SYSTEM-FROZEN', 'problem', 'System Frozen/Iced', 'Ice on line or coil. (Refrigerant leak or airflow blockage)', 'refrigerant', 6, FALSE, FALSE, 10),
('AGE-CONDITION', 'problem', 'Age/Condition - End of Life', 'Routine check flags unit for replacement. (Sales lead trigger)', 'usage', 4, TRUE, FALSE, 11)
ON CONFLICT (code) DO UPDATE SET
    label = EXCLUDED.label,
    description = EXCLUDED.description,
    category = EXCLUDED.category,
    severity = EXCLUDED.severity,
    triggers_sales_lead = EXCLUDED.triggers_sales_lead,
    is_critical_safety = EXCLUDED.is_critical_safety,
    sort_order = EXCLUDED.sort_order;

-- Insert Resolution Codes (Actions Taken)
INSERT INTO standard_codes (code, code_type, label, description, category, severity, triggers_sales_lead, triggers_urgent_review, sort_order) VALUES
('RES-REFRIGERANT-CHARGE', 'resolution', 'Added Refrigerant', 'Added refrigerant (R-22 or 410A)', 'refrigerant', 5, FALSE, FALSE, 1),
('RES-CAPACITOR-REPLACE', 'resolution', 'Replaced Capacitor', 'Replaced start or run capacitor. (High-velocity part)', 'electrical', 4, FALSE, FALSE, 2),
('RES-CONTACTOR-REPLACE', 'resolution', 'Replaced Contactor', 'Replaced electrical contactor', 'electrical', 4, FALSE, FALSE, 3),
('RES-DRAIN-CLEAR-NITRO', 'resolution', 'Cleared Drain Lines', 'Cleared drain lines using Nitrogen or Vacuum', 'drainage', 3, FALSE, FALSE, 4),
('RES-CLEAN-COIL-CHEM', 'resolution', 'Chemical Coil Cleaning', 'Performed chemical wash of condenser or evaporator', 'maintenance', 3, FALSE, FALSE, 5),
('RES-MOTOR-BLOWER-ECM', 'resolution', 'Replaced Blower Motor', 'Replaced ECM or standard blower motor', 'mechanical', 6, FALSE, FALSE, 6),
('RES-LEAK-SEARCH-FOUND', 'resolution', 'Leak Search - Found', 'Performed leak search and identified source. (Pivot to Sales)', 'refrigerant', 7, TRUE, FALSE, 7),
('RES-COMPRESSOR-REPLACE', 'resolution', 'Replaced Compressor', 'Major repair - replaced compressor unit', 'mechanical', 8, FALSE, FALSE, 8),
('RES-REPLACE-SYSTEM', 'resolution', 'Full System Replacement', 'Full system swap. (The "Win" code)', 'replacement', 9, FALSE, FALSE, 9),
('RES-EDUCATE-CUSTOMER', 'resolution', 'Customer Education', 'No mechanical fix; user error or thermostat settings', 'usage', 2, FALSE, FALSE, 10),
('RES-TEMP-FIX', 'resolution', 'Temporary Fix', 'Band-aid repair. (Triggers Urgent Review for Sales/Management)', 'other', 6, FALSE, TRUE, 11)
ON CONFLICT (code) DO UPDATE SET
    label = EXCLUDED.label,
    description = EXCLUDED.description,
    category = EXCLUDED.category,
    severity = EXCLUDED.severity,
    triggers_sales_lead = EXCLUDED.triggers_sales_lead,
    triggers_urgent_review = EXCLUDED.triggers_urgent_review,
    sort_order = EXCLUDED.sort_order;
