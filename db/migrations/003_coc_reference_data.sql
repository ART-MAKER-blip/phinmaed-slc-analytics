-- Reference data for the PHINMA COC pilot.
--
-- Values marked "to confirm" come from the proposal or the UI prototype and must be
-- confirmed with PHINMA during requirements gathering. Change them with a new migration,
-- never by editing this file after it has been applied.

INSERT INTO campus (code, name) VALUES ('COC', 'PHINMA Cagayan de Oro College');

-- Programs: placeholders used by the prototype (to confirm).
INSERT INTO program (code, name) VALUES
  ('BSIT',   'Bachelor of Science in Information Technology'),
  ('BSEd',   'Bachelor of Secondary Education'),
  ('BSBA',   'Bachelor of Science in Business Administration'),
  ('BSCrim', 'Bachelor of Science in Criminology');

INSERT INTO campus_program (campus_id, program_id)
SELECT c.campus_id, p.program_id FROM campus c CROSS JOIN program p WHERE c.code = 'COC';

INSERT INTO year_level (year_level_id, code, name) VALUES
  (1, 'Y1', 'First year'),
  (2, 'Y2', 'Second year'),
  (3, 'Y3', 'Third year'),
  (4, 'Y4', 'Fourth year');

-- Term dates are left empty until the academic calendar is confirmed.
INSERT INTO academic_year (label) VALUES ('2026-2027');
INSERT INTO term (academic_year_id, code, name)
SELECT academic_year_id, t.code, t.name
  FROM academic_year, (VALUES ('2026-1', 'First Semester 2026-2027'),
                              ('2026-2', 'Second Semester 2026-2027')) AS t(code, name)
 WHERE label = '2026-2027';

INSERT INTO grading_period (grading_period_id, code, name) VALUES
  (1, 'P1', 'Period 1'),
  (2, 'P2', 'Period 2'),
  (3, 'P3', 'Period 3');

-- Handling of withdrawals, incompletes and dropped subjects follows PHINMA policy (to confirm).
INSERT INTO result_status (result_status_id, code, description, counts_as_failed, counts_in_denominator) VALUES
  (1, 'PASSED',     'Passed',              FALSE, TRUE),
  (2, 'FAILED',     'Failed',              TRUE,  TRUE),
  (3, 'INC',        'Incomplete',          FALSE, TRUE),
  (4, 'DROPPED',    'Dropped',             FALSE, FALSE),
  (5, 'WITHDRAWN',  'Officially withdrawn', FALSE, FALSE),
  (6, 'NO_GRADE',   'No grade submitted',  FALSE, FALSE);

INSERT INTO import_source (code, name) VALUES
  ('SIS',       'Student Information System'),
  ('TEAM_DATA', 'Team Data');

INSERT INTO zone (zone_id, code, label, sort_order) VALUES
  (1, 'green',  'Green',  1),
  (2, 'yellow', 'Yellow', 2),
  (3, 'red',    'Red',    3);

-- Initial rule set from the shared PHINMA definitions (to confirm). It stays a draft
-- until an authorized user approves it; approval locks its thresholds.
INSERT INTO zone_rule_set (code, name, effective_term_id)
SELECT 'rs-2026-1', 'Shared PHINMA definitions (to be confirmed)', term_id
  FROM term WHERE code = '2026-1';

INSERT INTO zone_threshold (rule_set_id, level, zone_id, min_value, max_value)
SELECT rs.rule_set_id, t.level, z.zone_id, t.min_value, t.max_value
  FROM zone_rule_set rs
  CROSS JOIN (VALUES
    -- Student: number of failed subjects.
    ('student', 'green',  0,     0),
    ('student', 'yellow', 1,     1),
    ('student', 'red',    2,     NULL),
    -- Subject: failure rate in percent, rounded to 2 decimals.
    ('subject', 'green',  0,     10),
    ('subject', 'yellow', 10.01, 40),
    ('subject', 'red',    40.01, 100)
  ) AS t(level, zone_code, min_value, max_value)
  JOIN zone z ON z.code = t.zone_code
 WHERE rs.code = 'rs-2026-1';

INSERT INTO concern_type (code, name, is_academic) VALUES
  ('academic',   'Academic performance',       TRUE),
  ('teaching',   'Teaching-related',            TRUE),
  ('attendance', 'Attendance',                  FALSE),
  ('permit',     'Permit / financial',          FALSE),
  ('other',      'Other non-academic concern',  FALSE);

INSERT INTO intervention_type (code, name) VALUES
  ('remediation',  'Remediation / tutorial'),
  ('consultation', 'Student consultation'),
  ('coaching',     'Teaching coaching'),
  ('monitoring',   'Monitoring'),
  ('referral',     'Referral to support team');

INSERT INTO referral_team (code, name) VALUES
  ('ALC', 'Active Learning Coordinator'),
  ('SSP', 'Student Success Program adviser'),
  ('KSH', 'Kasama Support Hub');

-- Accounts that existed before this migration keep working at COC.
INSERT INTO user_role_scope (user_role_id, campus_id)
SELECT ur.user_role_id, c.campus_id FROM user_role ur CROSS JOIN campus c WHERE c.code = 'COC';
