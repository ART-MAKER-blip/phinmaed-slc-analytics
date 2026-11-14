-- Starting data for the PHINMA COC pilot. College and program names match the SIS export
-- exactly, because the importer maps the COLLEGE and COURSE columns by name.
-- Administrators add other campuses, colleges, programs and terms in the app.

INSERT INTO campus (code, name) VALUES ('COC', 'PHINMA Cagayan de Oro College');

INSERT INTO college (code, name) VALUES
  ('CITE', 'College of Information Technology Education'),
  ('CMA',  'College of Management and Accountancy'),
  ('COED', 'College of Education'),
  ('CEA',  'College of Engineering and Architecture'),
  ('CCJE', 'School of Criminology and Criminal Justice');

INSERT INTO program (college_id, code, name)
SELECT college_id, 'BSIT', 'Bachelor of Science in Information Technology' FROM college WHERE code = 'CITE';

INSERT INTO campus_program (campus_id, program_id)
SELECT c.campus_id, p.program_id FROM campus c CROSS JOIN program p WHERE c.code = 'COC';

INSERT INTO year_level (year_level_id, code, name) VALUES
  (1, 'Y1', 'First year'), (2, 'Y2', 'Second year'), (3, 'Y3', 'Third year'),
  (4, 'Y4', 'Fourth year'), (5, 'Y5', 'Fifth year');

-- SIS "SY 25-26 SEM II" = 2025-2; the collated summary "1S2627" = 2026-1.
INSERT INTO term (code, school_year, semester, name) VALUES
  ('2025-2', '2025-2026', 2, 'Second Semester 2025-2026'),
  ('2026-1', '2026-2027', 1, 'First Semester 2026-2027');

INSERT INTO grading_period (grading_period_id, code, name) VALUES
  (1, 'P1', 'Period 1'), (2, 'P2', 'Period 2'), (3, 'P3', 'Period 3');

-- SIS REMARKS values.
INSERT INTO result_status (code, description) VALUES
  ('Passed',     'Passed'),
  ('FAILED',     'Failed'),
  ('NO CREDIT',  'No credit'),
  ('INCOMPLETE', 'Incomplete');

INSERT INTO import_source (code, name) VALUES
  ('SIS',       'Student Information System grade deliberation report'),
  ('TEAM_DATA', 'Team Data');

INSERT INTO zone (zone_id, code, label, alt_label, sort_order) VALUES
  (1, 'green',  'Green',  'Safe',     1),
  (2, 'yellow', 'Yellow', 'Danger',   2),
  (3, 'red',    'Red',    'Critical', 3);

-- Shared PHINMA definitions (to be confirmed). Stays a draft until the Team Learning lead approves it.
INSERT INTO zone_rule_set (code, name, effective_term_id)
SELECT 'rs-2025-2', 'Shared PHINMA definitions (to be confirmed)', term_id FROM term WHERE code = '2025-2';

INSERT INTO zone_threshold (rule_set_id, level, zone_id, min_value, max_value)
SELECT rs.rule_set_id, t.level, z.zone_id, t.min_value, t.max_value
  FROM zone_rule_set rs
  CROSS JOIN (VALUES
    ('student', 'green',  0,     0),
    ('student', 'yellow', 1,     1),
    ('student', 'red',    2,     NULL),
    ('subject', 'green',  0,     10),
    ('subject', 'yellow', 10.01, 40),
    ('subject', 'red',    40.01, 100),
    ('teacher', 'green',  0,     10),
    ('teacher', 'yellow', 10.01, 40),
    ('teacher', 'red',    40.01, 100)
  ) AS t(level, zone_code, min_value, max_value)
  JOIN zone z ON z.code = t.zone_code
 WHERE rs.code = 'rs-2025-2';

INSERT INTO concern_type (code, name, is_academic) VALUES
  ('academic',   'Academic performance', TRUE),
  ('teaching',   'Teaching-related',     TRUE),
  ('attendance', 'Attendance',           FALSE),
  ('permit',     'Permit / financial',   FALSE),
  ('other',      'Other non-academic',   FALSE);

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
